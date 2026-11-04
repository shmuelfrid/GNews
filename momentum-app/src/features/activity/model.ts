/* Activity feature — pure helpers (ported from the web activity.js). No React, no store: unit-testable. */
import { activeFor, addDays, hasActivity, kcalPerMin, workoutsFor, workoutType, WORKOUT_TYPES } from '@/lib/calc';
import type { IconName } from '@/components/icons';
import type { Activity, DayDoc, WorkoutEntry } from '@/lib/types';

const fin = (v: unknown): v is number => typeof v === 'number' && isFinite(v);
export const round1 = (v: number) => Math.round(v * 10) / 10;

export const FORM_TYPES = ['treadmill_walk', 'treadmill_run', 'walk', 'run', 'cycling', 'strength', 'swim', 'hiit', 'yoga', 'other'] as const;
export const TYPE_OPTIONS = FORM_TYPES.map(id => ({ value: id as string, label: WORKOUT_TYPES.find(w => w.id === id)!.label }));
export const TYPE_ICON: Record<string, IconName> = {
  treadmill_walk: 'activity', treadmill_run: 'activity', walk: 'steps', run: 'activity', cycling: 'route', strength: 'dumbbell',
  swim: 'activity', hiit: 'bolt', yoga: 'heart', other: 'flame',
};
export const typeLabel = (id: unknown) => workoutType(id).label;
export const typeIcon = (id: unknown): IconName => TYPE_ICON[workoutType(id).id] || 'flame';
export const isTreadmill = (id: string) => id === 'treadmill_walk' || id === 'treadmill_run';

export type SpeedUnit = 'mph' | 'km/h';
export const speedUnitFor = (unit: 'lb' | 'kg'): SpeedUnit => (unit === 'lb' ? 'mph' : 'km/h');
/** default treadmill speed / incline per type and unit */
export const TM_DEFAULT: Record<string, Record<'lb' | 'kg', [number, number]>> = {
  treadmill_walk: { lb: [3.5, 5], kg: [5.6, 5] },
  treadmill_run: { lb: [6, 1], kg: [9.7, 1] },
};

/** Treadmill details live in the note ("3.5 mph · 5% incline · user note"), same as the web app, so the data stays compatible. */
const TM_RE = /^(\d+(?:\.\d+)?) (mph|km\/h) · (\d+(?:\.\d+)?)% incline(?: · ([\s\S]*))?$/;
export function splitNote(note: string | undefined | null): { speed: number | null; unit: SpeedUnit | null; incline: number | null; note: string } {
  const m = TM_RE.exec(String(note || ''));
  if (!m) return { speed: null, unit: null, incline: null, note: note || '' };
  return { speed: +m[1], unit: m[2] as SpeedUnit, incline: +m[3], note: m[4] || '' };
}
export function joinNote(type: string, speed: number | null, incline: number | null, note: string, unit: SpeedUnit): string {
  const parts: string[] = [];
  if (isTreadmill(type) && fin(speed) && speed > 0) parts.push(round1(speed) + ' ' + unit + ' · ' + round1(fin(incline) ? incline : 0) + '% incline');
  if (note && note.trim()) parts.push(note.trim());
  return parts.join(' · ');
}

export type Intensity = 'easy' | 'moderate' | 'hard';
export const INTENSITY: Record<Intensity, number> = { easy: 0.8, moderate: 1, hard: 1.2 };
/** ACSM treadmill equations (walk / run) → kcal per minute; other types use calc METs × intensity */
export function kcalPerMinFor(s: { type: string; speed?: number | null; incline?: number | null; intensity?: Intensity }, kg: number, speedUnit: SpeedUnit): number {
  if (isTreadmill(s.type) && fin(s.speed) && s.speed > 0) {
    const mph = speedUnit === 'mph' ? s.speed : s.speed / 1.609344;
    const m = mph * 26.8224, g = (fin(s.incline) ? s.incline : 0) / 100;
    const run = s.type === 'treadmill_run' || mph >= 4.6;
    const vo2 = run ? 0.2 * m + 0.9 * m * g + 3.5 : 0.1 * m + 1.8 * m * g + 3.5;
    return vo2 * kg / 1000 * 5;
  }
  return kcalPerMin(workoutType(s.type).met * (INTENSITY[s.intensity || 'moderate'] || 1), kg);
}

