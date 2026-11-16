/**
 * Alta de instalaciones y licencias. Lógica pura + acceso a la base de Management; las pantallas
 * solo la invocan. La config del club va al repo (clients/<clientId>/), así que Management la
 * entrega para commitear junto con las variables de entorno del proyecto de Vercel.
 */
import { catalog, moduleManifests } from '@clumera/catalog';
import { clientConfigSchema, parseClientConfig, type ClientConfigInput } from '@clumera/config';
import { signLicense, type LicensePayload } from '@clumera/kernel';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PrismaClient } from './db';

const licensable = new Set(moduleManifests.map((m) => m.id));

export const installationInput = z.object({
  clientId: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/, 'Identificador: minúsculas, números y guiones (ej: club-atletico-sur)'),
  clubName: z.string().trim().min(3, 'Nombre del club: al menos 3 caracteres').max(120),
  displayName: z.string().trim().min(2).max(60),
  subdomain: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/, 'Subdominio inválido'),
  customDomain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/, 'Dominio propio inválido')
    .nullable()
    .default(null),
  modules: z.array(z.string()).default([]),
  sportsLimit: z.coerce.number().int().min(0).max(20).default(1),
  expiresAt: z.coerce.date().nullable().default(null),
});
export type InstallationInput = z.input<typeof installationInput>;

/** Módulos pedidos: deben existir y tener sus dependencias incluidas. Mensajes en español. */
export function moduleProblems(modules: string[]): string[] {
  const problems: string[] = [];
  for (const id of modules) if (!licensable.has(id)) problems.push(`Módulo desconocido: ${id}`);
  const enabled = catalog.resolveEnabled(modules);
  for (const id of modules) {
    const m = catalog.get(id);
    if (!m || enabled.has(id)) continue;
    const missing = m.dependsOn.filter((d) => !enabled.has(d)).map((d) => catalog.get(d)?.name ?? d);
    problems.push(`${m.name} necesita ${missing.join(', ')}`);
  }
  return problems;
}

const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n).trimEnd() : s);

/** client.config.json inicial del club (colores neutros; el club los ajusta después en el repo). */
export function scaffoldClientConfig(input: z.infer<typeof installationInput>): ClientConfigInput {
  const short = truncate(input.displayName, 12);
  const config: ClientConfigInput = {
    schemaVersion: 2,
    identity: {
      clientId: input.clientId,
      clubName: input.clubName,
      displayName: input.displayName,
      shortName: short,
      tagline: 'Un club, toda su comunidad.',
      footer: `${input.displayName} · Gestión del club · Información protegida.`,
    },
    domain: { subdomain: input.subdomain, customDomain: input.customDomain },
    locale: { language: 'es-AR', timeZone: 'America/Argentina/Buenos_Aires', currency: 'ARS' },
    colors: {
      primary: '#1f3149',
      primaryDeep: '#132033',
      secondary: '#39647a',
      accent: '#b8c96b',
      button: '#245e73',
      text: '#243746',
      background: '#f6f8fa',
      surface: '#ffffff',
      theme: '#1f3149',
    },
    assets: {
      logo: '/branding/logo.svg',
      emblem: '/branding/escudo.svg',
      emblemOnDark: '/branding/escudo-blanco.svg',
      favicon: '/branding/favicon.svg',
      pwaIcon192: '/icons/icon-192.png',
      pwaIcon512: '/icons/icon-512.png',
      pwaMaskable: '/icons/icon-maskable-512.png',
      appleTouchIcon: '/icons/apple-touch-icon.png',
    },
    pwa: { name: input.displayName, shortName: short, description: `La app de ${input.displayName}.` },
    login: { title: input.displayName, description: 'Ingresá para ver tu carnet, tus pagos y tus actividades.', layout: 'split' },
    modules: { visible: input.modules },
  };
  const check = parseClientConfig(clientConfigSchema.parse(config));
  if (!check.ok) throw new Error(`La config generada no es válida: ${JSON.stringify(check.error.details)}`);
  return config;
}

export interface LicenseKeys {
  privateKey: string;
  publicKey: string;
}

