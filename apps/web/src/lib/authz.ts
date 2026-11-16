import 'server-only';
import { loadActor, loadRoleCatalog } from '@clumera/identity';
import { can, type Decision, type Resource } from '@clumera/kernel';
import { getPrisma } from './db';
import { getLicenseState } from './license';

/** Autorización real del servidor: licencia + rol + ámbito. */
export async function authorize(personId: string, action: string, resource?: Resource): Promise<Decision> {
  const db = getPrisma();
  const [actor, roles, license] = await Promise.all([loadActor(db, personId), loadRoleCatalog(db), getLicenseState()]);
  return can({ enabledModules: license.enabled, roles }, actor, action, resource);
}
