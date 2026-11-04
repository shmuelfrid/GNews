/* PLAN — pure view-model (port of weight-tracker/js/views/plan.js). Edits are a draft until "Save plan". */
import { addDays, diffDays, equivalents, isValidKey, plan as calcPlan, type Plan, type WeightAnalysis } from '@/lib/calc';
import { fmtDate, int, parseNum, plural, type Units } from '@/lib/format';
import type { Profile } from '@/lib/types';

const fin = (v: unknown): v is number => typeof v === 'number' && isFinite(v);
export const dateY = (k: string | null | undefined) => (isValidKey(k) ? fmtDate(k, true) : '–');
const round10 = (n: number) => Math.round(n / 10) * 10;

export interface Draft { goal: string; date: string }
export const sig = (p: Profile | null) => (p ? [p.goalKg, p.targetDate, p.unit].join('|') : '');

export function initDraft(p: Profile | null, P0: Plan | null, U: Units, today: string): Draft {
  const goalKg = p && fin(p.goalKg) ? p.goalKg : null;
  return {
    goal: goalKg != null ? U.n(goalKg, 1).replace(/\.0$/, '') : '',
    date: p && isValidKey(p.targetDate) && p.targetDate > today ? p.targetDate : P0 && isValidKey(P0.targetDate) && P0.targetDate > today ? P0.targetDate : addDays(today, 84),
  };
}

export interface PlanModel {
  p: Profile; today: string; kg: number | null; bmr: number | null; typicalBurn: number | null;
  goalKg: number; goalOk: boolean; dateOk: boolean; P: Plan; a: WeightAnalysis;
  slope: number | null; projKey: string | null; projDays: number | null; dirty: boolean; draft: Draft;
}
export function planModel(p: Profile | null, draft: Draft, kg: number | null, bmrDay: number | null, typicalBurn: number | null, a: WeightAnalysis, U: Units, today: string, now = Date.now()): PlanModel {
  const prof = (p || { unit: U.unit, celebrated: [] }) as Profile;
  const goalDisp = parseNum(draft.goal);
  const goalKgRaw = fin(goalDisp) ? U.from(goalDisp) : NaN;
  const goalOk = fin(goalKgRaw) && goalKgRaw >= 30 && goalKgRaw <= 300;
  const dateOk = isValidKey(draft.date) && draft.date > today && diffDays(today, draft.date) <= 365 * 5;
  const goalSame = fin(prof.goalKg) && goalOk && Math.abs(goalDisp - U.to(prof.goalKg)) < 0.05;
  const goalKg = goalSame ? (prof.goalKg as number) : goalKgRaw;
  const P = calcPlan({ ...prof, goalKg: goalOk ? goalKg : prof.goalKg, targetDate: dateOk ? draft.date : null, paceKgPerWeek: undefined } as Profile, { currentKg: kg, now, typicalBurn });
  let projKey: string | null = null, projDays: number | null = null;
  const slope = fin(a.slope) ? a.slope : null;
  if (!P.goalReached && slope != null && Math.sign(slope) === P.dir && Math.abs(slope) > 0.0005 && P.remainingKg > 0) {
    projDays = Math.ceil(P.remainingKg / Math.abs(slope));
    if (projDays <= 3 * 365) projKey = addDays(today, projDays); else projDays = null;
  }
  const dirty = goalOk && dateOk && (!goalSame || draft.date !== prof.targetDate);
  return { p: prof, today, kg, bmr: bmrDay, typicalBurn, goalKg, goalOk, dateOk, P, a, slope, projKey, projDays, dirty, draft };
}

