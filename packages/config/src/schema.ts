/**
 * Contrato de client.config.json, versión 2. Adapta el de clumera-cmp (v1) y lo amplía
 * con dominio y módulos visibles. Define la identidad de UNA instalación: nombre, colores,
 * logos, textos, dominio y qué módulos se muestran. No guarda secretos ni licencias:
 * la licencia llega firmada por Management y se valida en el servidor.
 */
import { z } from 'zod';

const text = (label: string) => z.string({ error: `${label}: debe ser un texto` }).trim().min(1, `${label}: no puede estar vacío`);
const hex = (label: string) => z.string().regex(/^#[0-9a-fA-F]{6}$/, `${label}: debe ser hexadecimal #RRGGBB`);
const asset = (label: string) =>
  z
    .string()
    .regex(/^\/[a-zA-Z0-9_./-]+\.(?:png|jpg|jpeg|webp|svg|ico)$/, `${label}: ruta inválida; usá /branding/archivo.png`)
    .refine((v) => !v.includes('..') && !v.includes('//'), `${label}: ruta inválida`);

export const COLOR_FIELDS = [
  'primary',
  'primaryDeep',
  'secondary',
  'accent',
  'button',
  'text',
  'background',
  'surface',
  'theme',
] as const;

export const ASSET_FIELDS = ['logo', 'emblem', 'emblemOnDark', 'favicon', 'pwaIcon192', 'pwaIcon512', 'pwaMaskable', 'appleTouchIcon'] as const;

const SECRET_KEYS = ['password', 'secret', 'token', 'databaseUrl', 'pepper', 'vapid', 'license', 'privateKey', 'accessToken'];

export const clientConfigSchema = z
  .object({
    schemaVersion: z.literal(2, { error: 'schemaVersion debe ser 2' }),
    identity: z.object({
      clientId: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/, 'identity.clientId: usá un identificador estable (ej: club-ejemplo)'),
      clubName: text('identity.clubName'),
      displayName: text('identity.displayName'),
      shortName: text('identity.shortName').max(12, 'identity.shortName: máximo 12 caracteres (se ve bajo el ícono de la app)'),
      tagline: text('identity.tagline'),
      footer: text('identity.footer'),
    }),
    domain: z.object({
      /** Subdominio básico incluido: <subdomain>.clumera.app */
      subdomain: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/, 'domain.subdomain: minúsculas, números y guiones'),
      /** Dominio propio, servicio opcional contratado. */
      customDomain: z
        .string()
        .regex(/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/, 'domain.customDomain: dominio inválido')
        .nullable()
        .default(null),
    }),
    locale: z.object({
      language: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/).default('es-AR'),
      timeZone: z.string().min(1).default('America/Argentina/Buenos_Aires'),
      currency: z.string().regex(/^[A-Z]{3}$/).default('ARS'),
    }).default({ language: 'es-AR', timeZone: 'America/Argentina/Buenos_Aires', currency: 'ARS' }),
    colors: z.object(Object.fromEntries(COLOR_FIELDS.map((k) => [k, hex(`colors.${k}`)])) as Record<(typeof COLOR_FIELDS)[number], z.ZodString>),
    assets: z.object(Object.fromEntries(ASSET_FIELDS.map((k) => [k, asset(`assets.${k}`)])) as Record<(typeof ASSET_FIELDS)[number], z.ZodString>),
    pwa: z.object({
      name: text('pwa.name'),
      shortName: text('pwa.shortName').max(12, 'pwa.shortName: máximo 12 caracteres'),
      description: text('pwa.description'),
      /** Pantalla con la que abre la app instalada. Por defecto, el inicio. */
      startPath: z
        .string()
        .regex(/^\/(?!\/)[\w\-/]*$/, 'pwa.startPath: una ruta del mismo sitio, por ejemplo /')
        .default('/'),
    }),
    login: z.object({
      title: text('login.title'),
      description: text('login.description'),
      layout: z.enum(['split', 'centered'], { error: 'login.layout debe ser split o centered' }),
    }),
    modules: z.object({
      /**
       * Módulos que el club quiere mostrar. Mostrar no es licenciar: un módulo visible sin
       * licencia no aparece; uno licenciado pero no visible queda oculto en la navegación.
       */
      visible: z.array(z.string().regex(/^[a-z][a-z0-9-]{1,30}$/)).default([]),
    }),
  })
  .strict()
  .superRefine((cfg, ctx) => {
    const seen = new Set<string>();
    for (const m of cfg.modules.visible) {
      if (seen.has(m)) ctx.addIssue({ code: 'custom', path: ['modules', 'visible'], message: `modules.visible: ${m} está repetido` });
      seen.add(m);
    }
  });

export type ClientConfig = z.infer<typeof clientConfigSchema>;
export type ClientConfigInput = z.input<typeof clientConfigSchema>;

export function findSecretKeys(value: unknown, path = ''): string[] {
  if (!value || typeof value !== 'object') return [];
  const found: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    const here = path ? `${path}.${key}` : key;
    if (SECRET_KEYS.some((s) => key.toLowerCase() === s.toLowerCase())) found.push(here);
    found.push(...findSecretKeys(child, here));
  }
  return found;
}
