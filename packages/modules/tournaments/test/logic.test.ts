import { describe, expect, it } from 'vitest';
import { drawZones, knockoutPairs, pointsRule, roundRobin, standings } from '../src/logic';

describe('reglas del torneo', () => {
  it('puntos según la familia del deporte', () => {
    expect(pointsRule('football_5')).toEqual({ win: 3, draw: 1, loss: 0, draws: true });
    expect(pointsRule('rugby_xv')).toMatchObject({ win: 4, draw: 2 });
    expect(pointsRule('volleyball')).toMatchObject({ draws: false });
  });

  it('todos contra todos: cada par una vez, nadie dos veces por ronda; con impar, libra uno', () => {
    for (const n of [2, 3, 4, 5, 6]) {
      const teams = Array.from({ length: n }, (_, i) => `T${i}`);
      const rounds = roundRobin(teams);
      const pairs = rounds.flat().map(([a, b]) => [a, b].sort().join('-'));
      expect(new Set(pairs).size).toBe((n * (n - 1)) / 2);
      expect(pairs.length).toBe((n * (n - 1)) / 2);
      for (const r of rounds) expect(new Set(r.flat()).size).toBe(r.length * 2);
    }
  });

  it('zonas parejas en serpentina', () => {
    expect(drawZones([1, 2, 3, 4, 5, 6, 7, 8], 2)).toEqual([
      [1, 4, 5, 8],
      [2, 3, 6, 7],
    ]);
  });

  it('tabla: puntos, diferencia, a favor, entre ellos y nombre', () => {
    const t = [
      { id: 'a', name: 'Rayo' },
      { id: 'b', name: 'Halcones' },
      { id: 'c', name: 'Pibes' },
    ];
    const rows = standings(
      t,
      [
        { homeTeamId: 'a', awayTeamId: 'b', homeScore: 1, awayScore: 0 },
        { homeTeamId: 'b', awayTeamId: 'c', homeScore: 2, awayScore: 0 },
        { homeTeamId: 'c', awayTeamId: 'a', homeScore: 1, awayScore: 0 },
      ],
      pointsRule('football_5'),
    );
    // Los tres con 3 puntos: decide la diferencia.
    expect(rows.map((r) => [r.name, r.points, r.diff])).toEqual([
      ['Halcones', 3, 1],
      ['Rayo', 3, 0],
      ['Pibes', 3, -1],
    ]);
  });

  it('empate en puntos, diferencia y goles: decide el partido entre ellos', () => {
    const t = [
      { id: 'a', name: 'Alfa' },
      { id: 'b', name: 'Beta' },
      { id: 'c', name: 'Gama' },
      { id: 'd', name: 'Delta' },
    ];
    // Alfa y Beta: 3 puntos, diferencia 0 y 2 a favor. Beta le ganó a Alfa: va arriba aunque por nombre no.
    const rows = standings(
      t,
      [
        { homeTeamId: 'b', awayTeamId: 'a', homeScore: 1, awayScore: 0 },
        { homeTeamId: 'a', awayTeamId: 'c', homeScore: 2, awayScore: 1 },
        { homeTeamId: 'd', awayTeamId: 'b', homeScore: 2, awayScore: 1 },
      ],
      pointsRule('football_5'),
    );
    const alfa = rows.find((r) => r.name === 'Alfa')!;
    const beta = rows.find((r) => r.name === 'Beta')!;
    expect([alfa.points, alfa.diff, alfa.goalsFor]).toEqual([beta.points, beta.diff, beta.goalsFor]);
    expect(rows.indexOf(beta)).toBeLessThan(rows.indexOf(alfa));
  });

  it('cruces: 1.° de una zona contra 2.° de la otra', () => {
    expect(knockoutPairs([['A1', 'A2'], ['B1', 'B2']])).toEqual([
      ['A1', 'B2'],
      ['B1', 'A2'],
    ]);
    expect(knockoutPairs([['A1', 'A2']])).toEqual([['A1', 'A2']]);
    expect(() => knockoutPairs([['A1', 'A2', 'A3']])).toThrow();
  });
});
