/* Momentum — calc: PURE functions (no RN, no storage). Faithful port of weight-tracker/js/calc.js.
   Canonical units: kg, kcal, cm, km. Days map = { 'YYYY-MM-DD': DayDoc }. `now` = ms timestamp. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { DayDoc, Days, Profile } from './types';

type P = Partial<Profile> | null | undefined;
type DayLike = Partial<DayDoc> | null | undefined;
type DaysLike = Record<string, DayLike> | null | undefined;

const DAY = 864e5;
export const LB = 0.45359237;
export const KCAL_PER_KG = 7700;
const pad2 = (n: number) => String(n).padStart(2, '0');
export const keyOf = (t: number | Date) => { const d = new Date(t); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
export const fromKey = (k: string) => { const p = String(k).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
export const addDays = (k: string, n: number) => { const d = fromKey(k); d.setDate(d.getDate() + n); return keyOf(d); };
export const diffDays = (a: string, b: string) => Math.round((fromKey(b).getTime() - fromKey(a).getTime()) / DAY);
export const weekStartKey = (k: string) => { const d = fromKey(k); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return keyOf(d); };
export const isValidKey = (k: unknown): k is string => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k || '') && !isNaN(fromKey(k).getTime());
const mean = (a: number[]) => a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const fin = (v: unknown): v is number => typeof v === 'number' && isFinite(v);
const int = (n: number) => fin(n) ? Math.round(n).toLocaleString('en-US') : '0';
const plural = (n: number, w: string) => n + ' ' + w + (n === 1 ? '' : 's');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// deterministic (Hermes Intl can differ): "Dec 18" / "Dec 18, 2027"
const fmtD = (k: string, now?: number) => { const d = fromKey(k); const same = d.getFullYear() === new Date(now || Date.now()).getFullYear(); return MONTHS[d.getMonth()] + ' ' + d.getDate() + (same ? '' : ', ' + d.getFullYear()); };
const uTo = (kg: number, unit: string) => unit === 'kg' ? kg : kg / LB;
const uAbs = (kg: number, unit: string) => Math.abs(uTo(kg, unit)).toFixed(1);
const uN = (kg: number, unit: string) => uTo(kg, unit).toFixed(1);

/* ---------------- body ---------------- */
export function age(birthYear: unknown, now?: number): number | null {
  if (!fin(+(birthYear as number))) return null;
  const y = new Date(now || Date.now()).getFullYear();
  return clamp(y - +(birthYear as number), 10, 110);
}
/** Mifflin–St Jeor resting burn, kcal/day */
export function bmr(sex: string | undefined, kg: number | null | undefined, heightCm: number | null | undefined, ageYears: number | null | undefined): number | null {
  if (!fin(kg) || !fin(heightCm) || !fin(ageYears)) return null;
  const base = 10 * kg + 6.25 * heightCm - 5 * ageYears;
  return Math.round(base + (sex === 'female' ? -161 : 5));
}
export function bmrFor(profile: P, kg: number | null | undefined, now?: number): number | null {
  if (!profile) return null;
  return bmr(profile.sex, kg, +(profile.heightCm as number), age(profile.birthYear, now));
}
/** share of the day elapsed for dayKey at `now`: past 1, future 0, today 0..1 */
export function dayFraction(dayKey: string, now: number): number {
  const today = keyOf(now);
  if (dayKey < today) return 1;
  if (dayKey > today) return 0;
  const d = new Date(now), start = fromKey(dayKey).getTime();
  const len = fromKey(addDays(dayKey, 1)).getTime() - start; // DST-safe
  return clamp((d.getTime() - start) / len, 0, 1);
}
export function bmrSoFar(bmrDay: number | null, dayKey: string, now: number): number { return fin(bmrDay) ? bmrDay * dayFraction(dayKey, now) : 0; }

/* ---------------- weight series ---------------- */
export interface DailyWeight { key: string; avg: number; min: number; max: number; n: number; entries: { id: string; kg: number; t: number; tags?: string[]; note?: string }[]; trend: number }
/** daily means with 7-day moving average trend, ascending */
export function dailyWeights(days: DaysLike): DailyWeight[] {
  const out: DailyWeight[] = [];
  const src = days || {};
  Object.keys(src).sort().forEach(k => {
    const ws = ((src[k] && src[k]!.weights) || []).filter(w => fin(w.kg));
    if (!ws.length) return;
    const kgs = ws.map(w => w.kg);
    out.push({ key: k, avg: mean(kgs), min: Math.min.apply(null, kgs), max: Math.max.apply(null, kgs), n: ws.length, entries: ws.slice().sort((a, b) => a.t - b.t), trend: NaN });
  });
  let j = 0;
  out.forEach((d, i) => {
    const from = addDays(d.key, -6);
    while (out[j].key < from) j++;
    d.trend = mean(out.slice(j, i + 1).map(x => x.avg));
  });
  return out;
}
/** trend value on or before key (null if none) */
export function trendAt(series: DailyWeight[], key: string): number | null { let r: number | null = null; for (let i = 0; i < series.length && series[i].key <= key; i++) r = series[i].trend; return r; }
export function currentKg(profile: P, days: DaysLike): number | null {
  const s = dailyWeights(days);
  return s.length ? s[s.length - 1].trend : (profile && fin(profile.startKg) ? profile.startKg : null);
}