/* ---------- goal card ---------- */
export function goalText(m: PlanModel, U: Units) {
  const u = U.unit, P = m.P;
  const goalTxt = m.goalOk ? U.n(m.goalKg).replace(/\.0$/, '') : '–';
  let meta: string, takeaway: string;
  if (!m.goalOk) { meta = 'Enter a target weight below'; takeaway = 'Pick a target weight and a date to see your path.'; }
  else if (P.goalReached) { meta = 'You are already at ' + U.w(m.kg); takeaway = P.dir < 0 ? 'You are at or below this weight. Pick a lower target, or keep this one to maintain.' : 'You are at or above this weight already.'; }
  else {
    meta = U.abs(P.remainingKg) + ' ' + u + ' to go · ' + (m.dateOk && P.daysLeft != null ? plural(P.daysLeft, 'day') + ' left' : 'pick a date');
    if (m.projKey && m.dateOk) {
      const diff = diffDays(m.projKey, m.draft.date);
      const wk = Math.round(Math.abs(diff) / 7);
      if (Math.abs(diff) < 4) takeaway = 'At your recent pace you reach ' + goalTxt + ' ' + u + ' right on time.';
      else if (diff > 0) takeaway = 'At your recent pace you reach ' + goalTxt + ' ' + u + ' on ' + dateY(m.projKey) + ', ' + (wk >= 1 ? 'about ' + plural(wk, 'week') : plural(diff, 'day')) + ' early.';
      else takeaway = 'At your recent pace you reach ' + goalTxt + ' ' + u + ' on ' + dateY(m.projKey) + ', ' + (wk >= 1 ? plural(wk, 'week') : plural(-diff, 'day')) + ' after your date.';
    } else if (m.a.series.length < 4) takeaway = 'Log a few more weigh-ins and we will compare your real pace with the path you need.';
    else takeaway = 'Your recent trend is flat. The dashed line shows the pace that gets you there by ' + dateY(m.draft.date) + '.';
  }
  return { goalTxt, meta, takeaway, by: m.dateOk ? fmtDate(m.draft.date, true) : '–' };
}

/* ---------- goal-path chart data (display units) ---------- */
export interface PathPt { key: string; y: number }
export interface ChartData {
  trend: PathPt[]; cur: number; goal: number | null; need: PathPt | null;
  proj: (PathPt & { reaches: boolean; at: string | null }) | null; from: string; to: string; today: string; unit: 'lb' | 'kg';
}
export function chartData(m: PlanModel, U: Units): ChartData | null {
  const P = m.P, a = m.a, today = m.today, p = m.p;
  if (!fin(m.kg)) return null;
  const trend: (PathPt & { start?: boolean; carried?: boolean })[] = a.series.map(d => ({ key: d.key, y: U.to(d.trend) }));
  if (isValidKey(p.startDate) && fin(p.startKg) && (!trend.length || p.startDate < trend[0].key)) trend.unshift({ key: p.startDate, y: U.to(p.startKg), start: true });
  const cur = U.to(m.kg);
  if (!trend.length || trend[trend.length - 1].key !== today) {
    if (trend.length && trend[trend.length - 1].key < today) trend.push({ key: today, y: cur, carried: true });
    else if (!trend.length) trend.push({ key: today, y: cur });
  }
  const goal = m.goalOk ? U.to(m.goalKg) : null;
  const target = m.dateOk ? m.draft.date : null;
  const need = !P.goalReached && target && goal != null ? { key: target, y: goal } : null;
  let end = target || addDays(today, 60);
  const daysT = target ? diffDays(today, target) : 60;
  const perDay = (kgSlope: number) => U.to(kgSlope);
  let proj: ChartData['proj'] = null;
  if (m.projKey && goal != null && m.slope != null) {
    const cap = addDays(today, Math.max(daysT * 2, 45));
    const pk = m.projKey <= cap ? m.projKey : cap;
    const y = m.projKey <= cap ? goal : cur + perDay(m.slope) * diffDays(today, cap);
    proj = { key: pk, y, reaches: m.projKey <= cap, at: m.projKey };
    if (pk > end) end = pk;
  } else if (m.slope != null && a.series.length >= 4 && !P.goalReached) {
    proj = { key: end, y: cur + perDay(m.slope) * diffDays(today, end), reaches: false, at: null };
  }
  const start = trend[0].key < today ? trend[0].key : addDays(today, -7);
  return { trend, cur, goal, need, proj, from: start, to: end > today ? end : addDays(today, 30), today, unit: U.unit };
}

/* ---------- what it takes ---------- */
export function takes(m: PlanModel, U: Units) {
  const P = m.P;
  const ok = m.goalOk && !P.goalReached;
  return {
    perWeek: ok ? U.abs(P.kgPerWeek) : '0.0',
    perDay: ok ? U.abs(P.kgPerDay, 2) : '0.00',
    kcal: ok ? int(P.kcalPerDay) : '0',
    word: P.dir < 0 ? 'deficit' : 'surplus',
    sub: ok ? (m.dateOk ? 'To reach ' + U.n(m.goalKg).replace(/\.0$/, '') + ' ' + U.unit + ' by ' + dateY(m.draft.date) : 'At a steady default pace') : 'Nothing extra while you are at your goal',
  };
}

