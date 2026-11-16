/** Carga desde disco. Solo en Node (build, servidor, scripts); el navegador recibe la config ya resuelta. */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { parseClientConfigOrThrow } from './parse';
import { ASSET_FIELDS, type ClientConfig } from './schema';

/** Raíz del monorepo: la primera carpeta hacia arriba que tiene turbo.json. */
export function findRepoRoot(from = process.cwd()): string {
  let dir = from;
  for (;;) {
    if (existsSync(path.join(dir, 'turbo.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return from;
    dir = parent;
  }
}

/**
 * Cada club vive en el repo como `clients/<clientId>/client.config.json` + `clients/<clientId>/public/`.
 * La instalación elige el suyo con CLUMERA_CLIENT_ID (una variable por proyecto de Vercel). Sin esa
 * variable el build falla: nunca sale con la identidad de otro club.
 */
export function clientDir(clientId = process.env.CLUMERA_CLIENT_ID?.trim(), cwd = process.cwd()): string {
  if (!clientId) throw new Error('Falta CLUMERA_CLIENT_ID (por ejemplo club-ejemplo). Ver clients/.');
  if (!/^[a-z][a-z0-9-]{1,39}$/.test(clientId)) throw new Error(`CLUMERA_CLIENT_ID inválido: ${clientId}`);
  const dir = path.join(findRepoRoot(cwd), 'clients', clientId);
  if (!existsSync(path.join(dir, 'client.config.json'))) throw new Error(`No existe clients/${clientId}/client.config.json`);
  return dir;
}

export function resolveClientConfigPath(cwd = process.cwd()): string {
  return path.join(clientDir(undefined, cwd), 'client.config.json');
}

export function loadClientConfig(file = resolveClientConfigPath()): ClientConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`No se pudo leer ${file}: ${(e as Error).message}`, { cause: e });
  }
  return parseClientConfigOrThrow(raw);
}

/** Verifica que los recursos de la config existan en la carpeta public de la app. */
export function missingAssets(cfg: ClientConfig, publicDir: string): string[] {
  return ASSET_FIELDS.filter((k) => !existsSync(path.join(publicDir, cfg.assets[k]))).map((k) => `assets.${k}: no existe ${cfg.assets[k]}`);
}

/** Verifica que el clientId del archivo coincida con su carpeta. */
export function assertConfigMatchesFolder(cfg: ClientConfig, file: string): void {
  const folder = path.basename(path.dirname(file));
  if (cfg.identity.clientId !== folder)
    throw new Error(`clients/${folder}/client.config.json declara identity.clientId=${cfg.identity.clientId}; deben coincidir`);
}

/**
 * Copia los recursos del club a la carpeta public de la app, en las rutas que usa la config.
 * Las carpetas destino se reemplazan enteras para no arrastrar logos de otro club.
 */
export function syncClientAssets(fromClientDir: string, publicDir: string): string[] {
  const source = path.join(fromClientDir, 'public');
  if (!existsSync(source)) return [];
  const copied: string[] = [];
  for (const name of ['branding', 'icons']) {
    const from = path.join(source, name);
    const to = path.join(publicDir, name);
    rmSync(to, { recursive: true, force: true });
    if (!existsSync(from)) continue;
    mkdirSync(publicDir, { recursive: true });
    cpSync(from, to, { recursive: true });
    copied.push(name);
  }
  return copied;
}