/* ---------------- energy ---------------- */
export function activeFor(day: DayLike, kg: number | null | undefined) {
  const a = day && day.activity;
  if (a && fin(a.activeKcal)) return { kcal: a.activeKcal, source: (a.source || 'manual') as string, steps: fin(a.steps) ? a.steps : null, estimated: false };
  if (a && fin(a.steps)) return { kcal: Math.round(a.steps * stepKcal(kg)), source: (a.source || 'manual') as string, steps: a.steps as number | null, estimated: true };
  return { kcal: 0, source: 'none', steps: null as number | null, estimated: false };
}
/** workouts that add to burn (excludes ones already counted in Samsung Health) */
export function workoutsFor(day: DayLike) {
  const list = (day && day.workouts) || [];
  let counted = 0, excluded = 0;
  list.forEach(w => { if (w.countedInSamsung) excluded += +w.kcal || 0; else counted += +w.kcal || 0; });
  return { kcal: counted, excludedKcal: excluded, count: list.length, list };
}
export function eatenFor(day: DayLike) {
  const foods = (day && day.foods) || [];
  const sum = (k: 'kcal' | 'protein' | 'carbs' | 'fat') => foods.reduce((s, f) => s + (fin(f[k]) ? (f[k] as number) : 0), 0);
  return { kcal: sum('kcal'), protein: sum('protein'), carbs: sum('carbs'), fat: sum('fat'), count: foods.length };
}
export function hasActivity(day: DayLike): boolean { const a = day && day.activity; return !!(a && (fin(a.activeKcal) || fin(a.steps))); }
/** average active kcal over the n days before `key` that have activity data (null if none) */
export function avgActive(days: DaysLike, key: string, kg: number | null | undefined, n?: number): number | null {
  const vals: number[] = [];
  const src = days || {};
  for (let i = 1; i <= (n || 7); i++) { const d = src[addDays(key, -i)]; if (hasActivity(d)) vals.push(activeFor(d, kg).kcal); }
  return vals.length ? mean(vals) : null;
}

/** typical active kcal per onboarding activity baseline (used until real activity data exists) */
export const BASELINE_ACTIVE: Record<string, number> = { low: 200, some: 350, high: 550 };

/* ---------------- activity equivalents ---------------- */
export const MET = { treadmill: 6.0, walk: 4.3, run: 9.8 };
export const kcalPerMin = (met: number, kg: number | null | undefined) => fin(kg) ? met * 3.5 * kg / 200 : 0;
export const stepKcal = (kg: number | null | undefined) => 0.0005 * (fin(kg) ? kg : 80);
export interface Equivalents { kcal: number; treadmillMin: number; walkMin: number; runMin: number; steps: number; perMin: { treadmill: number; walk: number; run: number }; perStep: number }
/** how to burn `kcal`: minutes on treadmill (3.5 mph, 5%), brisk walk (3.5 mph), run (6 mph), or steps */
export function equivalents(kcal: number, kg: number | null | undefined): Equivalents {
  kcal = Math.max(0, kcal || 0);
  const m = (met: number) => kcalPerMin(met, kg) > 0 ? Math.ceil(kcal / kcalPerMin(met, kg)) : 0;
  return {
    kcal: Math.round(kcal),
    treadmillMin: m(MET.treadmill), walkMin: m(MET.walk), runMin: m(MET.run),
    steps: Math.ceil(kcal / stepKcal(kg) / 100) * 100,
    perMin: { treadmill: kcalPerMin(MET.treadmill, kg), walk: kcalPerMin(MET.walk, kg), run: kcalPerMin(MET.run, kg) },
    perStep: stepKcal(kg),
  };
}
export interface WorkoutType { id: string; label: string; met: number; hint: string }
export const WORKOUT_TYPES: WorkoutType[] = [
  { id: 'treadmill_walk', label: 'Treadmill walk', met: 6.0, hint: '3.5 mph, 5% incline' },
  { id: 'treadmill_run', label: 'Treadmill run', met: 9.8, hint: '6 mph' },
  { id: 'walk', label: 'Walk', met: 4.3, hint: 'Brisk, 3.5 mph' },
  { id: 'run', label: 'Run', met: 9.8, hint: '6 mph' },
  { id: 'cycling', label: 'Cycling', met: 7.5, hint: 'Moderate, 12–14 mph' },
  { id: 'strength', label: 'Strength', met: 5.0, hint: 'Weights, moderate' },
  { id: 'swim', label: 'Swim', met: 7.0, hint: 'Laps, moderate' },
  { id: 'hiit', label: 'HIIT', met: 8.0, hint: 'Intervals' },
  { id: 'yoga', label: 'Yoga', met: 2.5, hint: 'Hatha / flow' },
  { id: 'other', label: 'Other', met: 5.0, hint: 'Moderate effort' },
];
export function workoutType(id: unknown): WorkoutType {
  const s = String(id || '').toLowerCase().replace(/[\s-]+/g, '_');
  return WORKOUT_TYPES.find(w => w.id === s) ||
    WORKOUT_TYPES.find(w => s && (w.label.toLowerCase().replace(/\s+/g, '_') === s)) ||
    (/(tread)/.test(s) ? WORKOUT_TYPES[/run/.test(s) ? 1 : 0] : /run|jog/.test(s) ? WORKOUT_TYPES[3] : /walk|hike/.test(s) ? WORKOUT_TYPES[2] :
      /cycl|bik|spin/.test(s) ? WORKOUT_TYPES[4] : /strength|weight|lift/.test(s) ? WORKOUT_TYPES[5] : /swim/.test(s) ? WORKOUT_TYPES[6] :
        /hiit|interval|circuit/.test(s) ? WORKOUT_TYPES[7] : /yoga|pilates|stretch/.test(s) ? WORKOUT_TYPES[8] : WORKOUT_TYPES[9]);
}
export function estimateWorkoutKcal(typeId: unknown, minutes: number, kg: number | null | undefined): number { return Math.round(kcalPerMin(workoutType(typeId).met, kg) * (+minutes || 0)); }

