/**
 * Lógica deportiva pura, portada del core anterior (clumera-cmp, server/sports.mjs, match-clock,
 * match-lifecycle, match-live, match-stats, sport-availability) sin cambios de comportamiento.
 * Sin base de datos ni Next.js: se usa igual en el servidor y en la pantalla de la mesa.
 */
import catalogJson from './catalog.json' with { type: 'json' };

export interface SportEvent {
  id: string;
  label: string;
  points: number;
}
export interface SportDefinition {
  code: string;
  label: string;
  family: 'rugby' | 'football' | 'volleyball' | 'hockey' | 'basketball' | 'handball' | 'softball';
  fieldSize: number;
  periodCount: number;
  periodMinutes: number | null;
  positions: Array<{ id: string; label: string }>;
  events: SportEvent[];
}

export const SPORTS = Object.freeze(catalogJson as SportDefinition[]);
const byCode = new Map(SPORTS.map((s) => [s.code, s]));

export function sportDefinition(code: string): SportDefinition | null {
  return byCode.get(code) ?? null;
}
export function requireSport(code: string): SportDefinition {
  const s = sportDefinition(code);
  if (!s) throw new Error('Modalidad deportiva inválida');
  return s;
}
export function isSportEvent(code: string, type: string): boolean {
  return requireSport(code).events.some((e) => e.id === type);
}
/** Las lesiones no se registran desde la mesa: son del módulo de salud. */
export function canRecordSportEvent(code: string, type: string): boolean {
  return type !== 'injury_incident' && isSportEvent(code, type);
}
export function sportEventPoints(code: string, type: string): number {
  return requireSport(code).events.find((e) => e.id === type)?.points ?? 0;
}
export function sportEventLabel(code: string, type: string): string {
  return requireSport(code).events.find((e) => e.id === type)?.label ?? type;
}
/** Deportes por sets o entradas: sin cronómetro de tiempos. */
export function usesClock(code: string): boolean {
  const f = requireSport(code).family;
  return f !== 'volleyball' && f !== 'softball';
}

export interface ScoredEvent {
  id: string;
  type: string;
  side: 'own' | 'opponent';
  createdAt: Date | string;
  personId?: string | null;
}

const chronological = <T extends ScoredEvent>(events: T[]) =>
  [...events].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || String(a.id).localeCompare(String(b.id)));

// ───────────── Vóley: sets a 25 (quinto a 15), diferencia de 2, mejor de 5 ─────────────

const VOLLEY_POINTS = new Set(['volley_point', 'volley_attack', 'volley_block', 'volley_ace', 'volley_error']);
export interface VolleySet {
  number: number;
  own: number;
  opponent: number;
  winner: 'own' | 'opponent' | null;
  ownTimeouts: number;
  opponentTimeouts: number;
  ownSubstitutions: number;
  opponentSubstitutions: number;
  rotation: number;
}
const newSet = (number: number): VolleySet => ({ number, own: 0, opponent: 0, winner: null, ownTimeouts: 0, opponentTimeouts: 0, ownSubstitutions: 0, opponentSubstitutions: 0, rotation: 0 });

export function volleyballState(events: ScoredEvent[]) {
  const sets: VolleySet[] = [];
  let ownSets = 0;
  let opponentSets = 0;
  for (const event of chronological(events)) {
    if (!isSportEvent('volleyball', event.type)) continue;
    let set = sets[sets.length - 1];
    if (!set || set.winner) {
      if (ownSets === 3 || opponentSets === 3) continue;
      set = newSet(sets.length + 1);
      sets.push(set);
    }
    const own = event.side !== 'opponent';
    if (VOLLEY_POINTS.has(event.type)) {
      if (own) set.own++;
      else set.opponent++;
      const target = set.number === 5 ? 15 : 25;
      if (Math.max(set.own, set.opponent) >= target && Math.abs(set.own - set.opponent) >= 2) {
        set.winner = set.own > set.opponent ? 'own' : 'opponent';
        if (set.winner === 'own') ownSets++;
        else opponentSets++;
      }
    } else if (event.type === 'volley_timeout') {
      if (own) set.ownTimeouts++;
      else set.opponentTimeouts++;
    } else if (event.type === 'volley_substitution') {
      if (own) set.ownSubstitutions++;
      else set.opponentSubstitutions++;
    } else if (event.type === 'volley_rotation' && own) set.rotation = (set.rotation + 1) % 6;
  }
  const complete = ownSets === 3 || opponentSets === 3;
  const current = sets[sets.length - 1];
  const next = current?.winner && !complete ? newSet(sets.length + 1) : null;
  return { sets: next ? [...sets, next] : sets.length ? sets : [newSet(1)], ownSets, opponentSets, complete };
}

