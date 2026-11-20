import { createPrismaClient } from '@clumera/db';
import { testDatabaseUrl } from '@clumera/db/testing';
import { createCredentialService } from '@clumera/identity';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { authorizeException, checkAccess, listAccessPoints, pointSummary } from '../src';

const url = testDatabaseUrl('access');
const db = url ? createPrismaClient(url) : null;

describe.skipIf(!db)('Accesos: validar, registrar y excepciones', () => {
  const prisma = db!;
  let clock = new Date();
  const creds = createCredentialService(prisma, () => clock);
  afterAll(() => prisma.$disconnect());
  const ids: Record<string, string> = {};

  beforeEach(async () => {
    clock = new Date();
    await prisma.$executeRawUnsafe('TRUNCATE "AccessAttempt","AccessPoint","Credential","Person","ClubMembership","MembershipCategory","OutboxEvent","AuditLog" CASCADE');
    const cat = await prisma.membershipCategory.create({ data: { code: 'activo', name: 'Activo' } });
    const mk = (firstName: string, member: boolean) =>
      prisma.person.create({ data: { firstName, lastName: 'Prueba', ...(member ? { memberships: { create: { categoryId: cat.id, memberNumber: firstName === 'Ana' ? '1042' : '1043', validFrom: new Date('2024-01-01') } } } : {}) } });
    ids.ana = (await mk('Ana', true)).id;
    ids.bruno = (await mk('Bruno', true)).id;
    ids.julia = (await mk('Julia', false)).id;
    ids.rosa = (await mk('Rosa', false)).id;
    ids.main = (await prisma.accessPoint.create({ data: { slug: 'principal', name: 'Acceso principal' } })).id;
    await prisma.accessPoint.create({ data: { slug: 'vieja', name: 'Puerta vieja', active: false } });
  });

  it('lista solo los puntos activos', async () => {
    expect((await listAccessPoints(prisma)).map((p) => p.slug)).toEqual(['principal']);
  });

  it('QR de carnet vigente: permitido, registrado y sin datos sensibles', async () => {
    const card = await creds.memberCard(ids.ana!);
    const r = await checkAccess(prisma, creds, ids.rosa!, { pointId: ids.main!, token: card!.qr!.token });
    expect(r).toMatchObject({ ok: true, value: { granted: true, detail: 'Socio N° 1042 · Activo', person: { firstName: 'Ana' }, canOverride: false } });
    const view = JSON.stringify(r.ok && r.value);
    expect(view).not.toMatch(/personId|credentialId|deuda|saldo|salud|balance|health/i);
    expect(await prisma.accessAttempt.findFirstOrThrow()).toMatchObject({ result: 'granted', method: 'qr', personId: ids.ana, byPersonId: ids.rosa });
    expect(await prisma.outboxEvent.count({ where: { type: 'access.granted' } })).toBe(1);
  });

  it('caso B: una credencial revocada no entra (por QR ni por búsqueda)', async () => {
    const card = await creds.memberCard(ids.bruno!);
    const cred = await prisma.credential.findFirstOrThrow({ where: { personId: ids.bruno! } });
    await creds.revoke(cred.id, 'Carnet extraviado');
    const byQr = await checkAccess(prisma, creds, ids.rosa!, { pointId: ids.main!, token: card!.qr!.token });
    expect(byQr).toMatchObject({ ok: true, value: { granted: false, reason: 'revocada', detail: 'Credencial revocada.', canOverride: true } });
    const bySearch = await checkAccess(prisma, creds, ids.rosa!, { pointId: ids.main!, personId: ids.bruno! });
    expect(bySearch).toMatchObject({ ok: true, value: { granted: false, reason: 'revocada' } });
    expect(await prisma.accessAttempt.count({ where: { result: 'denied' } })).toBe(2);
  });

  it('un código ajeno o adulterado también queda registrado, sin excepción posible', async () => {
    const r = await checkAccess(prisma, creds, ids.rosa!, { pointId: ids.main!, token: 'cualquier-cosa' });
    expect(r).toMatchObject({ ok: true, value: { granted: false, reason: 'formato', person: null, canOverride: false } });
    expect(await authorizeException(prisma, ids.rosa!, r.ok ? r.value.attemptId : '', 'Lo conozco de siempre')).toMatchObject({ ok: false, error: { code: 'conflict' } });
  });

  it('búsqueda de alguien sin membresía: denegado por motivo', async () => {
    expect(await checkAccess(prisma, creds, ids.rosa!, { pointId: ids.main!, personId: ids.julia! })).toMatchObject({ ok: true, value: { granted: false, reason: 'sin_membresia' } });
  });

  it('credencial de reserva: vale solo en su ventana y se revoca con la reserva', async () => {
    const start = new Date(clock.getTime() + 2 * 3_600_000);
    await creds.issueBookingCredential({ bookingId: 'bk1', personId: ids.julia!, validFrom: new Date(start.getTime() - 3_600_000), validTo: new Date(start.getTime() + 3_600_000), label: 'Reserva F5-1 · hoy' });
    // Idempotente: una sola credencial por reserva.
    await creds.issueBookingCredential({ bookingId: 'bk1', personId: ids.julia!, validFrom: new Date(start.getTime() - 3_600_000), validTo: new Date(start.getTime() + 3_600_000), label: 'Reserva F5-1 · hoy' });
    expect(await prisma.credential.count({ where: { bookingId: 'bk1' } })).toBe(1);
    const early = await creds.bookingQr('bk1');
    expect(await checkAccess(prisma, creds, ids.rosa!, { pointId: ids.main!, token: early!.token })).toMatchObject({ ok: true, value: { granted: false, reason: 'no_habilitada' } });
    clock = new Date(start.getTime() - 30 * 60_000);
    const onTime = await creds.bookingQr('bk1');
    expect(await checkAccess(prisma, creds, ids.rosa!, { pointId: ids.main!, token: onTime!.token })).toMatchObject({ ok: true, value: { granted: true, detail: 'Reserva F5-1 · hoy', person: { firstName: 'Julia' } } });
    clock = new Date(start.getTime() + 2 * 3_600_000);
    const late = await creds.bookingQr('bk1');
    expect(await checkAccess(prisma, creds, ids.rosa!, { pointId: ids.main!, token: late!.token })).toMatchObject({ ok: true, value: { granted: false, reason: 'vencido' } });
    await creds.revokeBookingCredential('bk1', 'Reserva cancelada');
    expect(await creds.bookingQr('bk1')).toBeNull();
  });

  it('excepción autorizada: con motivo, una sola vez, y suma al resumen del puesto', async () => {
    const denied = await checkAccess(prisma, creds, ids.rosa!, { pointId: ids.main!, personId: ids.julia! });
    const id = denied.ok ? denied.value.attemptId : '';
    expect(await authorizeException(prisma, ids.rosa!, id, 'no')).toMatchObject({ ok: false, error: { code: 'invalid_input' } });
    expect(await authorizeException(prisma, ids.rosa!, id, 'Invitada de la comisión directiva')).toMatchObject({ ok: true, value: { granted: true, detail: 'Excepción autorizada · Invitada de la comisión directiva', person: { firstName: 'Julia' } } });
    expect(await authorizeException(prisma, ids.rosa!, id, 'Invitada de la comisión directiva')).toMatchObject({ ok: false, error: { code: 'conflict' } });
    expect(await prisma.auditLog.count({ where: { action: 'access.override' } })).toBe(1);
    const s = await pointSummary(prisma, ids.main!);
    expect(s).toMatchObject({ granted: 1, denied: 1 });
    expect(s.recent[0]).toMatchObject({ granted: true, override: true, text: 'Julia Prueba · Excepción autorizada · Invitada de la comisión directiva' });
    // La base impide una «excepción» sin motivo.
    await expect(prisma.accessAttempt.create({ data: { pointId: ids.main!, result: 'granted', detail: 'x', method: 'excepcion', byPersonId: ids.rosa! } })).rejects.toThrow();
  });
});