/* ---------------- plan ---------------- */
const SCEN: Record<'lb' | 'kg', number[]> = { lb: [0.5, 1, 1.5].map(v => v * LB), kg: [0.25, 0.5, 0.75] };
export interface PlanScenario { id: 'relaxed' | 'steady' | 'ambitious'; label: string; kgPerWeek: number; kcalPerDay: number; budget: number | null; days: number; date: string; safe: boolean }
export interface Plan {
  dir: number; startKg: number; currentKg: number; goalKg: number; remainingKg: number; goalReached: boolean;
  targetDate: string | null; daysLeft: number | null; weeksLeft: number | null; kgPerWeek: number; kgPerDay: number; kcalPerDay: number;
  targetDeficit: number; typicalBurn: number | null; budget: number | null; minKcal: number; maxSafeKgPerWeek: number;
  tooFast: boolean; lowBudget: boolean; pastTarget: boolean; safe: boolean; safeKgPerWeek: number; safeDate: string | null;
  scenarios: PlanScenario[]; source: 'default' | 'date' | 'pace'; progress: number; changeKg: number;
}
/** plan(profile, {currentKg, now, typicalBurn}); typicalBurn = expected full-day burn. budget is null without it. */
export function plan(profile: P, opts?: { currentKg?: number | null; now?: number; typicalBurn?: number | null }): Plan {
  opts = opts || {};
  const now = opts.now || Date.now(), today = keyOf(now);
  const p: any = profile || {};
  const startKg: number = fin(p.startKg) ? p.startKg : (opts.currentKg as number);
  const cur: number = fin(opts.currentKg) ? opts.currentKg : startKg;
  const goalKg: number = fin(p.goalKg) ? p.goalKg : cur;
  const dir = Math.sign(goalKg - startKg) || -1;
  const remainingKg = Math.max(0, (goalKg - cur) * dir);
  const goalReached = remainingKg <= 0.05;
  const minKcal = p.sex === 'female' ? 1200 : 1500;
  const maxSafeKgPerWeek = 0.01 * (cur || 80);
  let daysLeft: number | null = null, kgPerWeek: number, targetDate: string | null = null, source: Plan['source'] = 'default';
  if (isValidKey(p.targetDate) && diffDays(today, p.targetDate) > 0) {
    targetDate = p.targetDate; daysLeft = diffDays(today, p.targetDate); kgPerWeek = remainingKg / daysLeft * 7; source = 'date';
  } else if (fin(p.paceKgPerWeek) && p.paceKgPerWeek > 0) {
    kgPerWeek = p.paceKgPerWeek; source = 'pace';
  } else { kgPerWeek = (p.unit === 'kg' ? 0.5 : 1 * LB); }
  if (daysLeft == null && kgPerWeek > 0) { daysLeft = Math.ceil(remainingKg / kgPerWeek * 7); targetDate = addDays(today, daysLeft); }
  if (goalReached) { kgPerWeek = 0; daysLeft = 0; }
  const pastTarget = isValidKey(p.targetDate) && diffDays(today, p.targetDate) <= 0 && !goalReached;
  const kgPerDay = kgPerWeek / 7;
  const kcalPerDay = Math.round(kgPerDay * KCAL_PER_KG);
  const targetDeficit = goalReached ? 0 : dir < 0 ? kcalPerDay : -kcalPerDay; // + = deficit, − = surplus
  const typicalBurn = fin(opts.typicalBurn) ? opts.typicalBurn : null;
  const budget = typicalBurn != null ? Math.round(typicalBurn - targetDeficit) : null;
  const tooFast = !goalReached && kgPerWeek > maxSafeKgPerWeek + 1e-9;
  const lowBudget = dir < 0 && budget != null && budget < minKcal;
  let safeKgPerWeek = maxSafeKgPerWeek;
  if (dir < 0 && typicalBurn != null) safeKgPerWeek = Math.min(safeKgPerWeek, Math.max(0, (typicalBurn - minKcal) * 7 / KCAL_PER_KG));
  const safeDate = !goalReached && (tooFast || lowBudget || pastTarget) && safeKgPerWeek > 0.01 ? addDays(today, Math.ceil(remainingKg / safeKgPerWeek * 7)) : null;
  const scenarios = (SCEN[p.unit === 'kg' ? 'kg' : 'lb']).map((kpw, i): PlanScenario => {
    const kcal = Math.round(kpw / 7 * KCAL_PER_KG);
    const sb = typicalBurn != null ? Math.round(typicalBurn - (dir < 0 ? kcal : -kcal)) : null;
    return {
      id: (['relaxed', 'steady', 'ambitious'] as const)[i], label: ['Relaxed', 'Steady', 'Ambitious'][i],
      kgPerWeek: kpw, kcalPerDay: kcal, budget: sb,
      days: remainingKg > 0 ? Math.ceil(remainingKg / kpw * 7) : 0,
      date: remainingKg > 0 ? addDays(today, Math.ceil(remainingKg / kpw * 7)) : today,
      safe: kpw <= maxSafeKgPerWeek + 1e-9 && !(dir < 0 && sb != null && sb < minKcal),
    };
  });
  return {
    dir, startKg, currentKg: cur, goalKg, remainingKg, goalReached, targetDate, daysLeft, weeksLeft: daysLeft != null ? daysLeft / 7 : null,
    kgPerWeek, kgPerDay, kcalPerDay, targetDeficit, typicalBurn, budget, minKcal, maxSafeKgPerWeek,
    tooFast, lowBudget, pastTarget, safe: !tooFast && !lowBudget, safeKgPerWeek, safeDate, scenarios, source,
    progress: Math.abs(goalKg - startKg) > 0 ? clamp(((cur - startKg) * dir) / Math.abs(goalKg - startKg), 0, 1) : 1,
    changeKg: cur - startKg,
  };
}

