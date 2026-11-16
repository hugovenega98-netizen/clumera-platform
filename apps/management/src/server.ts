import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ADMIN_COOKIE, readAdminToken } from './admin-session';
import { getManagementDb } from './db';
import { createInstallationService, licenseKeysFromEnv } from './installations';

export async function getAdmin() {
  return readAdminToken((await cookies()).get(ADMIN_COOKIE)?.value);
}

export async function requireAdmin() {
  const admin = await getAdmin();
  if (!admin) redirect('/login');
  return admin;
}

export function installations() {
  return createInstallationService(getManagementDb(), licenseKeysFromEnv());
}
