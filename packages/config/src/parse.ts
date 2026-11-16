import { DomainError, err, ok, type Result } from '@clumera/kernel';
import { AA_NORMAL, contrastRatio } from './contrast';
import { clientConfigSchema, findSecretKeys, type ClientConfig } from './schema';

type ColorKey = keyof ClientConfig['colors'];
type ColorRef = ColorKey | `#${string}`;

/** Pares que la interfaz usa como texto sobre fondo; deben cumplir AA. */
const CONTRAST_PAIRS: Array<{ fg: ColorRef; bg: ColorRef; label: string }> = [
  { fg: 'text', bg: 'background', label: 'texto sobre el fondo' },
  { fg: 'text', bg: 'surface', label: 'texto sobre tarjetas' },
  { fg: '#ffffff', bg: 'primary', label: 'texto blanco sobre el color principal' },
  { fg: '#ffffff', bg: 'button', label: 'texto blanco sobre los botones' },
];

/** Valida y normaliza un client.config.json. Los mensajes están en español y señalan el campo. */
export function parseClientConfig(input: unknown): Result<ClientConfig, DomainError> {
  const secrets = findSecretKeys(input);
  if (secrets.length)
    return err(new DomainError('invalid_input', 'client.config.json no puede guardar secretos', { problems: secrets.map((s) => `${s}: no guardes secretos acá`) }));

  const parsed = clientConfigSchema.safeParse(input);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => (i.message.includes(':') ? i.message : `${i.path.join('.') || '(raíz)'}: ${i.message}`));
    return err(new DomainError('invalid_input', 'client.config.json tiene errores', { problems }));
  }

  const cfg = parsed.data;
  const problems: string[] = [];
  const resolve = (c: ColorRef) => (c.startsWith('#') ? c : cfg.colors[c as ColorKey]);
  for (const { fg, bg, label } of CONTRAST_PAIRS) {
    const ratio = contrastRatio(resolve(fg), resolve(bg));
    if (ratio < AA_NORMAL) problems.push(`colors: el contraste de ${label} es ${ratio.toFixed(2)}:1 y debe ser al menos ${AA_NORMAL}:1`);
  }
  if (problems.length) return err(new DomainError('invalid_input', 'client.config.json tiene errores', { problems }));
  return ok(cfg);
}

export function parseClientConfigOrThrow(input: unknown): ClientConfig {
  const r = parseClientConfig(input);
  if (!r.ok) {
    const problems = (r.error.details?.problems as string[] | undefined) ?? [];
    throw new Error([r.error.message, ...problems.map((p) => `  - ${p}`)].join('\n'));
  }
  return r.value;
}
