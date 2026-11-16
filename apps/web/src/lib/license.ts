import 'server-only';
import { catalog } from '@clumera/catalog';
import { verifyLicense, type LicensePayload, type ModuleId } from '@clumera/kernel';
import { clientConfig } from './client-config';

export interface LicenseState {
  payload: LicensePayload | null;
  /** Módulos encendidos: core + licenciados con dependencias satisfechas. */
  enabled: ReadonlySet<ModuleId>;
  problem: string | null;
}

let cached: { key: string; at: number; state: Promise<LicenseState> } | null = null;
const TTL_MS = 60_000;

/**
 * Lee la licencia firmada de CLUMERA_LICENSE y la verifica con CLUMERA_LICENSE_PUBLIC_KEY.
 * Sin licencia válida quedan solo los módulos core: fallar cerrado, nunca abierto.
 */
export function getLicenseState(env: Record<string, string | undefined> = process.env, now = Date.now()): Promise<LicenseState> {
  const token = env.CLUMERA_LICENSE?.trim() ?? '';
  const publicKey = env.CLUMERA_LICENSE_PUBLIC_KEY?.trim() ?? '';
  const key = `${token}|${publicKey}`;
  if (cached && cached.key === key && now - cached.at < TTL_MS) return cached.state;
  const state = resolve(token, publicKey);
  cached = { key, at: now, state };
  return state;
}

async function resolve(token: string, publicKey: string): Promise<LicenseState> {
  const coreOnly = (problem: string | null): LicenseState => ({ payload: null, enabled: catalog.resolveEnabled([]), problem });
  if (!token) return coreOnly(null);
  if (!publicKey) return coreOnly('Falta CLUMERA_LICENSE_PUBLIC_KEY');
  const r = await verifyLicense(token, { publicKey, clientId: clientConfig.identity.clientId });
  if (!r.ok) return coreOnly(r.error.message);
  return { payload: r.value, enabled: catalog.resolveEnabled(r.value.modules), problem: null };
}
