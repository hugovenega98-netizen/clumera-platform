import 'server-only';
import { accountHolders } from '@clumera/finance';
import { guardiansOf } from '@clumera/identity';
import { permissionChecker } from './authz';
import { getPrisma } from './db';

/**
 * ¿Puede ver la cuenta de `personId`? Pasa por can(): son dueños la persona y sus responsables
 * (`finance:account.view:self`); Contabilidad, Caja y Superadmin la ven completa.
 */
export async function canViewAccount(viewerId: string, personId: string): Promise<boolean> {
  const owners = [personId, ...(await guardiansOf(getPrisma(), personId))];
  return (await permissionChecker(viewerId))('finance:account.view', { scopes: [], ownerPersonIds: owners });
}

/** Cargos que la persona puede pagar online: los suyos y los de sus representados. */
export async function payableBy(viewerId: string, chargeIds: string[]): Promise<boolean> {
  const db = getPrisma();
  const holders = await accountHolders(db, viewerId);
  const charges = await db.charge.findMany({ where: { id: { in: chargeIds } }, select: { personId: true } });
  return charges.length === new Set(chargeIds).size && charges.every((c) => holders.includes(c.personId));
}
