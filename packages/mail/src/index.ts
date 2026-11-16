/**
 * Correo saliente. Dos drivers:
 * - `resend`: producción (RESEND_API_KEY, MAIL_FROM).
 * - `dev`: Lab y desarrollo; guarda el mensaje donde se le indique (la bandeja de Lab) y no envía nada.
 * Los mensajes llevan enlaces de un solo uso: nunca se loguea el cuerpo.
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Etiqueta para métricas del proveedor (activation, password_reset…). */
  tag?: string;
}

export interface Mailer {
  readonly driver: 'resend' | 'dev';
  send(message: MailMessage): Promise<void>;
}

export class MailError extends Error {
  override name = 'MailError';
}

export function createResendMailer(options: { apiKey: string; from: string; fetchImpl?: typeof fetch }): Mailer {
  const doFetch = options.fetchImpl ?? fetch;
  return {
    driver: 'resend',
    async send(message) {
      const res = await doFetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${options.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: options.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          ...(message.html ? { html: message.html } : {}),
          ...(message.tag ? { tags: [{ name: 'category', value: message.tag }] } : {}),
        }),
      });
      if (!res.ok) throw new MailError(`Resend respondió ${res.status}`);
    },
  };
}

export function createDevMailer(store: (message: MailMessage) => Promise<void>): Mailer {
  return { driver: 'dev', send: store };
}

export interface MailEnv extends Record<string, string | undefined> {
  CLUMERA_MAIL_DRIVER?: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
}

/**
 * Elige el driver según el entorno. En producción sin Resend configurado falla en vez de
 * descartar correos en silencio.
 */
export function mailerFromEnv(env: MailEnv, devStore: (message: MailMessage) => Promise<void>): Mailer {
  const driver = env.CLUMERA_MAIL_DRIVER?.trim() || (env.RESEND_API_KEY ? 'resend' : 'dev');
  if (driver === 'dev') return createDevMailer(devStore);
  if (driver !== 'resend') throw new MailError(`CLUMERA_MAIL_DRIVER desconocido: ${driver}`);
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) throw new MailError('Faltan RESEND_API_KEY o MAIL_FROM');
  return createResendMailer({ apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM });
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPES[c]!);

/** Correo transaccional simple: un párrafo, un botón con enlace y una aclaración. Texto + HTML. */
export function actionEmail(input: {
  to: string;
  subject: string;
  clubName: string;
  intro: string;
  actionLabel: string;
  actionUrl: string;
  outro: string;
  tag: string;
}): MailMessage {
  const text = `${input.intro}\n\n${input.actionLabel}: ${input.actionUrl}\n\n${input.outro}\n\n— ${input.clubName}`;
  const e = escapeHtml;
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#142d4b;line-height:1.5">
<p>${e(input.intro)}</p>
<p><a href="${e(input.actionUrl)}" style="display:inline-block;padding:12px 20px;border-radius:12px;background:#08639d;color:#fff;text-decoration:none;font-weight:600">${e(input.actionLabel)}</a></p>
<p style="font-size:14px;color:#4a5b70">${e(input.outro)}</p>
<p style="font-size:14px;color:#4a5b70">— ${e(input.clubName)}</p>
</body></html>`;
  return { to: input.to, subject: input.subject, text, html, tag: input.tag };
}
