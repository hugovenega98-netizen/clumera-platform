// Pruebas portadas del core anterior (clumera-cmp: sports.test.mjs y match-clock.test.mjs).
import { describe, expect, it } from 'vitest';
import {
  canRecordSportEvent,
  ClockError,
  clockElapsed,
  clockMinute,
  clockUpdate,
  clockView,
  isSportEvent,
  matchEventScore,
  playerAvailability,
  softballState,
  sportDefinition,
  sportEventPoints,
  SPORTS,
  validateSoftballAction,
  validateVolleyballAction,
  volleyballState,
  type ScoredEvent,
} from '../src/logic';

const at = (t: string) => new Date(`2026-10-20T15:${t}Z`);
const R = 'rugby_xv';

describe('catálogo', () => {
  it('doce modalidades sin códigos repetidos', () => {
    expect(SPORTS).toHaveLength(12);
    expect(new Set(SPORTS.map((s) => s.code)).size).toBe(12);
  });
  it('handball: siete puestos, dos minutos y reloj de 30', () => {
    const s = sportDefinition('handball')!;
    expect(s.fieldSize).toBe(7);
    expect(s.periodMinutes).toBe(30);
    expect(isSportEvent('handball', 'handball_two_minute')).toBe(true);
    expect(isSportEvent('handball', 'try')).toBe(false);
  });
  it('rugby: try penal suma siete y la mesa nunca registra lesiones', () => {
    for (const code of ['rugby_xv', 'rugby_seven']) {
      expect(sportEventPoints(code, 'penalty_try')).toBe(7);
      expect(canRecordSportEvent(code, 'penalty_try')).toBe(true);
    }
    for (const s of SPORTS) {
      expect(canRecordSportEvent(s.code, 'injury_incident')).toBe(false);
      expect(canRecordSportEvent(s.code, s.events[0]!.id)).toBe(true);
    }
  });
});

describe('vóley', () => {
  it('mejor de 5, sets a 25 y desempate a 15', () => {
    const events: ScoredEvent[] = [];
    let n = 0;
    const points = (side: 'own' | 'opponent', count: number) => {
      for (let i = 0; i < count; i++) events.push({ id: String(++n), createdAt: new Date(n * 1000), side, type: 'volley_point' });
    };
    points('own', 25);
    points('opponent', 25);
    points('own', 25);
    let s = volleyballState(events);
    expect([s.ownSets, s.opponentSets, s.sets.length]).toEqual([2, 1, 4]);
    points('opponent', 25);
    expect(volleyballState(events).sets).toHaveLength(5);
    points('own', 15);
    s = volleyballState(events);
    expect([s.ownSets, s.complete, s.sets[4]!.own]).toEqual([3, true, 15]);
    expect(() => validateVolleyballAction(s, 'volley_point', 'own')).toThrow();
    expect(matchEventScore(events, 'volleyball')).toEqual({ own: 3, opponent: 2 });
  });
  it('límites por set: 2 tiempos, 6 cambios, rotación solo propia', () => {
    const st = volleyballState([]);
    expect(validateVolleyballAction(st, 'volley_attack', 'own')).toBe(1);
    st.sets[0]!.ownTimeouts = 2;
    expect(() => validateVolleyballAction(st, 'volley_timeout', 'own')).toThrow();
    st.sets[0]!.ownSubstitutions = 6;
    expect(() => validateVolleyballAction(st, 'volley_substitution', 'own')).toThrow();
    expect(() => validateVolleyballAction(st, 'volley_rotation', 'opponent')).toThrow();
  });
});

describe('softball', () => {
  it('visitante batea primero; outs, hits, carreras y jonrón', () => {
    const ev: ScoredEvent[] = [];
    let i = 0;
    const add = (type: string, side: 'own' | 'opponent') => ev.push({ id: String(++i), type, side, createdAt: new Date(i * 1000) });
    const st = () => softballState(ev, { home: true });
    expect(st().battingSide).toBe('opponent');
    add('softball_single', 'opponent');
    add('softball_run', 'opponent');
    expect([st().opponent, st().hits.opponent]).toEqual([1, 1]);
    add('softball_strikeout', 'opponent');
    add('softball_out', 'opponent');
    add('softball_out', 'opponent');
    expect([st().half, st().battingSide]).toEqual(['bottom', 'own']);
    expect(() => validateSoftballAction(st(), 'softball_run', 'opponent')).toThrow();
    add('softball_home_run', 'own');
    add('softball_run', 'own');
    expect([st().own, st().hits.own]).toEqual([2, 1]);
    expect(validateSoftballAction(st(), 'softball_out', 'own')).toBe(1);
  });
  it('siete entradas, extras en empate y walk-off', () => {
    const ev: ScoredEvent[] = [];
    let n = 0;
    const add = (type: string, side: 'own' | 'opponent') => ev.push({ id: String(++n).padStart(4, '0'), type, side, createdAt: new Date(n * 1000) });
    for (let inning = 1; inning <= 7; inning++) {
      for (let k = 0; k < 3; k++) add('softball_out', 'opponent');
      if (inning === 7) expect(softballState(ev).half).toBe('bottom');
      for (let k = 0; k < 3; k++) add('softball_out', 'own');
    }
    let s = softballState(ev);
    expect([s.inning, s.extraInnings]).toEqual([8, true]);
    for (let k = 0; k < 3; k++) add('softball_out', 'opponent');
    add('softball_home_run', 'own');
    s = softballState(ev);
    expect([s.complete, s.own]).toEqual([true, 1]);
    expect(() => validateSoftballAction(s, 'softball_out', 'own')).toThrow();
  });
});

