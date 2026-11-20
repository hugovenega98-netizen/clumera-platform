import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { LAB_DB, LAB_URL, PG } from '../env';
import { expectNoHorizontalScroll, loginAs, restoreLab } from './helpers';

/**
 * Hito C · Torneos — caso D del plan: un torneo relámpago corre de la inscripción a la tabla final
 * con resultados consistentes. Organización crea y sortea, un socio inscribe su equipo (cargo en
 * Pagos), se cargan resultados, una corrección oficial recalcula la tabla, la eliminación llega al
 * campeón y la página pública lo muestra sin datos de personas. Más el recorrido por rol.
 */
test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await restoreLab(page);
  await page.close();
});

const sql = (q: string) => execFileSync('psql', [`${PG}/${LAB_DB}`, '-Atc', q]).toString().trim();
const rows = (q: string) => sql(q).split('\n').filter(Boolean).map((l) => l.split('|'));
const req = (page: Page, method: 'post' | 'put', path: string, data: unknown) => page.request[method](`${LAB_URL}${path}`, { headers: { origin: LAB_URL }, data });
const matchesOf = (tid: string, stage: string) =>
  rows(`SELECT m.id, h.name, a.name, m."homeTeamId", m."awayTeamId" FROM "TournamentMatch" m JOIN "TournamentTeam" h ON h.id = m."homeTeamId" JOIN "TournamentTeam" a ON a.id = m."awayTeamId" WHERE m."tournamentId" = '${tid}' AND m.stage = '${stage}' ORDER BY m.slot`).map(([id, home, away, homeId, awayId]) => ({ id: id!, home: home!, away: away!, homeId: homeId!, awayId: awayId! }));

