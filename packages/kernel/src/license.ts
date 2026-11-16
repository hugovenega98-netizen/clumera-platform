/**
 * Licencias firmadas por Management (Ed25519) y verificadas por cada instalación en el
 * servidor. El token es `base64url(payload JSON).base64url(firma)`. La instalación solo
 * guarda la clave pública: no puede fabricar licencias.
 *
 * Usa WebCrypto, así que funciona igual en Route Handlers, en el proxy de Next.js y en pruebas.
 */
import { fromBase64Url, toBase64Url } from './base64url';
import { DomainError, err, ok, type Result } from './errors';
import type { ModuleId } from './modules';

export interface LicensePayload {
  v: 1;
  licenseId: string;
  clientId: string;
  modules: ModuleId[];
  limits: { sports?: number };
  issuedAt: string;
  /** null = sin vencimiento (se renueva desde Management). */
  expiresAt: string | null;
}

const ALG = { name: 'Ed25519' } as const;
const encoder = new TextEncoder();

export async function generateLicenseKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = (await crypto.subtle.generateKey(ALG, true, ['sign', 'verify'])) as CryptoKeyPair;
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const priv = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  return { publicKey: toBase64Url(pub), privateKey: toBase64Url(priv) };
}

/** Lo usa Management (y las pruebas). Nunca se llama dentro de una instalación de club. */
export async function signLicense(payload: LicensePayload, privateKey: string): Promise<string> {
  const key = await crypto.subtle.importKey('pkcs8', fromBase64Url(privateKey), ALG, false, ['sign']);
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = new Uint8Array(await crypto.subtle.sign(ALG, key, encoder.encode(body)));
  return `${body}.${toBase64Url(signature)}`;
}

export interface VerifyOptions {
  publicKey: string;
  /** La licencia tiene que ser de esta instalación. */
  clientId: string;
  now?: Date;
}

export async function verifyLicense(token: string, options: VerifyOptions): Promise<Result<LicensePayload>> {
  const invalid = (message: string) => err(new DomainError('license_invalid', message));
  const parts = token.trim().split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return invalid('Formato de licencia inválido');
  const [body, sig] = parts as [string, string];

  let valid: boolean;
  try {
    const key = await crypto.subtle.importKey('raw', fromBase64Url(options.publicKey), ALG, false, ['verify']);
    valid = await crypto.subtle.verify(ALG, key, fromBase64Url(sig), encoder.encode(body));
  } catch {
    return invalid('No se pudo verificar la firma de la licencia');
  }
  if (!valid) return invalid('La firma de la licencia no es válida');

  let payload: LicensePayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as LicensePayload;
  } catch {
    return invalid('El contenido de la licencia no es JSON válido');
  }
  if (payload.v !== 1 || !Array.isArray(payload.modules)) return invalid('Versión de licencia no soportada');
  if (payload.clientId !== options.clientId)
    return invalid(`La licencia es de ${payload.clientId}, no de esta instalación`);
  const now = options.now ?? new Date();
  if (payload.expiresAt && new Date(payload.expiresAt).getTime() <= now.getTime())
    return invalid('La licencia está vencida');
  return ok(payload);
}