describe('reloj de la mesa', () => {
  it('primer tiempo desde 00:00, pausa sin perder segundos', () => {
    const first = clockUpdate(null, 'start_first_half', at('00:00'), R);
    expect(clockElapsed(first, at('03:15'))).toBe(195);
    expect(clockMinute(first, at('03:15'), R)).toBe(3);
    const paused = clockUpdate(first, 'pause', at('03:15'), R);
    expect([paused.elapsedSeconds, paused.runningSince]).toEqual([195, null]);
    expect(clockElapsed(paused, at('09:55'))).toBe(195);
    const resumed = clockUpdate(paused, 'resume', at('10:00'), R);
    expect(clockElapsed(resumed, at('11:30'))).toBe(285);
  });
  it('entretiempo y segundo tiempo con desplazamiento de 40', () => {
    const half = clockUpdate(clockUpdate(null, 'start_first_half', at('00:00'), R), 'half_time', at('41:30'), R);
    expect(half.phase).toBe('halftime');
    const second = clockUpdate(half, 'start_second_half', at('45:00'), R);
    expect(clockMinute(second, at('45:00'), R)).toBe(40);
    expect(clockMinute(second, at('48:00'), R)).toBe(43);
    const paused = clockUpdate(second, 'pause', at('48:04'), R);
    expect(clockMinute(paused, at('50:00'), R)).toBe(43);
    expect(clockView(paused, at('50:00'), R).running).toBe(false);
  });
  it('rechaza transiciones inválidas', () => {
    expect(clockMinute(null, at('00:00'), R)).toBeNull();
    expect(clockView(null, at('00:00'), R).phase).toBe('not_started');
    expect(() => clockUpdate(null, 'resume', at('00:00'), R)).toThrow(ClockError);
    expect(() => clockUpdate(null, 'start_second_half', at('00:00'), R)).toThrow(ClockError);
    const first = clockUpdate(null, 'start_first_half', at('00:00'), R);
    expect(() => clockUpdate(first, 'start_first_half', at('00:01'), R)).toThrow();
    expect(() => clockUpdate(first, 'bad' as never, at('00:01'), R)).toThrow();
  });
  it('pantalla cerrada: el reloj sigue bien; desfasaje negativo se recorta', () => {
    const clock = { phase: 'second_half', elapsedSeconds: 85, addedMinutes: 0, runningSince: at('01:00') };
    expect(clockMinute(clock, at('10:00'), R)).toBe(50);
    expect(clockElapsed(clock, at('00:00'))).toBe(85);
  });
  it('terminar el reloj solo en el último período y sin reiniciarlo', () => {
    const first = clockUpdate(null, 'start_first_half', at('00:00'), R);
    expect(() => clockUpdate(first, 'finish_clock', at('01:00'), R)).toThrow(ClockError);
    const second = clockUpdate(clockUpdate(first, 'half_time', at('40:00'), R), 'start_second_half', at('45:00'), R);
    const stopped = clockUpdate(clockUpdate(second, 'pause', at('46:10'), R), 'finish_clock', at('48:00'), R);
    expect(stopped.elapsedSeconds).toBe(70);
    for (const a of ['resume', 'pause', 'finish_clock', 'start_first_half'] as const) expect(() => clockUpdate(stopped, a, at('49:00'), R)).toThrow(ClockError);
  });
  it('hockey por cuartos; vóley y softball sin reloj; adicional solo en fútbol', () => {
    const q1 = clockUpdate(null, 'start_first_half', at('00:00'), 'hockey');
    expect(q1.phase).toBe('quarter_1');
    const b1 = clockUpdate(q1, 'half_time', at('15:00'), 'hockey');
    const q2 = clockUpdate(b1, 'start_second_half', at('17:00'), 'hockey');
    expect([q2.phase, clockMinute(q2, at('18:00'), 'hockey')]).toEqual(['quarter_2', 16]);
    expect(() => clockUpdate(null, 'start_first_half', at('00:00'), 'volleyball')).toThrow(ClockError);
    expect(() => clockUpdate(q2, 'add_time', at('18:00'), 'hockey')).toThrow(ClockError);
    const f = clockUpdate(null, 'start_first_half', at('00:00'), 'football_11');
    expect(clockUpdate(f, 'add_time', at('45:00'), 'football_11').addedMinutes).toBe(1);
  });
});

it('disponibilidad: ausencia primero, después salud; nunca el detalle médico', () => {
  expect(playerAvailability(true, 'no_restrictions').code).toBe('absent');
  expect(playerAvailability(false, 'unavailable').label).toBe('No disponible (salud)');
  expect(playerAvailability(false, null).code).toBe('unknown');
});
