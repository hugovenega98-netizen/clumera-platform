#!/usr/bin/env node
/**
 * Reglas de dependencia del monorepo (plan Clumera 2.0, «Arquitectura del monorepo»).
 * Cada workspace declara su capa en package.json → "clumera": { "layer": ... }.
 *
 *   kernel   no depende de ningún otro paquete @clumera.
 *   service  solo kernel y otros servicios; nunca módulos.
 *   module   solo kernel y servicios; nunca otro módulo (se hablan por eventos).
 *   catalog  reúne manifiestos: kernel, servicios y módulos.
 *   app      cualquier cosa. Solo las apps importan Next.js.
 *
 * También verifica que todo import @clumera/* esté declarado en dependencies.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const rootPkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const LAYERS = ['kernel', 'service', 'module', 'catalog', 'app'];
const ALLOWED = {
  kernel: [],
  service: ['kernel', 'service'],
  module: ['kernel', 'service'],
  catalog: ['kernel', 'service', 'module'],
  app: ['kernel', 'service', 'module', 'catalog'],
};

function workspaceDirs() {
  const dirs = [];
  for (const pattern of rootPkg.workspaces) {
    const base = path.join(root, pattern.replace(/\/\*$/, ''));
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base)) {
      const dir = path.join(base, name);
      if (statSync(dir).isDirectory() && existsSync(path.join(dir, 'package.json'))) dirs.push(dir);
    }
  }
  return dirs;
}

function sourceFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      if (['node_modules', '.next', 'dist', 'generated', '.turbo'].includes(name)) continue;
      const p = path.join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx|mts|js|mjs)$/.test(name)) out.push(p);
    }
  };
  walk(dir);
  return out;
}

const IMPORT = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;

const workspaces = new Map();
for (const dir of workspaceDirs()) {
  const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
  workspaces.set(pkg.name, { dir, pkg, layer: pkg.clumera?.layer });
}

const problems = [];
const rel = (p) => path.relative(root, p);

for (const [name, ws] of workspaces) {
  if (!LAYERS.includes(ws.layer)) {
    problems.push(`${name}: falta "clumera.layer" (${LAYERS.join(', ')}) en package.json`);
    continue;
  }
  const declared = new Set([...Object.keys(ws.pkg.dependencies ?? {}), ...Object.keys(ws.pkg.peerDependencies ?? {})]);
  for (const dep of declared) {
    const target = workspaces.get(dep);
    if (!target) continue;
    if (!ALLOWED[ws.layer].includes(target.layer))
      problems.push(`${name} (${ws.layer}) no puede depender de ${dep} (${target.layer})`);
  }
  for (const file of sourceFiles(ws.dir)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(IMPORT)) {
      const spec = m[1] ?? m[2] ?? m[3];
      const pkgName = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
      if (pkgName === 'next' && ws.layer !== 'app') problems.push(`${rel(file)}: solo las apps importan Next.js (${spec})`);
      if (pkgName.startsWith('@clumera/') && pkgName !== name) {
        const target = workspaces.get(pkgName);
        if (!target) problems.push(`${rel(file)}: ${pkgName} no existe`);
        else if (!ALLOWED[ws.layer].includes(target.layer)) problems.push(`${rel(file)}: un ${ws.layer} no puede importar ${pkgName} (${target.layer})`);
        else if (!declared.has(pkgName)) problems.push(`${rel(file)}: importa ${pkgName} sin declararlo en dependencies`);
      }
      // Ningún paquete importa el código fuente de otro por ruta relativa.
      if (spec.startsWith('.')) {
        const resolved = path.resolve(path.dirname(file), spec);
        if (!resolved.startsWith(ws.dir + path.sep)) problems.push(`${rel(file)}: importa fuera de su paquete (${spec})`);
      }
    }
  }
}

if (problems.length) {
  console.error(`✗ Reglas de dependencia: ${problems.length} problema(s)\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}
console.log(`✓ Reglas de dependencia: ${workspaces.size} paquetes en orden`);