/* ---------- every day ---------- */
export interface Move { icon: 'activity' | 'route' | 'steps'; t: string; s: string; n: string; u: string }
export type EveryDay =
  | { kind: 'needs-profile' }
  | { kind: 'maintain'; eat: string; explain: string }
  | { kind: 'eat'; losing: boolean; budget: string; explain: string; floor: string | null; alt: null | { eat: string; extra: string; moves: Move[] } };
export function everyDay(m: PlanModel, U: Units): EveryDay {
  const P = m.P, burn = m.typicalBurn, bmr = m.bmr;
  if (!fin(burn) || !fin(P.budget)) return { kind: 'needs-profile' };
  const actPart = burn - (bmr || 0);
  const explain = 'when you burn about ' + int(burn) + ' kcal' + (fin(bmr) ? ' (resting ' + int(bmr) + (actPart > 5 ? ' + activity ' + int(actPart) : '') + ')' : '');
  if (P.goalReached || !m.goalOk) return { kind: 'maintain', eat: int(burn), explain: 'to hold your weight, ' + explain };
  const losing = P.dir < 0;
  const budget = Math.max(0, P.budget);
  const floor = P.lowBudget ? 'That is below ' + int(P.minKcal) + ' kcal. Eat at least that and move more instead, as below.' : null;
  if (!losing) return { kind: 'eat', losing, budget: int(budget), explain: 'on a typical day, ' + explain, floor, alt: null };
  const extra = P.lowBudget ? Math.max(100, round10(P.minKcal - budget) + 150) : (P.kcalPerDay >= 300 ? 300 : Math.max(100, round10(P.kcalPerDay)));
  const eatAlt = round10(budget + extra);
  const eq = equivalents(extra, m.kg);
  const moves: Move[] = [
    { icon: 'activity', t: 'Treadmill', s: U.unit === 'kg' ? '5.6 km/h, 5% incline' : '3.5 mph, 5% incline', n: int(eq.treadmillMin), u: 'min' },
    { icon: 'route', t: 'Brisk walk', s: 'Outside, flat ground', n: int(eq.walkMin), u: 'min' },
    { icon: 'steps', t: 'Extra steps', s: 'On top of your usual day', n: int(eq.steps), u: 'steps' },
  ];
  return { kind: 'eat', losing, budget: int(budget), explain: 'on a typical day, ' + explain, floor, alt: { eat: int(eatAlt), extra: int(extra), moves } };
}

/* ---------- pace + safety ---------- */
export function scenarios(m: PlanModel, U: Units) {
  const P = m.P;
  const sc = m.goalOk && !P.goalReached ? P.scenarios : [];
  return sc.map(s => ({
    id: s.id, date: s.date, label: s.label, on: m.draft.date === s.date,
    badge: !s.safe ? (s.kgPerWeek > P.maxSafeKgPerWeek + 1e-9 ? 'Too fast' : 'Low budget') : null,
    pace: String(+Math.abs(U.to(s.kgPerWeek)).toFixed(2)) + ' ' + U.unit + ' / week',
    dateText: fmtDate(s.date, true),
    budget: fin(s.budget) ? int(s.budget) + ' kcal / day' : '',
  }));
}
export function safety(m: PlanModel, U: Units): { text: string; safeDate: string | null } | null {
  const P = m.P, u = U.unit;
  if (!(m.goalOk && m.dateOk && !P.goalReached && (P.tooFast || P.lowBudget))) return null;
  const text = P.tooFast
    ? U.abs(P.kgPerWeek) + ' ' + u + ' a week is more than 1% of your body weight (' + U.abs(P.maxSafeKgPerWeek) + ' ' + u + '). Losing faster than that costs muscle and is hard to keep up.'
    : 'That means eating ' + int(P.budget) + ' kcal a day, below the ' + int(P.minKcal) + ' kcal minimum we recommend' + (m.p.sex === 'female' ? ' for women.' : ' for men.');
  return { text, safeDate: P.safeDate };
}
export function fieldErrors(m: PlanModel, U: Units) {
  return {
    goal: m.draft.goal.trim() && !m.goalOk ? 'Enter a weight between ' + U.n(30, 0) + ' and ' + U.n(300, 0) + ' ' + U.unit + '.' : null,
    date: m.draft.date && !m.dateOk ? 'Pick a date after today.' : null,
  };
}