/* ---------------- daily energy balance ---------------- */
export type Balance = ReturnType<typeof balance>;
/** everything about one day's calories. Positive deficit = burned more than eaten. */
export function balance(profile: P, days: DaysLike, key?: string, now?: number) {
  now = now || Date.now(); days = days || {};
  const today = keyOf(now);
  key = key || today;
  const series = dailyWeights(days);
  const kg: number | null = trendAt(series, key) || (series.length ? series[0].trend : null) || (profile && profile.startKg) || null;
  const day = days[key] || null;
  const bmrDay = bmrFor(profile, kg, now) || 0;
  const frac = dayFraction(key, now);
  const isToday = key === today, isPast = key < today, isFuture = key > today;
  const act = activeFor(day, kg);
  const avg7 = avgActive(days, key, kg, 7);
  const baseAct = avg7 == null && profile ? BASELINE_ACTIVE[profile.activityBaseline as string] : undefined;
  const typAct = avg7 != null ? avg7 : fin(baseAct) ? baseAct : null;
  const work = workoutsFor(day);
  const eat = eatenFor(day);
  const resting = Math.round(bmrDay * frac);
  const activeExpected = isPast ? act.kcal : isToday ? Math.max(act.kcal, typAct || 0) : (typAct || 0);
  const burnSoFar = Math.round(resting + (isFuture ? 0 : act.kcal) + (isFuture ? 0 : work.kcal));
  const burnExpected = Math.round(bmrDay + activeExpected + work.kcal);
  const pl = plan(profile, { currentKg: kg, now, typicalBurn: bmrDay + (typAct != null ? Math.max(typAct, avg7 != null ? 0 : act.kcal) : act.kcal) });
  const rawBudget = Math.round(burnExpected - pl.targetDeficit);
  const belowFloor = pl.dir < 0 && rawBudget < pl.minKcal;
  const budget = belowFloor ? pl.minKcal : rawBudget;
  const left = Math.round(budget - eat.kcal);
  return {
    key, isToday, isPast, isFuture, kg, fraction: frac,
    bmr: bmrDay, resting, restingFull: bmrDay,
    active: act.kcal, activeSource: act.source, activeEstimated: act.estimated, steps: act.steps, activeAvg7: avg7 != null ? Math.round(avg7) : null, activeFromBaseline: avg7 == null && fin(baseAct), activeExpected: Math.round(activeExpected),
    workouts: work.kcal, workoutsExcluded: work.excludedKcal, workoutCount: work.count,
    burnSoFar, burnExpected,
    eaten: Math.round(eat.kcal), protein: eat.protein, carbs: eat.carbs, fat: eat.fat, foodCount: eat.count,
    deficitSoFar: Math.round(burnSoFar - eat.kcal), deficitExpected: Math.round(burnExpected - eat.kcal),
    targetDeficit: pl.targetDeficit, budget, rawBudget, left, over: left < 0, overBy: Math.max(0, -left),
    budgetFloor: pl.minKcal, belowFloor,
    gain: pl.dir > 0 && !pl.goalReached,
    hasFood: eat.count > 0, hasActivity: hasActivity(day), plan: pl,
  };
}
/** "What it takes today": eat under X, and if over budget how to burn it off. */
export function todayActions(bal: Balance) {
  const eq = equivalents(bal.gain ? 0 : bal.overBy, bal.kg);
  const gap = Math.max(0, bal.targetDeficit - bal.deficitExpected);
  return { eatUnder: Math.max(0, bal.budget), left: bal.left, overBy: bal.overBy, burnToFix: eq, extraBurnForTarget: equivalents(gap, bal.kg) };
}