export function licenseKeysFromEnv(env: Record<string, string | undefined> = process.env): LicenseKeys {
  const privateKey = env.MANAGEMENT_LICENSE_PRIVATE_KEY?.trim();
  const publicKey = env.MANAGEMENT_LICENSE_PUBLIC_KEY?.trim();
  if (!privateKey || !publicKey) throw new Error('Faltan MANAGEMENT_LICENSE_PRIVATE_KEY y MANAGEMENT_LICENSE_PUBLIC_KEY (npm run license-keys -w @clumera/management)');
  return { privateKey, publicKey };
}

/** Variables de entorno del proyecto de Vercel de la instalación. Ninguna es secreta salvo las que completa quien despliega. */
export function installationEnv(clientId: string, licenseToken: string, keys: LicenseKeys, origin: string): Record<string, string> {
  return {
    CLUMERA_CLIENT_ID: clientId,
    CLUMERA_LICENSE_PUBLIC_KEY: keys.publicKey,
    CLUMERA_LICENSE: licenseToken,
    CLUMERA_PUBLIC_ORIGIN: origin,
    DATABASE_URL: '(base de Neon del club)',
    CLUMERA_DOC_PEPPER: '(32+ caracteres aleatorios, propios del club)',
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: '(npm run push:keys -w @clumera/notifications)',
    VAPID_PRIVATE_KEY: '(idem)',
    CRON_SECRET: '(32+ caracteres aleatorios)',
    RESEND_API_KEY: '(clave de Resend)',
    MAIL_FROM: `${clientId} <no-reply@clumera.app>`,
  };
}

export function createInstallationService(db: PrismaClient, keys: LicenseKeys, now: () => Date = () => new Date()) {
  async function issueLicense(installationId: string, clientId: string, modules: string[], sportsLimit: number, expiresAt: Date | null, actor: string) {
    const issuedAt = now();
    const payload: LicensePayload = {
      v: 1,
      licenseId: `lic_${randomUUID()}`,
      clientId,
      modules: [...new Set(modules)].sort(),
      limits: { sports: sportsLimit },
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt?.toISOString() ?? null,
    };
    const token = await signLicense(payload, keys.privateKey);
    return db.$transaction(async (tx) => {
      await tx.license.updateMany({ where: { installationId, revokedAt: null }, data: { revokedAt: issuedAt } });
      const license = await tx.license.create({
        data: { licenseId: payload.licenseId, installationId, modules: payload.modules, sportsLimit, issuedAt, expiresAt, token },
      });
      await tx.installationEvent.create({ data: { installationId, type: 'license.issued', actor, detail: { licenseId: payload.licenseId, modules: payload.modules, sportsLimit } } });
      return license;
    });
  }

  return {
    async create(raw: unknown, actor: string) {
      const parsed = installationInput.safeParse(raw);
      if (!parsed.success) return { ok: false as const, problems: parsed.error.issues.map((i) => i.message) };
      const input = parsed.data;
      const problems = moduleProblems(input.modules);
      const taken = await db.installation.findFirst({
        where: { OR: [{ clientId: input.clientId }, { subdomain: input.subdomain }, ...(input.customDomain ? [{ customDomain: input.customDomain }] : [])] },
      });
      if (taken) problems.push(taken.clientId === input.clientId ? 'Ese identificador ya existe' : 'Ese subdominio o dominio ya está en uso');
      if (problems.length) return { ok: false as const, problems };
      const config = scaffoldClientConfig(input);
      const installation = await db.installation.create({
        data: { clientId: input.clientId, clubName: input.clubName, displayName: input.displayName, subdomain: input.subdomain, customDomain: input.customDomain },
      });
      await db.installationEvent.create({ data: { installationId: installation.id, type: 'installation.created', actor } });
      const license = await issueLicense(installation.id, input.clientId, input.modules, input.sportsLimit, input.expiresAt, actor);
      return { ok: true as const, installation, license, config };
    },

    async reissueLicense(installationId: string, raw: { modules: string[]; sportsLimit: number; expiresAt: Date | null }, actor: string) {
      const problems = moduleProblems(raw.modules);
      if (problems.length) return { ok: false as const, problems };
      const installation = await db.installation.findUniqueOrThrow({ where: { id: installationId } });
      const license = await issueLicense(installation.id, installation.clientId, raw.modules, raw.sportsLimit, raw.expiresAt, actor);
      return { ok: true as const, license };
    },

    activeLicense(installationId: string) {
      return db.license.findFirst({ where: { installationId, revokedAt: null }, orderBy: { issuedAt: 'desc' } });
    },
  };
}
