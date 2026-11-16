/** Carga desde disco. Solo en Node (build, servidor, scripts); el navegador recibe la config ya resuelta. */
import { existsSync, readFileSync } from 'node:fs';
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
 * Ubicación de la config de esta instalación: CLUMERA_CLIENT_CONFIG (relativa a la raíz del repo)
 * o client.config.json en la raíz. Nunca cae en el ejemplo sin pedirlo: un build de club sin su
 * config tiene que fallar, no salir con la identidad de otro.
 */
export function resolveClientConfigPath(cwd = process.cwd()): string {
  const root = findRepoRoot(cwd);
  const fromEnv = process.env.CLUMERA_CLIENT_CONFIG?.trim();
  if (fromEnv) return path.resolve(root, fromEnv);
  const file = path.join(root, 'client.config.json');
  if (existsSync(file)) return file;
  throw new Error('No se encontró client.config.json. Copiá client.config.example.json o definí CLUMERA_CLIENT_CONFIG.');
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
