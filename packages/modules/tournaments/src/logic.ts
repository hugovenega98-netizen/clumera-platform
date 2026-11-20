/**
 * Reglas puras de un torneo (sin base): puntos por deporte, fixture todos contra todos, tabla con
 * desempates y cruces de la eliminación. La tabla se calcula siempre a partir de los resultados.
 */
import { sportDefinition } from '@clumera/sports';

export interface PointsRule {
  win: number;
  draw: number;
  loss: number;
  /** Si el deporte no admite empate (vóley, básquet), todo partido necesita ganador. */
  draws: boolean;
}

/** Puntos de tabla según la familia del deporte (catálogo de Deportes). */
export function pointsRule(sportCode: string): PointsRule {
  const family = sportDefinition(sportCode)?.family;
  if (family === 'rugby') return { win: 4, draw: 2, loss: 0, draws: true };
  if (family === 'volleyball') return { win: 3, draw: 0, loss: 0, draws: false };
  if (family === 'basketball') return { win: 2, draw: 0, loss: 1, draws: false };
  return { win: 3, draw: 1, loss: 0, draws: true };
}

/** Rondas de todos contra todos (método del círculo). Con número impar, un equipo libra por ronda. */
export function roundRobin<T>(teams: T[]): Array<Array<[T, T]>> {
  if (teams.length < 2) return [];
  const list: Array<T | null> = [...teams];
  if (list.length % 2) list.push(null);
  const n = list.length;
  const rounds: Array<Array<[T, T]>> = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: Array<[T, T]> = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i]!;
      const b = list[n - 1 - i]!;
      if (a !== null && b !== null) pairs.push(r % 2 ? [b, a] : [a, b]);
    }
    rounds.push(pairs);
    list.splice(1, 0, list.pop()!);
  }
  return rounds;
}

export interface StandingRow {
  teamId: string;
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  diff: number;
  points: number;
}

export interface PlayedMatch {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
}

/**
 * Tabla de una zona. Orden: puntos, diferencia, a favor, resultado entre ellos (si empatan dos) y
 * nombre (para que el orden sea siempre el mismo).
 */
export function standings(teams: Array<{ id: string; name: string }>, matches: PlayedMatch[], rule: PointsRule): StandingRow[] {
  const rows = new Map<string, StandingRow>(teams.map((t) => [t.id, { teamId: t.id, name: t.name, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, diff: 0, points: 0 }]));
  for (const m of matches) {
    const h = rows.get(m.homeTeamId);
    const a = rows.get(m.awayTeamId);
    if (!h || !a) continue;
    h.played++;
    a.played++;
    h.goalsFor += m.homeScore;
    h.goalsAgainst += m.awayScore;
    a.goalsFor += m.awayScore;
    a.goalsAgainst += m.homeScore;
    if (m.homeScore > m.awayScore) {
      h.won++;
      a.lost++;
      h.points += rule.win;
      a.points += rule.loss;
    } else if (m.homeScore < m.awayScore) {
      a.won++;
      h.lost++;
      a.points += rule.win;
      h.points += rule.loss;
    } else {
      h.drawn++;
      a.drawn++;
      h.points += rule.draw;
      a.points += rule.draw;
    }
  }
  for (const r of rows.values()) r.diff = r.goalsFor - r.goalsAgainst;
  const headToHead = (x: StandingRow, y: StandingRow) => {
    let px = 0;
    let py = 0;
    for (const m of matches) {
      const xs = m.homeTeamId === x.teamId && m.awayTeamId === y.teamId ? [m.homeScore, m.awayScore] : m.homeTeamId === y.teamId && m.awayTeamId === x.teamId ? [m.awayScore, m.homeScore] : null;
      if (!xs) continue;
      px += xs[0]! > xs[1]! ? rule.win : xs[0] === xs[1] ? rule.draw : rule.loss;
      py += xs[1]! > xs[0]! ? rule.win : xs[0] === xs[1] ? rule.draw : rule.loss;
    }
    return py - px;
  };
  return [...rows.values()].sort((x, y) => y.points - x.points || y.diff - x.diff || y.goalsFor - x.goalsFor || headToHead(x, y) || x.name.localeCompare(y.name, 'es'));
}

/** Zonas A, B, C… */
export const zoneName = (i: number) => String.fromCharCode(65 + i);

/** Reparte los equipos en zonas en orden de sorteo (serpentina: A B B A…), para zonas parejas. */
export function drawZones<T>(teams: T[], zoneCount: number): T[][] {
  const zones: T[][] = Array.from({ length: zoneCount }, () => []);
  teams.forEach((t, i) => {
    const lap = Math.floor(i / zoneCount);
    const pos = i % zoneCount;
    zones[lap % 2 ? zoneCount - 1 - pos : pos]!.push(t);
  });
  return zones;
}

/**
 * Cruces de la eliminación a partir de los clasificados de cada zona (en orden). Admite 2 o 4
 * clasificados en total: final directa, o semifinales cruzadas (1.° de una zona contra 2.° de otra).
 */
export function knockoutPairs(qualified: string[][]): Array<[string, string]> {
  const total = qualified.reduce((n, z) => n + z.length, 0);
  if (total === 2) return [qualified.length === 1 ? [qualified[0]![0]!, qualified[0]![1]!] : [qualified[0]![0]!, qualified[1]![0]!]];
  if (total !== 4) throw new Error('La eliminación necesita 2 o 4 clasificados');
  if (qualified.length === 1) {
    const z = qualified[0]!;
    return [
      [z[0]!, z[3]!],
      [z[1]!, z[2]!],
    ];
  }
  if (qualified.length === 2) {
    const [a, b] = qualified as [string[], string[]];
    return [
      [a[0]!, b[1]!],
      [b[0]!, a[1]!],
    ];
  }
  const [a, b, c, d] = qualified.map((z) => z[0]!);
  return [
    [a!, d!],
    [b!, c!],
  ];
}
