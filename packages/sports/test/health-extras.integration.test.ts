import { createPrismaClient } from '@clumera/db';
import { testDatabaseUrl } from '@clumera/db/testing';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addTemporaryPlayer,
  clockAction,
  createGuestPass,
  createMatch,
  createSport,
  createTeam,
  guestTicketAllows,
  injuryHistory,
  liveView,
  matchAudience,
  medicalQueue,
  myInjuries,
  parseYouTubeId,
  readGuestTicket,
  recordEvaluation,
  recordEvent,
  recordSubstitution,
  redeemGuestCode,
  removeTemporaryPlayer,
  reportInjury,
  revokeGuestPasses,
  roster,
  setFollow,
  setLineup,
  setTeamMember,
  signGuestTicket,
  startMatch,
} from '../src';

const url = testDatabaseUrl('sports');
const db = url ? createPrismaClient(url) : null;
const KEY = 'clave-de-prueba-para-invitados-1234';

describe.skipIf(!db)('salud y alrededor del partido', () => {
  const prisma = db!;
  afterAll(() => prisma.$disconnect());
  const ids: Record<string, string> = {};

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE "Person","Sport","Team","TeamMember","Match","MatchCallup","MatchEvent","MatchClock","Absence","FamilyGroup","FamilyRelationship","OutboxEvent","InjuryReport","InjuryCase","InjurySession","MatchGuestPass","MatchFollow","MatchTemporaryPlayer","MatchSubstitution" CASCADE',
    );
    for (const k of ['ana', 'tomas', 'joaquin', 'medica', 'tio']) ids[k] = (await prisma.person.create({ data: { firstName: k, lastName: 'X' } })).id;
    await prisma.familyGroup.create({ data: { name: 'F', members: { create: [{ personId: ids.ana!, role: 'guardian' }, { personId: ids.tomas!, role: 'dependent' }] } } });
    const rugby = (await createSport(prisma, { code: 'rugby_xv', slug: 'rugby', name: 'Rugby' })) as { value: { id: string } };
    ids.m12 = ((await createTeam(prisma, { sportId: rugby.value.id, name: 'M12', slug: 'rugby-m12' })) as { value: { id: string } }).value.id;
    for (const p of ['tomas', 'joaquin']) await setTeamMember(prisma, ids.m12!, ids[p]!, true);
  });

  it('lesión: la familia ve estado y nota pública; la médica, también la privada; el coach, solo disponibilidad', async () => {
    expect(await reportInjury(prisma, ids.ana!, { personId: ids.tomas!, teamId: ids.m12!, zone: 'Tobillo', pain: 11, context: 'Partido', impact: 'Rengo', onsetDate: new Date() })).toMatchObject({ ok: false });
    expect(await reportInjury(prisma, ids.ana!, { personId: ids.ana!, teamId: ids.m12!, zone: 'Tobillo', pain: 3, context: 'Partido', impact: 'Rengo', onsetDate: new Date() })).toMatchObject({ ok: false, error: { code: 'forbidden' } });
    const r = await reportInjury(prisma, ids.ana!, { personId: ids.tomas!, teamId: ids.m12!, zone: 'Tobillo', pain: 6, context: 'Entrenamiento', impact: 'No puede correr', onsetDate: new Date('2026-11-10') });
    const reportId = r.ok ? r.value.id : '';
    expect((await roster(prisma, ids.m12!, new Date())).find((p) => p.personId === ids.tomas)!.availability.code).toBe('under_review');

    await recordEvaluation(prisma, { personId: ids.medica!, name: 'Laura Paz' }, reportId, { status: 'follow_up', availability: 'restricted', publicNote: 'Hielo y reposo relativo', privateNote: 'Esguince grado I' });
    const fam = (await myInjuries(prisma, [ids.tomas!]))[0]!;
    expect(fam).toMatchObject({ status: 'follow_up', availability: 'restricted', publicNote: 'Hielo y reposo relativo', sessions: [{ authorName: 'Laura Paz' }] });
    expect(JSON.stringify(fam)).not.toContain('Esguince');
    expect((await medicalQueue(prisma, [ids.m12!]))[0]).toMatchObject({ privateNote: 'Esguince grado I', evaluations: 1 });
    expect((await injuryHistory(prisma, reportId, false))[0]).not.toHaveProperty('privateNote');
    expect((await injuryHistory(prisma, reportId, true))[0]).toMatchObject({ privateNote: 'Esguince grado I' });

    const coach = (await roster(prisma, ids.m12!, new Date())).find((p) => p.personId === ids.tomas)!;
    expect(coach.availability).toEqual({ code: 'restricted', label: 'Con restricciones' });
    expect(JSON.stringify(coach)).not.toMatch(/Tobillo|Esguince|Hielo/);

    await recordEvaluation(prisma, { personId: ids.medica!, name: 'Laura Paz' }, reportId, { status: 'closed', availability: 'no_restrictions' });
    expect(await recordEvaluation(prisma, { personId: ids.medica!, name: 'Laura Paz' }, reportId, { status: 'follow_up', availability: 'restricted' })).toMatchObject({ ok: false, error: { code: 'conflict' } });
    expect(await prisma.injurySession.count({ where: { reportId } })).toBe(2);
    // Los eventos no llevan datos clínicos.
    const payloads = JSON.stringify(await prisma.outboxEvent.findMany({ where: { type: { startsWith: 'injury.' } }, select: { payload: true } }));
    expect(payloads).not.toMatch(/Tobillo|Esguince|Hielo|pain|zone/);
  });

  it('YouTube: id o enlaces conocidos; nada de HTML', () => {
    expect(parseYouTubeId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(parseYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1')).toBe('dQw4w9WgXcQ');
    expect(parseYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(parseYouTubeId('https://youtube.com/live/dQw4w9WgXcQ?si=x')).toBe('dQw4w9WgXcQ');
    expect(parseYouTubeId('<iframe src="https://evil.example/embed/dQw4w9WgXcQ">')).toBeNull();
    expect(parseYouTubeId('https://evil.example/watch?v=dQw4w9WgXcQ')).toBeNull();
  });

  it('pase de invitado: un código por partido, firmado, revocable y sin valor al terminar', async () => {
    const m = ((await createMatch(prisma, ids.ana!, { teamId: ids.m12!, opponent: 'Norte', startsAt: new Date(), home: true })) as { value: { id: string } }).value.id;
    const other = ((await createMatch(prisma, ids.ana!, { teamId: ids.m12!, opponent: 'Sur', startsAt: new Date(), home: true })) as { value: { id: string } }).value.id;
    const pass = await createGuestPass(prisma, m, ids.ana!, KEY);
    const code = pass.ok ? pass.value.code : '';
    expect(code).toMatch(/^INV-[A-Z0-9]{16}$/);
    expect(await prisma.matchGuestPass.findFirst({ where: { codeHint: code.slice(-4) } })).not.toBeNull();
    expect(JSON.stringify(await prisma.matchGuestPass.findMany())).not.toContain(code);
    expect(await redeemGuestCode(prisma, other, code, KEY)).toBeNull();
    const ok = await redeemGuestCode(prisma, m, code.toLowerCase(), KEY);
    expect(ok).not.toBeNull();
    const ticket = signGuestTicket(ok!.passId, KEY, ok!.expiresAt);
    expect(readGuestTicket(`${ticket}x`, KEY)).toBeNull();
    expect(readGuestTicket(ticket, 'otra-clave-distinta-1234')).toBeNull();
    expect(await guestTicketAllows(prisma, m, readGuestTicket(ticket, KEY))).toBe(true);
    expect(await guestTicketAllows(prisma, other, readGuestTicket(ticket, KEY))).toBe(false);
    await revokeGuestPasses(prisma, m);
    expect(await guestTicketAllows(prisma, m, readGuestTicket(ticket, KEY))).toBe(false);
  });

  it('audiencia de avisos: convocados (salvo «no voy»), sus responsables y seguidores', async () => {
    const m = ((await createMatch(prisma, ids.ana!, { teamId: ids.m12!, opponent: 'Norte', startsAt: new Date(), home: true })) as { value: { id: string } }).value.id;
    await prisma.matchCallup.updateMany({ where: { matchId: m, personId: ids.joaquin! }, data: { response: 'not_going' } });
    await setFollow(prisma, m, ids.tio!, true);
    expect((await matchAudience(prisma, m)).sort()).toEqual([ids.tomas!, ids.ana!, ids.tio!].sort());
    await setFollow(prisma, m, ids.tio!, false);
    expect(await matchAudience(prisma, m)).not.toContain(ids.tio);
  });

  it('planilla transitoria y cambios desde la mesa', async () => {
    const m = ((await createMatch(prisma, ids.ana!, { teamId: ids.m12!, opponent: 'Norte', startsAt: new Date('2026-11-21T14:00:00Z'), home: true })) as { value: { id: string } }).value.id;
    const temp = await addTemporaryPlayer(prisma, m, { name: 'Invitado Pérez', number: 23 });
    expect(await addTemporaryPlayer(prisma, m, { name: 'Otro', number: 23 })).toMatchObject({ ok: false, error: { code: 'conflict' } });
    await setLineup(prisma, m, [ids.tomas!]);
    await startMatch(prisma, m);
    await clockAction(prisma, m, 'start_first_half', new Date('2026-11-21T14:00:00Z'));
    const tempId = temp.ok ? temp.value.id : '';
    expect((await recordEvent(prisma, m, ids.ana!, { type: 'try', side: 'own', temporaryPlayerId: tempId }, new Date('2026-11-21T14:05:00Z'))).ok).toBe(true);
    expect(await removeTemporaryPlayer(prisma, tempId)).toMatchObject({ ok: false });
    expect(await recordSubstitution(prisma, m, ids.ana!, { outPersonId: ids.joaquin!, inPersonId: ids.tomas! })).toMatchObject({ ok: false });
    expect(await recordSubstitution(prisma, m, ids.ana!, { outPersonId: ids.tomas!, inPersonId: ids.joaquin! }, new Date('2026-11-21T14:20:00Z'))).toMatchObject({ ok: true });
    expect(await prisma.matchCallup.count({ where: { matchId: m, inLineup: true } })).toBe(2);
    const v = (await liveView(prisma, m))!;
    expect(v.events.map((e) => [e.label, e.player])).toEqual([
      ['Cambio', 'entra joaquin X, sale tomas X'],
      ['Try', 'Invitado Pérez (23)'],
    ]);
    expect(await prisma.outboxEvent.count({ where: { type: 'match.event_recorded' } })).toBe(1);
  });
});
