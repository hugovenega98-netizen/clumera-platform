import { describe, expect, it, vi } from 'vitest';
import { actionEmail, createResendMailer, mailerFromEnv, MailError } from '../src';

describe('mail', () => {
  it('manda a Resend con la API key y sin exponerla en el cuerpo', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 200 }));
    await createResendMailer({ apiKey: 're_x', from: 'Club <no-reply@club.app>', fetchImpl }).send({ to: 'a@b.c', subject: 'Hola', text: 'x', tag: 'activation' });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect((init!.headers as Record<string, string>).authorization).toBe('Bearer re_x');
    expect(JSON.parse(init!.body as string)).toMatchObject({ to: ['a@b.c'], tags: [{ name: 'category', value: 'activation' }] });
    expect(init!.body).not.toContain('re_x');
  });

  it('informa errores del proveedor', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('no', { status: 422 }));
    await expect(createResendMailer({ apiKey: 'k', from: 'f', fetchImpl }).send({ to: 'a@b.c', subject: 's', text: 't' })).rejects.toThrow(MailError);
  });

  it('elige driver por entorno y falla si Resend está a medias', () => {
    const store = async () => {};
    expect(mailerFromEnv({}, store).driver).toBe('dev');
    expect(mailerFromEnv({ RESEND_API_KEY: 'k', MAIL_FROM: 'f' }, store).driver).toBe('resend');
    expect(() => mailerFromEnv({ CLUMERA_MAIL_DRIVER: 'resend' }, store)).toThrow(/RESEND_API_KEY/);
  });

  it('escapa HTML en los correos', () => {
    const m = actionEmail({ to: 'a@b.c', subject: 's', clubName: '<Club>', intro: 'Hola', actionLabel: 'Activar', actionUrl: 'https://x/activar?token=a&b', outro: 'o', tag: 't' });
    expect(m.html).toContain('&lt;Club&gt;');
    expect(m.html).toContain('token=a&amp;b');
    expect(m.text).toContain('https://x/activar?token=a&b');
  });
});