/* ---------------- week of activity ---------------- */
export interface WeekDay { key: string; active: number; workouts: number; total: number; has: boolean; steps: number | null; estimated: boolean }
export function dayActiveTotal(d: DayDoc, kg: number): Omit<WeekDay, 'key'> {
  const a = activeFor(d, kg), w = workoutsFor(d);
  return { active: a.kcal, workouts: w.kcal, total: a.kcal + w.kcal, has: hasActivity(d) || (d.workouts || []).length > 0, steps: a.steps, estimated: a.estimated };
}
export function weekData(getDay: (k: string) => DayDoc, key: string, kg: number): WeekDay[] {
  const out: WeekDay[] = [];
  for (let i = 6; i >= 0; i--) { const k = addDays(key, -i); out.push({ key: k, ...dayActiveTotal(getDay(k), kg) }); }
  return out;
}
export interface WeekSummary { any: boolean; avg: number | null; bestKey: string | null; title: string; takeaway: { text: string; bold?: string; after?: string } | null; doneCount: number }
/** headline + takeaway for the 7-day chart. `today` = today's key, `wdName(k)` = 'Monday' style. */
export function weekSummary(wk: WeekDay[], today: string, wdName: (k: string) => string, int: (n: number) => string): WeekSummary {
  const any = wk.some(d => d.has);
  const done = wk.filter(d => d.has && d.key !== today);
  const avg = done.length ? Math.round(done.reduce((s, d) => s + d.total, 0) / done.length) : null;
  const best = done.length ? done.reduce((a, b) => (b.total > a.total ? b : a)) : null;
  const cur = wk[wk.length - 1];
  let bestKey = best ? best.key : null;
  if (cur.has && (!best || cur.total > best.total)) bestKey = cur.key;
  const wd = (k: string) => (k === today ? 'Today' : k === addDays(today, -1) ? 'Yesterday' : wdName(k));
  let title: string;
  if (!any) title = 'Nothing to chart yet';
  else if (!best) title = (cur.key === today ? 'Today so far: ' : wd(cur.key) + ': ') + int(cur.total) + ' active kcal';
  else if (cur.has && cur.total > best.total) title = (cur.key === today ? 'Today is' : wd(cur.key) + ' was') + ' your most active day this week';
  else title = 'Most active: ' + wd(best.key) + ', ' + int(best.total) + ' kcal';
  let takeaway: WeekSummary['takeaway'] = null;
  if (avg != null && cur.has) {
    const diff = cur.total - avg;
    const who = cur.key === today ? 'Today you’re' : wd(cur.key) + ' was';
    if (Math.abs(diff) < 25) takeaway = { text: who + ' right on your ' + done.length + '-day average.' };
    else takeaway = { text: who + ' ', bold: int(Math.abs(diff)) + ' kcal ' + (diff > 0 ? 'above' : 'below'), after: ' your ' + done.length + '-day average' + (cur.key === today && diff < 0 ? ' so far.' : '.') };
  } else if (avg != null) {
    takeaway = { text: 'Nothing logged ' + (cur.key === today ? 'today' : 'that day') + ' yet. Your ' + done.length + '-day average is ', bold: int(avg) + ' kcal', after: '.' };
  }
  return { any, avg, bestKey, title, takeaway, doneCount: done.length };
}

/* ---------------- Samsung export selection ---------------- */
export type ExportRange = '7' | '30' | '90' | 'all';
export function filterExport(r: { days: Record<string, Partial<Activity>>; workouts: Partial<WorkoutEntry>[] }, range: ExportRange, today: string, keyOf: (t: number) => string) {
  const cut = range === 'all' ? '0000-00-00' : addDays(today, -(+range - 1));
  const keys = Object.keys(r.days).filter(k => k >= cut && k <= today).sort();
  const workouts = r.workouts.filter(w => { const k = keyOf(w.t as number); return k >= cut && k <= today; });
  const st = keys.map(k => r.days[k].steps).filter(fin) as number[];
  const kc = keys.map(k => r.days[k].activeKcal).filter(fin) as number[];
  const all = keys.concat(workouts.map(w => keyOf(w.t as number))).sort();
  return {
    keys, dayCount: keys.length, workouts,
    avgSteps: st.length ? Math.round(st.reduce((a, b) => a + b, 0) / st.length) : null,
    avgKcal: kc.length ? Math.round(kc.reduce((a, b) => a + b, 0) / kc.length) : null,
    from: all[0] || null, to: all[all.length - 1] || null,
  };
}

/* ---------------- double-count guard ---------------- */
/** A manual/photo workout that overlaps (±30 min start) a Health Connect session on the same day is the same workout:
 *  the HC session's calories are already in the day's active kcal, so the manual one must be marked countedInSamsung. */
export function overlapping(manual: Pick<WorkoutEntry, 't' | 'countedInSamsung' | 'source'>, hc: Pick<WorkoutEntry, 't'>, windowMin = 30): boolean {
  return !manual.countedInSamsung && manual.source !== 'health-connect' && Math.abs(manual.t - hc.t) <= windowMin * 60000;
}

/* ---------------- manual / screenshot validation ---------------- */
export interface ActivityForm { steps: number | null; activeKcal: number | null; totalKcal?: number | null; activeMinutes?: number | null; distanceKm?: number | null }
export function validateActivity(f: ActivityForm): { steps?: string; activeKcal?: string } {
  const bad = (v: number | null | undefined, max: number) => v != null && (v < 0 || v > max);
  const e: { steps?: string; activeKcal?: string } = {};
  if (bad(f.steps, 200000)) e.steps = 'Enter a step count between 0 and 200,000.';
  if (bad(f.activeKcal, 15000)) e.activeKcal = 'Enter active calories between 0 and 15,000.';
  if (!e.steps && !e.activeKcal && f.steps == null && f.activeKcal == null) e.steps = 'Enter your steps, active calories, or both.';
  return e;
}
export function buildActivity(f: ActivityForm, source: Activity['source'], now = Date.now()): Partial<Activity> {
  const a: Partial<Activity> = { source, syncedAt: now };
  if (f.steps != null) a.steps = Math.round(f.steps);
  if (f.activeKcal != null) a.activeKcal = Math.round(f.activeKcal);
  if (f.totalKcal != null && source !== 'manual') a.totalKcal = Math.round(f.totalKcal);
  if (f.activeMinutes != null) a.activeMinutes = Math.round(f.activeMinutes);
  if (f.distanceKm != null && f.distanceKm > 0) a.distanceKm = f.distanceKm;
  return a;
}
export const SOURCE_TEXT: Record<Activity['source'], string> = {
  'health-connect': 'Samsung Health · Health Connect', 'samsung-screenshot': 'Samsung Health · screenshot', 'samsung-export': 'Samsung Health · data export', manual: 'Entered by hand',
};