/* ---------------- weight analysis ---------------- */
export interface WeekChange { start: string; end: string; change: number; hasData: boolean; partial: boolean }
export interface Milestone {
  id: string; kind: 'w' | 's'; title: string; sub: string; targetKg?: number; strict?: boolean; isGoal?: boolean; n?: number;
  earned: boolean; date: string | null; toGo: number;
}
export interface Milestones { weight: Milestone[]; streaks: Milestone[]; all: Milestone[]; next: Milestone | null }
export type WeightAnalysis = ReturnType<typeof weightAnalysis>;

export function weightAnalysis(profile: P, days: DaysLike, now?: number) {
  now = now || Date.now();
  const p: any = profile || {};
  const today = keyOf(now);
  const series = dailyWeights(days || {});
  const startKg: number = fin(p.startKg) ? p.startKg : (series[0] ? series[0].avg : (null as unknown as number));
  const goalKg: number = fin(p.goalKg) ? p.goalKg : startKg;
  const dir = Math.sign(goalKg - startKg) || -1;
  const toward = (d: number) => d * dir;
  const sorted: DailyWeight['entries'] = [];
  series.forEach(d => d.entries.forEach(e => sorted.push(e)));
  const last = series[series.length - 1] || null;
  const current: number = last ? last.trend : startKg;
  const latest = sorted[sorted.length - 1] || null;
  const ta = (k: string) => trendAt(series, k);
  const totalChange = fin(current) && fin(startKg) ? current - startKg : 0;
  const journey = Math.abs(goalKg - startKg) || 1;
  const progress = clamp(toward(totalChange) / journey, 0, 1);
  const remaining = Math.max(0, (goalKg - current) * dir);
  const goalReached = series.length > 0 && (current - goalKg) * dir >= 0;

  const weeks: WeekChange[] = [];
  if (series.length) {
    let ws = weekStartKey(series[0].key);
    const endWs = weekStartKey(today);
    let prev: number = p.startDate && p.startDate <= series[0].key && fin(p.startKg) ? p.startKg : series[0].avg;
    let guard = 0;
    while (ws <= endWs && guard++ < 600) {
      const we = addDays(ws, 6);
      const t = ta(we < today ? we : today);
      const hasData = series.some(d => d.key >= ws && d.key <= we);
      weeks.push({ start: ws, end: we, change: t != null ? t - prev : 0, hasData, partial: we >= today });
      if (t != null) prev = t;
      ws = addDays(ws, 7);
    }
  }
  const dataWeeks = weeks.filter(w => w.hasData);
  const complete = dataWeeks.filter(w => !w.partial);
  const prevWs = addDays(weekStartKey(today), -7);
  const lastWeek = complete.length && complete[complete.length - 1].start === prevWs ? complete[complete.length - 1] : null;
  const thisWeek = weeks.length && weeks[weeks.length - 1].partial ? weeks[weeks.length - 1] : null;
  let bestWeek: WeekChange | null = null;
  dataWeeks.forEach(w => { if (toward(w.change) > 0.05 && (!bestWeek || toward(w.change) > toward(bestWeek.change))) bestWeek = w; });
  const weeksToward = dataWeeks.filter(w => toward(w.change) > 0.01).length;
  const daysSinceLog = last ? diffDays(last.key, today) : null;
  const t7 = ta(addDays(today, -7));
  const change7 = last && t7 != null && last.key >= addDays(today, -3) ? current - t7 : null;

  const startK: string = isValidKey(p.startDate) ? p.startDate : (series[0] ? series[0].key : today);
  const elapsed = diffDays(startK, today);
  const paceAll = elapsed >= 7 && series.length >= 2 ? totalChange / elapsed * 7 : null;
  const recent = series.filter(d => d.key >= addDays(today, -27));
  let slope: number | null = null;
  if (recent.length >= 4 && diffDays(recent[0].key, recent[recent.length - 1].key) >= 6) {
    const xs = recent.map(d => diffDays(recent[0].key, d.key)), ys = recent.map(d => d.avg);
    const mx = mean(xs), my = mean(ys);
    let num = 0, den = 0;
    xs.forEach((x, i) => { num += (x - mx) * (ys[i] - my); den += (x - mx) * (x - mx); });
    slope = den ? num / den : 0;
  }
  const pace4 = slope != null ? slope * 7 : null;
  let projKey: string | null = null, projDays: number | null = null;
  if (!goalReached && slope != null && toward(slope) > 0.0005 && remaining > 0) {
    projDays = Math.ceil(remaining / Math.abs(slope));
    if (projDays <= 3 * 365) projKey = addDays(today, projDays); else projDays = null;
  }
  const target: string | null = isValidKey(p.targetDate) ? p.targetDate : null;
  const scheduleDays = projKey && target ? diffDays(projKey, target) : null; // + = ahead
  const neededPace = target && !goalReached && diffDays(today, target) > 0 ? remaining / diffDays(today, target) * 7 : null;

  const daySet = new Set(series.map(d => d.key));
  let streak = 0;
  { let k = daySet.has(today) ? today : addDays(today, -1); while (daySet.has(k)) { streak++; k = addDays(k, -1); } }
  let longest = 0, run = 0, prevK: string | null = null;
  series.forEach(d => { run = prevK && diffDays(prevK, d.key) === 1 ? run + 1 : 1; longest = Math.max(longest, run); prevK = d.key; });

  let extreme: DailyWeight['entries'][number] | null = null;
  sorted.forEach(e => { if (!extreme || (e.kg - extreme.kg) * dir > 0) extreme = e; });
  let best30 = false;
  if (last && last.key >= addDays(today, -1)) {
    const d30 = series.filter(d => d.key >= addDays(today, -29));
    if (d30.length >= 7 && series.length >= 10) best30 = d30.every(d => d === last || (last.avg - d.avg) * dir > 0);
  }
  const meDiffs: number[] = [];
  series.forEach(d => {
    const m = d.entries.filter(e => new Date(e.t).getHours() < 12).map(e => e.kg);
    const ev = d.entries.filter(e => new Date(e.t).getHours() >= 17).map(e => e.kg);
    if (m.length && ev.length) meDiffs.push(mean(ev) - mean(m));
  });
  const morningVsEvening = meDiffs.length >= 3 ? { diff: mean(meDiffs), days: meDiffs.length } : null;
  const swings = series.filter(d => d.n >= 2).map(d => d.max - d.min);
  const swing = swings.length >= 3 ? { avg: mean(swings), max: Math.max.apply(null, swings), days: swings.length } : null;

  const base = {
    today, dir, series, days: series, sorted, last, current, latest, startKg, goalKg, totalChange, journey, progress, remaining, goalReached,
    weeks, dataWeeks, lastWeek: lastWeek as WeekChange | null, thisWeek: thisWeek as WeekChange | null, bestWeek: bestWeek as WeekChange | null,
    weeksToward, change7, paceAll, pace4, slope, projKey, projDays, target,
    scheduleDays, neededPace, daysSinceLog, streak, longest, extreme: extreme as DailyWeight['entries'][number] | null, best30, morningVsEvening, swing, startK, elapsed, toward,
    unit: (p.unit === 'kg' ? 'kg' : 'lb') as 'kg' | 'lb',
    trendAt: (k: string) => ta(k),
  };
  return Object.assign(base, { milestones: milestones(p, base) });
}