export function validateVolleyballAction(state: ReturnType<typeof volleyballState>, type: string, side: string): number {
  if (!['own', 'opponent'].includes(side) || !isSportEvent('volleyball', type)) throw new Error('Acción de vóley inválida');
  if (state.complete) throw new Error('El encuentro ya finalizó los sets');
  const set = state.sets[state.sets.length - 1]!;
  if (type === 'volley_timeout' && (side === 'own' ? set.ownTimeouts : set.opponentTimeouts) >= 2) throw new Error('Ya se usaron los 2 tiempos muertos de este set');
  if (type === 'volley_substitution' && (side === 'own' ? set.ownSubstitutions : set.opponentSubstitutions) >= 6) throw new Error('Ya se usaron los 6 cambios de este set');
  if (type === 'volley_rotation' && side !== 'own') throw new Error('La rotación del equipo rival no se controla desde esta mesa');
  return set.number;
}

// ───────────── Softball: 7 entradas, tres outs por media entrada, walk-off ─────────────

const SOFTBALL_RUNS = new Set(['softball_run', 'softball_home_run']);
const SOFTBALL_OUTS = new Set(['softball_out', 'softball_strikeout']);
const SOFTBALL_HITS = new Set(['softball_single', 'softball_double', 'softball_triple', 'softball_home_run']);
const SOFTBALL_BATTING = new Set(['softball_run', 'softball_single', 'softball_double', 'softball_triple', 'softball_home_run', 'softball_out', 'softball_strikeout', 'softball_walk', 'softball_stolen_base']);

/**
 * Marcador oficial por entradas sin acumulaciones manuales duplicadas. Jonrón cuenta una carrera
 * del bateador; las carreras adicionales se registran por separado. Tres outs cambian la media
 * entrada. No se aplica regla de ventaja automática.
 */
export function softballState(events: ScoredEvent[], { home = true }: { home?: boolean } = {}) {
  const homeSide = home ? 'own' : 'opponent';
  const awaySide = home ? 'opponent' : 'own';
  const innings: Array<{ number: number; own: number; opponent: number }> = [];
  let inning = 1;
  let half: 'top' | 'bottom' = 'top';
  let outs = 0;
  let complete = false;
  const score = { own: 0, opponent: 0 };
  const hits = { own: 0, opponent: 0 };
  const errors = { own: 0, opponent: 0 };
  const currentInning = () => {
    let row = innings[inning - 1];
    if (!row) {
      row = { number: inning, own: 0, opponent: 0 };
      innings.push(row);
    }
    return row;
  };
  currentInning();
  for (const event of chronological(events)) {
    if (complete || !isSportEvent('softball', event.type) || !['own', 'opponent'].includes(event.side)) continue;
    const battingSide = half === 'top' ? awaySide : homeSide;
    if (SOFTBALL_BATTING.has(event.type) && event.side !== battingSide) continue;
    if (event.type === 'softball_error' && event.side === battingSide) continue;
    if (SOFTBALL_RUNS.has(event.type)) {
      score[event.side]++;
      currentInning()[event.side]++;
    }
    if (SOFTBALL_HITS.has(event.type)) hits[event.side]++;
    if (event.type === 'softball_error') errors[event.side]++;
    if (half === 'bottom' && inning >= 7 && score[homeSide] > score[awaySide]) {
      complete = true;
      break;
    }
    if (SOFTBALL_OUTS.has(event.type)) {
      outs++;
      if (outs === 3) {
        outs = 0;
        if (half === 'top') {
          if (inning >= 7 && score[homeSide] > score[awaySide]) {
            complete = true;
            break;
          }
          half = 'bottom';
        } else {
          if (inning >= 7 && score.own !== score.opponent) {
            complete = true;
            break;
          }
          inning++;
          half = 'top';
          currentInning();
        }
      }
    }
  }
  return { innings, inning, half, outs, battingSide: half === 'top' ? awaySide : homeSide, homeSide, awaySide, own: score.own, opponent: score.opponent, hits, errors, complete, extraInnings: inning > 7 };
}

