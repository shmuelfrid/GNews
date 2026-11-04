/* Onboarding draft → profile (port of weight-tracker/js/views/onboarding.js). Pure, unit-tested. */
import * as C from '@/lib/calc';
import { addDays, diffDays, isValidKey, makeUnits, parseNum, todayKey } from '@/lib/format';
import type { Profile, Unit } from '@/lib/types';

export const LB = C.LB;
export const BASELINES = [
  { value: 'low', label: 'Mostly sitting', kcal: 200 },
  { value: 'some', label: 'On my feet some', kcal: 350 },
  { value: 'high', label: 'Very active', kcal: 550 },
] as const;
export type Baseline = typeof BASELINES[number]['value'];
export type Pace = 'relaxed' | 'steady' | 'ambitious';

export interface Draft {
  step: 1 | 2 | 3; unit: Unit; name: string; sex: '' | 'male' | 'female'; age: string; ft: string; inch: string; cm: string;
  weight: string; goal: string; weightEdited: boolean; mode: 'pace' | 'date'; date: string; pace: Pace; baseline: Baseline;
}
export const fmt1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, '');
const fin = (v: unknown): v is number => typeof v === 'number' && isFinite(v);

export function initDraft(p: Partial<Profile> | null | undefined, currentKg: number | null, now = Date.now()): Draft {
  p = p || {};
  const unit: Unit = p.unit === 'kg' ? 'kg' : 'lb';
  const U = makeUnits(unit);
  const cur = fin(currentKg) ? currentKg : fin(p.startKg) ? p.startKg : null;
  const fi = fin(p.heightCm) ? U.cmToFtIn(p.heightCm) : null;
  const today = C.keyOf(now);
  const future = isValidKey(p.targetDate) && p.targetDate > today;
  return {
    step: 1, unit, name: p.name || '', sex: p.sex === 'female' || p.sex === 'male' ? p.sex : '',
    age: fin(p.birthYear) ? String(new Date(now).getFullYear() - p.birthYear) : '',
    ft: fi ? String(fi.ft) : '', inch: fi ? String(fi.inch) : '', cm: fin(p.heightCm) ? String(Math.round(p.heightCm)) : '',
    weight: cur != null ? fmt1(U.to(cur)) : '', goal: fin(p.goalKg) ? fmt1(U.to(p.goalKg)) : '', weightEdited: false,
    mode: future ? 'date' : 'pace', date: future ? (p.targetDate as string) : '', pace: 'steady',
    baseline: (['low', 'some', 'high'].includes(p.activityBaseline as string) ? p.activityBaseline : 'some') as Baseline,
  };
}

export function heightCm(d: Draft): number {
  if (d.unit === 'kg') { const v = parseNum(d.cm); return v > 0 && v < 3 ? v * 100 : v; }
  const f = parseNum(d.ft), i = parseNum(d.inch);
  if (!isFinite(f)) return NaN;
  return makeUnits('lb').ftInToCm(f, isFinite(i) ? i : 0);
}
export const toKg = (d: Draft, v: number) => d.unit === 'lb' ? v * LB : v;

/** switch units, converting typed weights + height */
export function switchUnit(d: Draft, v: Unit): Draft {
  if (v === d.unit) return d;
  const h = heightCm(d);
  const conv = (s: string) => { const x = parseNum(s); return isFinite(x) ? fmt1(v === 'kg' ? x * LB : x / LB) : s; };
  const n: Draft = { ...d, unit: v, weight: conv(d.weight), goal: conv(d.goal) };
  if (isFinite(h) && h > 0) { const fi = makeUnits('lb').cmToFtIn(h); n.ft = String(fi.ft); n.inch = String(fi.inch); n.cm = String(Math.round(h)); }
  return n;
}

export function profileFrom(d: Draft, now = Date.now()): Partial<Profile> {
  const kg = toKg(d, parseNum(d.weight)), goalKg = toKg(d, parseNum(d.goal));
  const age = parseNum(d.age);
  const p: Partial<Profile> = { sex: d.sex || 'male', birthYear: new Date(now).getFullYear() - Math.round(age), heightCm: heightCm(d), unit: d.unit, startKg: kg, goalKg };
  if (d.mode === 'date' && isValidKey(d.date)) p.targetDate = d.date;
  else {
    const scen = C.plan({ ...p, targetDate: null }, { currentKg: kg, now }).scenarios.find(s => s.id === d.pace);
    p.targetDate = null; p.paceKgPerWeek = scen ? scen.kgPerWeek : (d.unit === 'kg' ? 0.5 : LB);
  }
  return p;
}