test('caso D: de la inscripción a la tabla final, con una corrección oficial', async ({ page }, info) => {
  test.setTimeout(90_000);
  const slug = `copa-e2e-${info.project.name}`;
  const name = `Copa E2E ${info.project.name}`;

  // Organización crea el torneo: 2 zonas, 4 equipos, $ 20.000 por equipo.
  await loginAs(page, 'Organizador');
  await page.goto(`${LAB_URL}/admin/torneos`);
  await expect(page.getByRole('link', { name: 'Relámpago de Verano: Fase de grupos' })).toBeVisible();
  const form = page.getByRole('form', { name: 'Nuevo torneo' });
  await form.getByLabel('Nombre', { exact: true }).fill(name);
  await form.getByLabel('Dirección de la página').fill(slug);
  await form.getByLabel('Cupo de equipos').fill('4');
  await form.getByLabel('Inscripción por equipo ($)').fill('20000');
  await form.getByLabel('Canchas').fill('F5-1, F5-2');
  await expectNoHorizontalScroll(page);
  await form.getByRole('button', { name: 'Crear torneo' }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/torneos/${slug}$`));
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
  const tid = sql(`SELECT id FROM "Tournament" WHERE slug = '${slug}'`);

  // Un socio inscribe su equipo: queda como capitán y la inscripción va a Pagos.
  await loginAs(page, 'Socio');
  await page.goto(`${LAB_URL}/torneos`);
  const card = page.getByRole('region', { name });
  await card.getByLabel('Nombre del equipo').fill('Las Leonas');
  await card.getByRole('button', { name: 'Inscribir equipo' }).click();
  const mine = page.getByRole('region', { name: 'Mis equipos' });
  await expect(mine.getByLabel(`Las Leonas en ${name}`).getByText('Falta pagar la inscripción')).toBeVisible();
  await expectNoHorizontalScroll(page);
  expect(sql(`SELECT c.amount || '|' || c.concept FROM "Charge" c JOIN "Person" p ON p.id = c."personId" WHERE c.source = 'tournaments' AND p.email = 'socio@lab.clumera.app' AND c.description LIKE '%Las Leonas%'`)).toBe('2000000|torneo');
  // El mismo nombre no se repite.
  expect((await req(page, 'post', `/api/m/tournaments/${tid}/teams`, { name: 'las leonas' })).status()).toBe(409);

  // Organización completa el cupo, da de baja a uno y lo reemplaza; el quinto ya no entra.
  await loginAs(page, 'Organizador');
  for (const team of ['Rayo E2E', 'Fénix E2E', 'Sur E2E']) expect((await req(page, 'post', `/api/m/tournaments/${tid}/teams`, { name: team })).status()).toBe(201);
  expect((await req(page, 'post', `/api/m/tournaments/${tid}/teams`, { name: 'Quinto' })).status()).toBe(409);
  await page.goto(`${LAB_URL}/admin/torneos/${slug}`);
  await page.getByRole('button', { name: 'Dar de baja a Sur E2E' }).click();
  await expect(page.getByRole('region', { name: 'Equipos inscriptos' }).getByText('Sur E2E')).toHaveCount(0);
  expect((await req(page, 'post', `/api/m/tournaments/${tid}/teams`, { name: 'Norte E2E' })).status()).toBe(201);

  // Sorteo: zonas y fixture con canchas y horarios.
  await page.reload();
  await page.getByRole('button', { name: 'Cerrar inscripción y sortear' }).click();
  await expect(page.getByRole('region', { name: 'Posiciones · Zona A' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Posiciones · Zona B' })).toBeVisible();
  const group = matchesOf(tid, 'group');
  expect(group).toHaveLength(2);

  // Resultados desde la pantalla: gana el local 2 a 0.
  for (const m of group) {
    const f = page.getByRole('form', { name: `Resultado ${m.home} contra ${m.away}` });
    await f.getByLabel(`Goles de ${m.home}`).fill('2');
    await f.getByLabel(`Goles de ${m.away}`).fill('0');
    await f.getByRole('button', { name: 'Cargar resultado' }).click();
    await expect(page.getByRole('listitem', { name: `${m.home} 2 a 0 ${m.away}` })).toBeVisible();
  }
  const zoneOf = (team: string) => sql(`SELECT zone FROM "TournamentTeam" WHERE "tournamentId" = '${tid}' AND name = '${team}'`);
  const m0 = group[0]!;
  const table = page.getByRole('region', { name: `Posiciones · Zona ${zoneOf(m0.home)}` });
  await expect(table.getByRole('row').nth(1)).toContainText(`1. ${m0.home}`);

  // Corrección oficial: pide motivo; ganó el visitante 0 a 3 y la tabla se recalcula.
  await page.getByRole('button', { name: `Corregir ${m0.home} contra ${m0.away}` }).click();
  const fix = page.getByRole('form', { name: `Resultado ${m0.home} contra ${m0.away}` });
  await fix.getByLabel(`Goles de ${m0.home}`).fill('0');
  await fix.getByLabel(`Goles de ${m0.away}`).fill('3');
  await expect(fix.getByRole('button', { name: 'Guardar corrección' })).toBeDisabled();
  await fix.getByLabel('Motivo de la corrección').fill('Error de planilla');
  await fix.getByRole('button', { name: 'Guardar corrección' }).click();
  await expect(page.getByText('Resultado corregido. La tabla se recalculó.')).toBeVisible();
  await expect(table.getByRole('row').nth(1)).toContainText(`1. ${m0.away}`);
  await expect(table.getByRole('row').nth(1)).toContainText('3');
  await expect(page.getByRole('listitem', { name: `${m0.home} 0 a 3 ${m0.away}` }).getByText('Corregido', { exact: true })).toBeVisible();
  expect(sql(`SELECT count(*) FROM "AuditLog" WHERE action = 'tournament.result_corrected' AND "entityId" = '${tid}'`)).toBe('1');

  // Eliminación: semifinales cruzadas. Un empate pide quién pasa por penales.
  await page.getByRole('button', { name: 'Armar la eliminación' }).click();
  await expect(page.getByRole('region', { name: 'Eliminación' })).toBeVisible();
  const [s1, s2] = matchesOf(tid, 'semi') as [ReturnType<typeof matchesOf>[0], ReturnType<typeof matchesOf>[0]];
  const sf = page.getByRole('form', { name: `Resultado ${s1.home} contra ${s1.away}` });
  await sf.getByLabel(`Goles de ${s1.home}`).fill('1');
  await sf.getByLabel(`Goles de ${s1.away}`).fill('1');
  await expect(sf.getByRole('button', { name: 'Cargar resultado' })).toBeDisabled();
  await sf.getByRole('radio', { name: s1.away }).check();
  await sf.getByRole('button', { name: 'Cargar resultado' }).click();
  await expect(page.getByText(`pasa ${s1.away} por penales`)).toBeVisible();
  expect((await req(page, 'put', `/api/m/tournaments/matches/${s2.id}/result`, { homeScore: 2, awayScore: 1 })).status()).toBe(200);
  const [final, third] = [...matchesOf(tid, 'final'), ...matchesOf(tid, 'third')];
  expect([final!.home, final!.away]).toEqual([s1.away, s2.home]);
  expect((await req(page, 'put', `/api/m/tournaments/matches/${third!.id}/result`, { homeScore: 1, awayScore: 0 })).status()).toBe(200);
  expect((await req(page, 'put', `/api/m/tournaments/matches/${final!.id}/result`, { homeScore: 0, awayScore: 2 })).status()).toBe(200);
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: 'Campeón' })).toContainText(s2.home);

  // Página pública sin sesión: campeón, posiciones y fixture; ningún dato de personas ni de cobros.
  await page.context().clearCookies();
  const res = await page.goto(`${LAB_URL}/torneos/${slug}`);
  expect(res!.status()).toBe(200);
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Campeón' })).toContainText(s2.home);
  await expect(page.getByRole('region', { name: 'Posiciones · Zona A' })).toBeVisible();
  await expectNoHorizontalScroll(page);
  const text = await page.locator('main').innerText();
  for (const forbidden of ['Ana', 'Fernández', 'Vera', 'capitán', '$', '20.000', 'Error de planilla']) expect(text, forbidden).not.toContain(forbidden);
});

test('la página pública del relámpago sembrado muestra la tabla calculada', async ({ page }) => {
  await page.goto(`${LAB_URL}/torneos/relampago-verano`);
  await expect(page.getByRole('heading', { name: 'Relámpago de Verano', level: 1 })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Próximos partidos' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Último resultado' })).toBeVisible();
  for (const zone of ['A', 'B']) await expect(page.getByRole('region', { name: `Posiciones · Zona ${zone}` }).getByRole('row')).toHaveCount(5);
  expect((await page.goto(`${LAB_URL}/torneos/no-existe`))!.status()).toBe(404);
});

test('recorrido por rol de Torneos', async ({ page }) => {
  const status = async (path: string) => (await page.goto(`${LAB_URL}${path}`))!.status();
  const tid = sql(`SELECT id FROM "Tournament" WHERE slug = 'voley-primavera'`);
  const played = sql(`SELECT m.id FROM "TournamentMatch" m JOIN "Tournament" t ON t.id = m."tournamentId" WHERE t.slug = 'relampago-verano' AND m.status = 'played' LIMIT 1`);
  const someTeam = sql(`SELECT tt.id FROM "TournamentTeam" tt JOIN "Tournament" t ON t.id = tt."tournamentId" WHERE t.slug = 'voley-primavera' LIMIT 1`);

  await loginAs(page, 'Organizador');
  expect(await status('/admin/torneos')).toBe(200);
  expect(await status('/admin/torneos/relampago-verano')).toBe(200);

  await loginAs(page, 'Socio');
  expect(await status('/torneos')).toBe(200);
  expect(await status('/admin/torneos')).toBe(403);
  expect((await req(page, 'put', `/api/m/tournaments/matches/${played}/result`, { homeScore: 9, awayScore: 0, reason: 'No soy organizador' })).status()).toBe(403);
  expect((await req(page, 'post', `/api/m/tournaments/${tid}/draw`, {})).status()).toBe(403);
  // El equipo de otro capitán no se da de baja.
  expect((await req(page, 'post', `/api/m/tournaments/teams/${someTeam}/withdraw`, {})).status()).toBe(403);

  for (const profile of ['Mesa', 'Recepción', 'Contabilidad', 'Coordinador'] as const) {
    await loginAs(page, profile);
    expect(await status('/admin/torneos'), `${profile} /admin/torneos`).toBe(403);
    expect((await req(page, 'put', `/api/m/tournaments/matches/${played}/result`, { homeScore: 9, awayScore: 0, reason: 'Sin permiso' })).status(), profile).toBe(403);
    expect((await req(page, 'post', `/api/m/tournaments/${tid}/teams`, { name: `Equipo ${profile}` })).status(), profile).toBe(403);
  }

  await page.context().clearCookies();
  await page.goto(`${LAB_URL}/torneos`);
  await expect(page).toHaveURL(/\/ingresar/);
  expect(await status('/torneos/relampago-verano')).toBe(200);
  expect((await req(page, 'put', `/api/m/tournaments/matches/${played}/result`, { homeScore: 9, awayScore: 0 })).status()).toBe(401);
});