/* ---------------- milestones ---------------- */
export function milestones(p: P, a: { dir: number; startKg: number; goalKg: number; series: DailyWeight[]; current: number; streak: number }): Milestones {
  const pp: any = p || {};
  const unit = pp.unit === 'kg' ? 'kg' : 'lb', dir = a.dir;
  const conv = unit === 'lb' ? LB : 1;
  const list: Milestone[] = [];
  const mk = (o: Omit<Milestone, 'earned' | 'date' | 'toGo'>): Milestone => Object.assign({ earned: false, date: null, toGo: 0 }, o);
  if (fin(a.startKg) && fin(a.goalKg)) {
    const sU = uTo(a.startKg, unit), gU = uTo(a.goalKg, unit);
    const journeyU = Math.abs(gU - sU);
    const word = dir < 0 ? 'down' : 'up';
    for (let n = 5; n < journeyU - 0.05; n += 5) list.push(mk({ id: 'amt-' + unit + '-' + n, kind: 'w', title: n + ' ' + unit + ' ' + word, targetKg: a.startKg + dir * n * conv, sub: 'Every 5 ' + unit + ' counts' }));
    if (journeyU >= 2) list.push(mk({ id: 'half', kind: 'w', title: 'Halfway there', targetKg: a.startKg + (a.goalKg - a.startKg) / 2, sub: '50% of the journey' }));
    if (dir < 0) { for (let v = Math.floor((sU - 0.001) / 10) * 10; v > gU + 0.001; v -= 10) list.push(mk({ id: 'dec-' + unit + '-' + v, kind: 'w', strict: true, title: 'Under ' + v, targetKg: v * conv, sub: 'A new decade' })); }
    else { for (let v = Math.ceil((sU + 0.001) / 10) * 10; v < gU - 0.001; v += 10) list.push(mk({ id: 'dec-' + unit + '-' + v, kind: 'w', strict: true, title: 'Over ' + v, targetKg: v * conv, sub: 'A new decade' })); }
    list.push(mk({ id: 'goal', kind: 'w', title: 'Goal ' + (unit === 'lb' ? Math.round(gU) : gU.toFixed(1).replace(/\.0$/, '')) + ' ' + unit, targetKg: a.goalKg, sub: 'You did it', isGoal: true }));
    list.sort((x, y) => Math.abs((x.targetKg as number) - a.startKg) - Math.abs((y.targetKg as number) - a.startKg) || (x.isGoal ? 1 : -1));
  }
  const reached = (avg: number, m: Milestone) => m.strict ? (dir < 0 ? avg < (m.targetKg as number) - 1e-9 : avg > (m.targetKg as number) + 1e-9) : (avg - (m.targetKg as number)) * dir >= -1e-9;
  list.forEach(m => {
    const d = a.series.find(d => reached(d.trend, m));
    m.earned = !!d; m.date = d ? d.key : null;
    m.toGo = m.earned ? 0 : Math.abs(a.current - (m.targetKg as number));
  });
  const streaks = [7, 30, 100].map(n => mk({ id: 'streak-' + n, kind: 's', title: n + '-day streak', n, sub: 'Logged ' + n + ' days in a row' }));
  let run = 0, prevK: string | null = null;
  a.series.forEach(d => { run = prevK && diffDays(prevK, d.key) === 1 ? run + 1 : 1; prevK = d.key; streaks.forEach(s => { if (!s.date && run >= (s.n as number)) s.date = d.key; }); });
  streaks.forEach(s => { s.earned = !!s.date; s.toGo = s.earned ? 0 : (s.n as number) - a.streak; });
  const next = list.find(m => !m.earned) || null;
  return { weight: list, streaks, all: list.concat(streaks), next };
}
/** milestones earned but not yet in profile.celebrated, most recent first */
export function newlyCrossed(ms: Milestones, celebrated: string[] | undefined): Milestone[] {
  const seen = new Set(celebrated || []);
  return ms.all.filter(m => m.earned && !seen.has(m.id)).sort((x, y) => (y.date || '').localeCompare(x.date || ''));
}