export function validateSoftballAction(state: ReturnType<typeof softballState>, type: string, side: string): number {
  if (!isSportEvent('softball', type)) throw new Error('Incidencia de softball inválida');
  if (state.complete) throw new Error('El partido ya terminó según las entradas registradas');
  if (!['own', 'opponent'].includes(side)) throw new Error('Equipo inválido');
  if (SOFTBALL_BATTING.has(type) && side !== state.battingSide) throw new Error('Esta acción corresponde al equipo al bate');
  if (type === 'softball_error' && side === state.battingSide) throw new Error('El error pertenece al equipo a la defensiva');
  if (state.outs >= 3) throw new Error('Ya hay tres outs');
  return state.inning;
}

// ───────────── Marcador ─────────────

export function matchEventScore(events: ScoredEvent[], sportCode: string, home = true): { own: number; opponent: number } {
  if (sportCode === 'volleyball') {
    const s = volleyballState(events);
    return { own: s.ownSets, opponent: s.opponentSets };
  }
  if (sportCode === 'softball') {
    const s = softballState(events, { home });
    return { own: s.own, opponent: s.opponent };
  }
  const result = { own: 0, opponent: 0 };
  for (const e of events) result[e.side === 'opponent' ? 'opponent' : 'own'] += sportEventPoints(sportCode, e.type);
  return result;
}

// ───────────── Reloj de la mesa ─────────────

export const CLOCK_PHASES = ['not_started', 'first_half', 'halftime', 'second_half', 'finished', 'quarter_1', 'quarter_2', 'quarter_3', 'quarter_4', 'break_1', 'break_2', 'break_3'] as const;
export type ClockPhase = (typeof CLOCK_PHASES)[number];
export type ClockAction = 'start_first_half' | 'pause' | 'resume' | 'half_time' | 'start_second_half' | 'add_time' | 'finish_clock';
export interface ClockState {
  phase: string;
  elapsedSeconds: number;
  addedMinutes: number;
  runningSince: Date | null;
}

export class ClockError extends Error {}

const isPeriod = (phase: string) => ['first_half', 'second_half', 'quarter_1', 'quarter_2', 'quarter_3', 'quarter_4'].includes(phase);

function periodOffset(phase: string, sportCode: string): number {
  const cfg = requireSport(sportCode);
  const p = cfg.periodMinutes ?? 0;
  if (phase === 'second_half' || (phase === 'finished' && cfg.periodCount === 2)) return p;
  const n = /^(?:quarter_|break_)([1-4])$/.exec(phase);
  if (n) return (Number(n[1]) - (phase.startsWith('break') ? 0 : 1)) * p;
  return phase === 'finished' && cfg.periodCount === 4 ? 3 * p : 0;
}

export function clockElapsed(clock: ClockState | null, now = new Date()): number {
  if (!clock) return 0;
  const base = Math.max(0, Math.floor(clock.elapsedSeconds || 0));
  if (!clock.runningSince) return base;
  return base + Math.max(0, Math.floor((now.getTime() - new Date(clock.runningSince).getTime()) / 1000));
}

export function clockMinute(clock: ClockState | null, now: Date, sportCode: string): number | null {
  if (!clock || !(CLOCK_PHASES as readonly string[]).includes(clock.phase) || clock.phase === 'not_started') return null;
  return Math.floor(clockElapsed(clock, now) / 60) + periodOffset(clock.phase, sportCode);
}

export function clockView(clock: ClockState | null, now: Date, sportCode: string) {
  const phase = clock?.phase && (CLOCK_PHASES as readonly string[]).includes(clock.phase) ? clock.phase : 'not_started';
  return { phase, running: Boolean(clock?.runningSince), elapsedSeconds: clockElapsed(clock, now), minute: clockMinute(clock, now, sportCode), addedMinutes: clock?.addedMinutes ?? 0, snapshotAt: now.toISOString() };
}

