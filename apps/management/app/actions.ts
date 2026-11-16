'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_COOKIE, checkAdminCredentials, issueAdminToken } from '@/admin-session';
import { installations, requireAdmin } from '@/server';

const secure = process.env.NODE_ENV === 'production';

export async function loginAction(_prev: { error: string | null }, form: FormData): Promise<{ error: string | null }> {
  const email = String(form.get('email') ?? '');
  if (!(await checkAdminCredentials(email, String(form.get('password') ?? '')))) return { error: 'Email o contraseña incorrectos.' };
  const { token, expires } = issueAdminToken(email.trim().toLowerCase());
  (await cookies()).set(ADMIN_COOKIE, token, { httpOnly: true, secure, sameSite: 'strict', path: '/', expires });
  redirect('/');
}

export async function logoutAction() {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect('/login');
}

export interface InstallationFormState {
  problems: string[];
  /** Lo que se envió, para no perderlo cuando hay errores (React reinicia el formulario). */
  values: Record<string, string>;
  modules: string[];
  attempt: number;
}

export async function createInstallationAction(prev: InstallationFormState, form: FormData): Promise<InstallationFormState> {
  const admin = await requireAdmin();
  const text = (k: string) => String(form.get(k) ?? '').trim();
  const values = Object.fromEntries(['clientId', 'clubName', 'displayName', 'subdomain', 'customDomain', 'sportsLimit', 'expiresAt'].map((k) => [k, text(k)]));
  const modules = form.getAll('modules').map(String);
  const r = await installations().create(
    {
      clientId: values.clientId,
      clubName: values.clubName,
      displayName: values.displayName,
      subdomain: values.subdomain,
      customDomain: values.customDomain || null,
      modules,
      sportsLimit: values.sportsLimit || 1,
      expiresAt: values.expiresAt || null,
    },
    admin.email,
  );
  if (!r.ok) return { problems: r.problems, values, modules, attempt: prev.attempt + 1 };
  redirect(`/instalaciones/${r.installation.id}?nueva=1`);
}

export async function reissueLicenseAction(_prev: { problems: string[] }, form: FormData): Promise<{ problems: string[] }> {
  const admin = await requireAdmin();
  const id = String(form.get('installationId'));
  const expires = String(form.get('expiresAt') ?? '');
  const r = await installations().reissueLicense(
    id,
    { modules: form.getAll('modules').map(String), sportsLimit: Number(form.get('sportsLimit') ?? 1), expiresAt: expires ? new Date(expires) : null },
    admin.email,
  );
  if (!r.ok) return { problems: r.problems };
  redirect(`/instalaciones/${id}?licencia=1`);
}