/* ---------------- deficit analysis ---------------- */
export interface DeficitDay { key: string; logged: boolean; partial: boolean; eaten: number; burn: number; budget: number; deficit: number; gain: boolean; under: boolean; target: number }
export type DeficitAnalysis = ReturnType<typeof deficitAnalysis>;
/** last n days (ending today) of energy balance + summary. Completed = past day with food logged. */
export function deficitAnalysis(profile: P, days: DaysLike, now?: number, n?: number) {
  now = now || Date.now(); n = n || 7;
  const today = keyOf(now);
  const list: DeficitDay[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const k = addDays(today, -i);
    const b = balance(profile, days, k, now);
    const partial = k === today;
    const deficit = partial ? b.deficitSoFar : b.deficitExpected;
    list.push({ key: k, logged: b.hasFood, partial, eaten: b.eaten, burn: partial ? b.burnSoFar : b.burnExpected, budget: b.budget, deficit, gain: b.gain, under: b.hasFood && (b.gain ? b.eaten >= b.budget : b.eaten <= b.budget), target: b.targetDeficit });
  }
  const completed = list.filter(d => d.logged && !d.partial);
  const under = completed.filter(d => d.under).length;
  const total = completed.reduce((s, d) => s + d.deficit, 0);
  const series = dailyWeights(days || {});
  const t0 = trendAt(series, addDays(today, -n)), t1 = trendAt(series, today);
  let streakUnder = 0;
  for (let i = list.length - 1; i >= 0; i--) { const d = list[i]; if (d.partial) continue; if (d.logged && d.under) streakUnder++; else break; }
  let best: DeficitDay | null = null; completed.forEach(d => { if (!best || d.deficit > best.deficit) best = d; });
  return {
    days: list, completedCount: completed.length, underCount: under, total: Math.round(total),
    avg: completed.length ? Math.round(total / completed.length) : null,
    expectedKg: total / KCAL_PER_KG, actualKg: t0 != null && t1 != null ? t1 - t0 : null,
    streakUnder, best: best as DeficitDay | null, today: list[list.length - 1], gain: !!(list.length && list[list.length - 1].gain),
  };
}

