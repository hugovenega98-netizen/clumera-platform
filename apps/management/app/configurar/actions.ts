'use server';

import { hashPassword, passwordProblems } from '@clumera/identity';

export interface SetupState {
  hash: string | null;
  problems: string[];
}

/**
 * Configuración inicial: calcula el hash de la contraseña que elige la persona administradora para
 * que lo pegue en MANAGEMENT_ADMIN_PASSWORD_HASH. No guarda nada. Deja de funcionar cuando el hash ya
 * está configurado.
 */
export async function hashAdminPassword(_prev: SetupState, form: FormData): Promise<SetupState> {
  if (process.env.MANAGEMENT_ADMIN_PASSWORD_HASH?.trim()) return { hash: null, problems: ['La contraseña de administración ya está configurada.'] };
  const password = String(form.get('password') ?? '');
  if (password !== String(form.get('confirm') ?? '')) return { hash: null, problems: ['Las contraseñas no coinciden.'] };
  const problems = passwordProblems(password, { login: process.env.MANAGEMENT_ADMIN_EMAIL });
  if (problems.length) return { hash: null, problems };
  return { hash: await hashPassword(password), problems: [] };
}