export function preview(d: Draft, now = Date.now()) {
  const p = profileFrom(d, now);
  if (!((p.startKg as number) > 25 && (p.goalKg as number) > 25 && (p.heightCm as number) > 100 && (p.birthYear as number) > 1900)) return null;
  const bmr = C.bmrFor(p, p.startKg, now) || 0;
  const base = (BASELINES.find(b => b.value === d.baseline) || BASELINES[1]).kcal;
  const typical = bmr + base;
  const pl = C.plan(p, { currentKg: p.startKg, typicalBurn: typical, now });
  return { p, bmr, typical, pl };
}

export type Errors = Partial<Record<'sex' | 'age' | 'height' | 'weight' | 'goal' | 'date', string>>;
export function validate(d: Draft, now = Date.now()): Errors {
  const e: Errors = {};
  if (d.step === 1) {
    if (!d.sex) e.sex = 'Choose one so we can estimate your resting burn.';
    const age = parseNum(d.age);
    if (!(age >= 13 && age <= 100)) e.age = 'Enter an age between 13 and 100.';
    const h = heightCm(d);
    if (d.unit === 'lb') { if (!(h >= 120 && h <= 230 && (parseNum(d.inch || '0') || 0) < 12)) e.height = 'Enter feet and inches, for example 5 ft 10 in.'; }
    else if (!(h >= 120 && h <= 230)) e.height = 'Enter your height in cm, for example 178.';
  } else if (d.step === 2) {
    const lo = d.unit === 'lb' ? 66 : 30, hi = d.unit === 'lb' ? 770 : 350;
    const w = parseNum(d.weight), g = parseNum(d.goal);
    if (!(w >= lo && w <= hi)) e.weight = 'Enter your weight in ' + d.unit + '.';
    if (!(g >= lo && g <= hi)) e.goal = 'Enter a goal weight in ' + d.unit + '.';
    else if (Math.abs(g - w) < 0.5) e.goal = 'Pick a goal at least 0.5 ' + d.unit + ' away from today.';
  } else if (d.step === 3 && d.mode === 'date') {
    if (!(isValidKey(d.date) && diffDays(C.keyOf(now), d.date) >= 7)) e.date = 'Choose a date at least a week from today.';
  }
  return e;
}

/** weight-step notices: amount to lose/gain, and a too-low goal warning */
export function weightNotes(d: Draft): { amount: string | null; lowGoal: string | null } {
  const w = parseNum(d.weight), g = parseNum(d.goal);
  if (!(w > 0 && g > 0)) return { amount: null, lowGoal: null };
  const diff = g - w;
  const amount = Math.abs(diff) >= 0.5 ? fmt1(Math.abs(diff)) + ' ' + d.unit + (diff < 0 ? ' to lose' : ' to gain') : null;
  let lowGoal: string | null = null;
  const h = heightCm(d);
  if (h > 120 && h < 230) {
    const bmi = toKg(d, g) / Math.pow(h / 100, 2);
    if (bmi < 18.5) { const healthy = 18.5 * Math.pow(h / 100, 2); lowGoal = fmt1(d.unit === 'lb' ? healthy / LB : healthy) + ' ' + d.unit; }
  }
  return { amount, lowGoal };
}

/** the patch written by "Start my plan" */
export function finishPatch(d: Draft, prev: Partial<Profile> | null, hadWeights: boolean, now = Date.now()): { patch: Partial<Profile>; kg: number } | null {
  const pv = preview(d, now);
  if (!pv) return null;
  const p0 = prev || {};
  const today = C.keyOf(now);
  const kg = toKg(d, parseNum(d.weight));
  const patch: Partial<Profile> = {
    ...pv.p, name: d.name.trim(), unit: d.unit, heightCm: Math.round((pv.p.heightCm as number) * 10) / 10,
    startKg: hadWeights && fin(p0.startKg) ? p0.startKg : kg,
    startDate: hadWeights && isValidKey(p0.startDate) ? p0.startDate : today,
    stepGoal: p0.stepGoal || 8000, activityBaseline: d.baseline,
  };
  if (d.mode === 'date') patch.paceKgPerWeek = undefined;
  return { patch, kg };
}

export const QUICK_DATES = (now = Date.now()) => [['In 3 months', 91], ['In 6 months', 182], ['In a year', 365]].map(([l, n]) => ({ value: addDays(C.keyOf(now), n as number), label: l as string }));
export { todayKey };