/* ---------------- headlines ---------------- */
/** A headline: `parts` alternate plain/highlighted (odd indexes = emphasise). `text` is the joined sentence. Never NaN. */
export interface Headline { text: string; parts: string[] }
export function headlines(profile: P, days: DaysLike, now?: number): Headline[] {
  now = now || Date.now();
  const p: any = profile || {}, u = p.unit === 'kg' ? 'kg' : 'lb';
  const a = weightAnalysis(p, days, now);
  const da = deficitAnalysis(p, days, now, 7);
  const H: Headline[] = [];
  const add = (parts: string[]) => {
    const text = parts.join('');
    if (/NaN|undefined|null|Infinity/.test(text)) return;
    H.push({ text, parts });
  };
  if (!a.series.length && !da.completedCount) { add(['Day one. Log a weigh-in or a meal to start building your picture.']); return H; }
  if (a.daysSinceLog != null && a.daysSinceLog >= 3) add(['Welcome back. Your last weigh-in was ', plural(a.daysSinceLog, 'day') + ' ago', '. One log today restarts your streak.']);
  if (a.goalReached) add(['You reached ', uN(a.goalKg, u) + ' ' + u, '. That is your goal. Incredible work.']);
  if (a.lastWeek && a.toward(a.lastWeek.change) > 0.05) {
    const best = a.bestWeek === a.lastWeek && a.dataWeeks.length >= 3;
    add(['You ' + (a.lastWeek.change < 0 ? 'lost ' : 'gained '), uAbs(a.lastWeek.change, u) + ' ' + u, ' last week' + (best ? ', your best week yet.' : '.')]);
  } else if (a.change7 != null && a.toward(a.change7) > 0.05) {
    add(['', uAbs(a.change7, u) + ' ' + u + (a.change7 < 0 ? ' down' : ' up'), ' in the last 7 days. Keep that rhythm.']);
  }
  if (da.completedCount >= 2) add([da.gain ? 'You hit your calorie target ' : 'You stayed under budget ', da.underCount + ' of ' + da.completedCount + ' days', ' this week.']);
  if (da.completedCount >= 2 && da.total > 0) add(['This week’s deficit of ', int(da.total) + ' kcal', ' is about ' + uAbs(da.expectedKg, u) + ' ' + u + ' of fat.']);
  if (a.best30) add(['', (a.dir < 0 ? 'Lowest' : 'Highest') + ' weight in 30 days', '. The trend is real.']);
  const nx = a.milestones.next;
  if (nx && !nx.isGoal && nx.toGo > 0.05) add(['', uAbs(nx.toGo, u) + ' ' + u, ' to your next milestone: ' + nx.title + '.']);
  if (a.projKey && a.scheduleDays != null && a.scheduleDays >= 7) add(['On pace to reach ' + uN(a.goalKg, u) + ' ' + u + ' by ', fmtD(a.projKey, now), ', about ' + plural(Math.round(a.scheduleDays / 7), 'week') + ' early.']);
  else if (a.projKey) add(['At this pace you reach ' + uN(a.goalKg, u) + ' ' + u + ' around ', fmtD(a.projKey, now), '.']);
  if (a.streak >= 3) add(['', a.streak + '-day', ' logging streak. ' + (a.last && a.last.key === a.today ? 'Consistency is paying off.' : 'Log today to keep it going.')]);
  if (a.progress > 0.02 && !a.goalReached) add(['You are ', Math.round(a.progress * 100) + '%', ' of the way to ' + uN(a.goalKg, u) + ' ' + u + '.']);
  if (!H.length) add([a.series.length < 3 ? 'Great start. A few more days and your trend line appears.' : 'Every log sharpens the picture. You are building momentum.']);
  return H;
}

/* ================= BMI ================= */
export interface BmiCat { key: 'under' | 'healthy' | 'over' | 'obese'; label: string; min: number; max: number }
export const BMI_CATS: BmiCat[] = [
  { key: 'under', label: 'Underweight', min: 0, max: 18.5 },
  { key: 'healthy', label: 'Healthy', min: 18.5, max: 25 },
  { key: 'over', label: 'Overweight', min: 25, max: 30 },
  { key: 'obese', label: 'Obese', min: 30, max: Infinity },
];
export function bmi(kg: unknown, heightCm: unknown): number | null {
  if (!fin(kg) || !fin(heightCm) || kg <= 0 || heightCm <= 0) return null;
  const m = heightCm / 100;
  return kg / (m * m);
}
export function bmiCategory(b: unknown): BmiCat | null {
  if (!fin(b)) return null;
  const c = b < 18.5 ? BMI_CATS[0] : b < 25 ? BMI_CATS[1] : b < 30 ? BMI_CATS[2] : BMI_CATS[3];
  return Object.assign({}, c);
}
export function weightForBmi(b: unknown, heightCm: unknown): number | null {
  if (!fin(b) || !fin(heightCm) || heightCm <= 0) return null;
  const m = heightCm / 100;
  return b * m * m;
}
export const bmiForWeight = (kg: unknown, heightCm: unknown) => bmi(kg, heightCm);
export function healthyWeightRange(heightCm: unknown): { minKg: number; maxKg: number } | null {
  if (!fin(heightCm) || heightCm <= 0) return null;
  return { minKg: weightForBmi(18.5, heightCm) as number, maxKg: weightForBmi(24.9, heightCm) as number };
}

export type { Days };