export function clockUpdate(clock: ClockState | null, action: ClockAction, now: Date, sportCode: string): ClockState {
  const cfg = requireSport(sportCode);
  const phase = clock?.phase ?? 'not_started';
  const current = clockElapsed(clock, now);
  const base: ClockState = { phase, elapsedSeconds: current, runningSince: null, addedMinutes: clock?.addedMinutes ?? 0 };
  const invalid = (message: string): never => {
    throw new ClockError(message);
  };
  if (!usesClock(sportCode)) invalid('Este deporte utiliza sets o entradas, no un cronómetro de tiempos');
  const quarter = cfg.periodCount === 4;
  switch (action) {
    case 'start_first_half':
      if (phase !== 'not_started') invalid('El tiempo ya se inició');
      return { phase: quarter ? 'quarter_1' : 'first_half', elapsedSeconds: 0, runningSince: now, addedMinutes: 0 };
    case 'pause':
      if (!isPeriod(phase) || !clock?.runningSince) invalid('El cronómetro no está corriendo');
      return base;
    case 'resume':
      if (!isPeriod(phase) || clock?.runningSince) invalid('El cronómetro no está pausado');
      return { ...base, runningSince: now };
    case 'half_time':
      if (quarter) {
        const n = Number(phase.replace('quarter_', ''));
        if (![1, 2, 3].includes(n) || !phase.startsWith('quarter_')) invalid('No es momento de terminar el cuarto');
        return { ...base, phase: `break_${n}` };
      }
      if (phase !== 'first_half') invalid('Solo se puede cerrar el primer tiempo');
      return { ...base, phase: 'halftime' };
    case 'start_second_half':
      if (quarter) {
        const n = Number(phase.replace('break_', ''));
        if (![1, 2, 3].includes(n) || !phase.startsWith('break_')) invalid('Primero hay que cerrar el cuarto');
        return { phase: `quarter_${n + 1}`, elapsedSeconds: 0, runningSince: now, addedMinutes: 0 };
      }
      if (phase !== 'halftime') invalid('Antes hay que marcar el entretiempo');
      return { phase: 'second_half', elapsedSeconds: 0, runningSince: now, addedMinutes: 0 };
    case 'add_time':
      if (cfg.family !== 'football' || !isPeriod(phase)) invalid('Tiempo adicional solo disponible durante un período de fútbol o futsal');
      if (base.addedMinutes >= 30) invalid('Se alcanzó el límite de tiempo adicional');
      return { ...base, runningSince: clock!.runningSince, addedMinutes: base.addedMinutes + 1 };
    case 'finish_clock':
      if (quarter ? phase !== 'quarter_4' : phase !== 'second_half') invalid('Solo se puede terminar el reloj durante el último período');
      return { ...base, phase: 'finished' };
    default:
      return invalid('Acción de cronómetro inválida');
  }
}

export const PHASE_LABEL: Record<string, string> = {
  not_started: 'Sin iniciar',
  first_half: '1.er tiempo',
  halftime: 'Entretiempo',
  second_half: '2.º tiempo',
  finished: 'Final',
  quarter_1: '1.er cuarto',
  quarter_2: '2.º cuarto',
  quarter_3: '3.er cuarto',
  quarter_4: '4.º cuarto',
  break_1: 'Descanso',
  break_2: 'Entretiempo',
  break_3: 'Descanso',
};

// ───────────── Ciclo del partido ─────────────
// La mesa pasa el partido a «final» (pending_close); solo el coach lo confirma como jugado.

export type MatchStatusName = 'scheduled' | 'live' | 'pending_close' | 'played' | 'cancelled';
export const isMatchLocked = (s: MatchStatusName) => s === 'played' || s === 'cancelled';
export const canDeskRecord = (status: MatchStatusName, clockPhase: string | null | undefined) => status === 'live' && clockPhase !== 'finished';

// ───────────── Disponibilidad (sin datos médicos) ─────────────

export type MedicalAvailability = 'under_review' | 'no_restrictions' | 'restricted' | 'unavailable' | null;
export function playerAvailability(absent: boolean, medical: MedicalAvailability) {
  if (absent) return { code: 'absent', label: 'Ausencia informada' } as const;
  if (medical === 'unavailable') return { code: 'unavailable', label: 'No disponible (salud)' } as const;
  if (medical === 'restricted') return { code: 'restricted', label: 'Con restricciones' } as const;
  if (medical === 'under_review') return { code: 'under_review', label: 'Pendiente de evaluación' } as const;
  if (medical === 'no_restrictions') return { code: 'no_restrictions', label: 'Sin restricciones informadas' } as const;
  return { code: 'unknown', label: 'Sin evaluación informada' } as const;
}
