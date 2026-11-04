/* Today — pure view models (port of weight-tracker/js/views/today.js). No React here, so it is unit-testable. */
import * as C from '@/lib/calc';
import type { Balance } from '@/lib/calc';
import { clamp, fmtDate, fmtTime, int, isValidKey, plural, addDays, diffDays, type Units } from '@/lib/format';
import type { DayDoc, Profile } from '@/lib/types';

const fin = (v: unknown): v is number => typeof v === 'number' && isFinite(v);
export const kfmt = (n: number) => { if (!fin(n)) return '–'; if (n >= 1000) { const k = n / 1000; return (Math.round(k * 10) / 10).toString().replace(/\.0$/, '') + 'k'; } return int(n); };
const fmtDateY = (k: string) => fmtDate(k, true);

/* ================= 1. HERO ================= */
export type Focus = '' | 'food' | 'move' | 'steps';
export interface HeroModel { moveDone: number; moveGoal: number; moveLeft: number; moveEq: C.Equivalents; stepGoal: number; steps: number; stepsLeft: number; budget: number; eaten: number; over: boolean; gain: boolean }
type TodayActions = ReturnType<typeof C.todayActions>;

export function heroModel(p: Partial<Profile>, b: Balance, ta: TodayActions): HeroModel {
  const kg = b.kg;
  const typ = fin(b.activeAvg7) ? b.activeAvg7 : C.BASELINE_ACTIVE[p.activityBaseline as string] || 250;
  const eq = C.equivalents(100, kg);
  const sessionKcal = fin(eq.perMin?.treadmill) && eq.perMin.treadmill > 0 ? eq.perMin.treadmill * 30 : 250;
  const moveDone = Math.max(0, Math.round((b.active || 0) + (b.workouts || 0)));
  const extra = ta.extraBurnForTarget && fin(ta.extraBurnForTarget.kcal) ? ta.extraBurnForTarget.kcal : 0;
  const moveGoal = Math.max(50, Math.round(Math.max(typ + sessionKcal, extra > 0 ? moveDone + extra : 0) / 10) * 10);
  const moveLeft = Math.max(0, moveGoal - moveDone);
  const moveEq = C.equivalents(moveLeft, kg);
  const stepGoal = fin(p.stepGoal) && p.stepGoal > 0 ? p.stepGoal : 8000;
  const steps = fin(b.steps) ? Math.round(b.steps) : 0;
  const stepsLeft = Math.max(0, stepGoal - steps);
  const budget = Math.max(0, Math.round(b.budget || 0));
  const eaten = Math.max(0, b.eaten || 0);
  const over = !b.gain && b.over;
  return { moveDone, moveGoal, moveLeft, moveEq, stepGoal, steps, stepsLeft, budget, eaten, over, gain: b.gain };
}

export interface CenterText { big: string; unit: string; sub: string }
export function heroCenters(b: Balance, h: HeroModel): Record<Focus, CenterText> {
  const def = b.deficitSoFar;
  const defTxt = (def >= 0 ? 'deficit so far ' : 'surplus so far ') + int(Math.abs(def)) + ' kcal';
  let none: CenterText;
  if (!b.hasFood && !h.moveDone && !h.steps) none = { big: int(h.budget), unit: b.gain ? 'kcal to eat' : 'kcal to spend', sub: 'A fresh day. Log your first meal to start the rings.' };
  else if (b.gain) none = b.left > 0 ? { big: int(b.left), unit: 'kcal to go', sub: 'Left to reach today’s target · ' + defTxt } : { big: int(-b.left), unit: 'kcal past target', sub: 'Target reached · ' + defTxt };
  else if (h.over) none = { big: int(b.overBy), unit: 'kcal over', sub: 'Over budget · a ' + Math.max(1, Math.round(C.equivalents(b.overBy, b.kg).treadmillMin || 0)) + ' min walk evens it out' };
  else none = { big: int(b.left), unit: 'kcal left', sub: 'Left to eat today · ' + defTxt };
  const pctB = h.budget > 0 ? Math.round(h.eaten / h.budget * 100) : 0;
  const walkMin = Math.max(1, Math.round(h.stepsLeft / 100));
  return {
    '': none,
    food: { big: int(h.eaten), unit: 'kcal eaten', sub: h.eaten ? pctB + '% of today’s ' + int(h.budget) + ' kcal budget' : 'Nothing logged yet · budget ' + int(h.budget) + ' kcal' },
    move: { big: int(h.moveDone), unit: 'active kcal', sub: h.moveLeft > 0 ? int(h.moveLeft) + ' more ≈ ' + Math.max(1, Math.round(h.moveEq.treadmillMin || 0)) + ' min on the treadmill' : 'Move goal reached · ' + int(h.moveGoal) + ' kcal' },
    steps: { big: int(h.steps), unit: 'steps', sub: h.stepsLeft > 0 ? (h.steps ? int(h.stepsLeft) + ' to go · about a ' + walkMin + ' min walk' : 'No steps yet · import from Samsung Health') : 'Step goal reached · ' + int(h.stepGoal) },
  };
}
export function ringValues(h: HeroModel) {
  return {
    food: h.budget > 0 ? h.eaten / h.budget : 0,
    move: h.moveGoal > 0 ? h.moveDone / h.moveGoal : 0,
    steps: h.stepGoal > 0 ? h.steps / h.stepGoal : 0,
  };
}
export function heroAria(h: HeroModel, b: Balance) {
  return 'Energy today. Food ' + int(h.eaten) + ' of ' + int(h.budget) + ' kcal budget, move ' + int(h.moveDone) + ' of ' + int(h.moveGoal) + ' active kcal, steps ' + int(h.steps) + ' of ' + int(h.stepGoal) + '. ' + (b.deficitSoFar >= 0 ? 'Deficit' : 'Surplus') + ' so far ' + int(Math.abs(b.deficitSoFar)) + ' kcal.';
}

/* ================= 2. WEEK ================= */
export type DayTone = 'none' | 'warn' | 'good' | 'met';
export interface WeekCell { key: string; tone: DayTone; pct: number; met: boolean; today: boolean; label: string; full: string; big: string; unit: string; chip: string; chipTone: 'brand' | 'plain' | 'warn' | 'good'; detail: string; aria: string }
type DeficitAnalysis = ReturnType<typeof C.deficitAnalysis>;
const WD1 = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WD3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function weekModel(da: DeficitAnalysis): { title: string; cells: WeekCell[] } {
  const gain = !!da.gain;
  const cells: WeekCell[] = da.days.map(d => {
    const g = gain ? -d.deficit : d.deficit;
    const tg = Math.abs(d.target) > 10 ? Math.abs(d.target) : 500;
    let tone: DayTone = 'none', pct = 0, met = false;
    if (d.logged) {
      if (g < 0 || (!d.partial && !d.under)) { tone = 'warn'; pct = Math.max(0.15, Math.min(1, Math.abs(g) / tg)); }
      else { met = !d.partial && g >= tg; tone = met ? 'met' : 'good'; pct = Math.min(1, g / tg); }
    }
    const dt = C.fromKey(d.key);
    const label = d.partial ? 'Today' : WD1[dt.getDay()];
    const full = d.partial ? 'Today' : WD3[dt.getDay()] + ', ' + MON3[dt.getMonth()] + ' ' + dt.getDate();
    let big = '', unit = '', chip: string, chipTone: WeekCell['chipTone'];
    if (!d.logged) { unit = d.partial ? 'No meals logged yet' : 'No meals logged'; chip = d.partial ? 'In progress' : 'Not logged'; chipTone = d.partial ? 'brand' : 'plain'; }
    else {
      big = int(Math.abs(d.deficit));
      unit = d.deficit >= 0 ? 'kcal deficit' : 'kcal surplus';
      if (d.partial) { chip = 'In progress'; chipTone = 'brand'; }
      else if (tone === 'warn') { chip = gain ? 'Under target' : 'Over budget'; chipTone = 'warn'; }
      else if (met) { chip = 'Goal beaten'; chipTone = 'good'; }
      else { chip = gain ? 'On target' : 'Under budget'; chipTone = 'plain'; }
    }
    const detail = d.logged ? 'Ate ' + int(d.eaten) + ' · burned ' + int(d.burn) + (d.partial ? ' so far' : ' · budget ' + int(Math.max(0, d.budget))) : (d.partial ? 'Log a meal to see today’s balance' : 'Log meals to see that day’s balance');
    return { key: d.key, tone, pct: fin(pct) ? clamp(pct, 0, 1) : 0, met, today: d.partial, label, full, big, unit, chip, chipTone, detail, aria: full + ': ' + (d.logged ? big + ' ' + unit : unit) + ', ' + chip };
  });
  const last = da.days[da.days.length - 1];
  let title: string;
  if (!da.completedCount) title = last && last.logged ? 'Your week is taking shape' : 'Your week starts here';
  else if (da.completedCount === da.days.length - 1) title = (gain ? 'On target ' : 'Under budget ') + da.underCount + ' of the last ' + plural(da.completedCount, 'day');
  else title = (gain ? 'On target ' : 'Under budget ') + da.underCount + ' of ' + plural(da.completedCount, 'logged day');
  return { title, cells };
}

/* ================= 3. CLIMB ================= */
type Analysis = ReturnType<typeof C.weightAnalysis>;
export interface Story { kind: 'passed' | 'you' | 'next' | 'upcoming' | 'goal'; title: string; body?: string; parts?: string[] }
export interface ClimbFlag { id: string; frac: number; passed: boolean; next: boolean; pr: number; label: string }
export interface ClimbData { valid: boolean; f: number; cur: number; unit: 'lb' | 'kg'; dir: number; startKg: number; goalKg: number; proj: string | null; flags: ClimbFlag[]; goalReached: boolean; stories: Record<string, Story> }

function shortLabel(m: C.Milestone, dir: number): string {
  if (m.id === 'half') return 'Halfway';
  if (/^dec-/.test(m.id)) return m.title;
  const n = (m.id.match(/-(\d+(?:\.\d+)?)$/) || [])[1];
  return (dir < 0 ? '−' : '+') + n;
}
function storyTitle(m: C.Milestone, dir: number, unit: string) {
  if (m.id === 'half') return 'Halfway';
  if (/^dec-/.test(m.id)) return m.title;
  return shortLabel(m, dir) + ' ' + unit + ' flag';
}

export function climbData(p: Partial<Profile>, a: Analysis, hl: C.Headline[], U: Units, today: string): ClimbData {
  const unit = U.unit;
  const dir = a.dir || -1;
  const startKg = a.startKg, goalKg = a.goalKg;
  const journey = Math.abs(goalKg - startKg);
  const valid = fin(startKg) && fin(goalKg) && journey > 0.01;
  const f = valid ? clamp(a.goalReached ? 1 : a.progress || 0, 0, 1) : 0;
  const cur = fin(a.current) ? a.current : startKg;
  const proj = a.goalReached ? null : (a.projKey || (isValidKey(p.targetDate) ? p.targetDate : null));
  const slope = fin(a.slope) && a.slope * dir > 0.0005 ? Math.abs(a.slope) : null;
  const weekOf = (k: string) => Math.max(1, Math.floor(diffDays(a.startK, k) / 7) + 1);
  const flags: ClimbFlag[] = [];
  const ms: Record<string, C.Milestone> = {};
  if (valid) {
    const next = a.milestones.next;
    a.milestones.weight.filter(m => !m.isGoal).forEach(m => {
      const frac = clamp(Math.abs((m.targetKg as number) - startKg) / journey, 0, 1);
      if (frac <= 0.01 || frac >= 0.99) return;
      const isNext = !!next && next.id === m.id;
      const pr = isNext ? 0 : m.id === 'half' ? 1 : /^dec-/.test(m.id) ? 2 : +((/-(\d+)$/.exec(m.id) || [0, 5])[1]) % 10 === 0 ? 3 : 4;
      ms[m.id] = m;
      flags.push({ id: m.id, frac, passed: !!m.earned, next: isNext, pr, label: (isNext ? 'Next ' : '') + shortLabel(m, dir) });
    });
  }
  const stories: Record<string, Story> = {};
  const wk = Math.floor(Math.max(0, diffDays(a.startK, today)) / 7);
  stories.start = { kind: 'passed', title: 'Start · ' + U.n(startKg) + ' ' + unit, body: isValidKey(a.startK) ? fmtDateY(a.startK) + ', the first step.' + (wk >= 1 ? ' ' + plural(wk, 'week') + ' of climbing since.' : ' Your climb starts now.') : 'Where your climb began.' };
  const best = hl && hl[0] ? hl[0] : null;
  stories.you = { kind: 'you', title: (a.goalReached ? 'Summit reached · ' : 'You are here · ') + U.n(cur) + ' ' + unit, ...(best ? { parts: best.parts } : { body: 'Every weigh-in moves this marker.' }) };
  let goalBody: string;
  if (a.goalReached) goalBody = 'You made it to the top. Set your next goal in your plan.';
  else if (a.projKey && a.scheduleDays != null && a.scheduleDays >= 7 && a.target) goalBody = 'On track for ' + fmtDateY(a.projKey) + ', ' + plural(Math.round(a.scheduleDays / 7), 'week') + ' before your ' + fmtDateY(a.target) + ' goal.';
  else if (a.projKey) goalBody = 'At your recent pace you arrive around ' + fmtDateY(a.projKey) + '.';
  else if (proj) goalBody = 'Your target date is ' + fmtDateY(proj) + '. ' + U.abs(a.remaining) + ' ' + unit + ' to go.';
  else goalBody = U.abs(a.remaining) + ' ' + unit + ' to go. A few more weigh-ins and we can project your arrival.';
  stories.goal = { kind: 'goal', title: 'Summit · ' + U.n(goalKg) + ' ' + unit, body: goalBody };
  flags.forEach(fl => {
    const m = ms[fl.id];
    if (fl.passed && m.date) stories[fl.id] = { kind: 'passed', title: storyTitle(m, dir, unit) + ' · reached ' + fmtDate(m.date), body: U.n(m.targetKg) + ' ' + unit + ', in week ' + weekOf(m.date) + ' of your climb.' };
    else {
      const toGo = Math.abs(cur - (m.targetKg as number));
      const d = slope ? Math.ceil(toGo / slope) : null;
      stories[fl.id] = { kind: fl.next ? 'next' : 'upcoming', title: (fl.next ? 'Next flag: ' : '') + storyTitle(m, dir, unit) + ' · ' + U.n(m.targetKg) + ' ' + unit, body: U.abs(toGo) + ' ' + unit + ' to go' + (d && d <= 365 ? ', about ' + plural(d, 'day') + ' at your recent pace.' : '.') };
    }
  });
  return { valid, f, cur, unit, dir, startKg, goalKg, proj, flags, goalReached: !!a.goalReached, stories };
}

/** "−18.4 lb since Aug 4 · 13.6 lb to the summit" */
export function climbLine(a: Analysis, cd: ClimbData, U: Units): { lead: string; tone: 'good' | 'warn' | null; rest: string } {
  const unit = cd.unit;
  const ch = fin(a.totalChange) ? a.totalChange : 0;
  const toward = ch * cd.dir > 0.05;
  const since = isValidKey(a.startK) ? ' since ' + fmtDate(a.startK) : '';
  if (cd.goalReached) return { lead: U.signed(ch) + ' ' + unit, tone: 'good', rest: since + ' · summit reached' };
  if (Math.abs(ch) > 0.05) return { lead: U.signed(ch) + ' ' + unit, tone: toward ? 'good' : 'warn', rest: since + ' · ' + U.abs(a.remaining) + ' ' + unit + ' to the summit' };
  return { lead: '', tone: null, rest: 'Starting point' + (since ? ' · ' + fmtDate(a.startK) : '') + ' · ' + U.abs(a.remaining) + ' ' + unit + ' to the summit' };
}

/* ================= 4. PLAN ================= */
export type PlanRoute = 'food' | 'workout' | 'activity' | 'weighIn';
export interface PlanTask { id: 'eat' | 'move' | 'steps' | 'weigh'; icon: 'food' | 'activity' | 'steps' | 'scale'; tone: 'brand' | 'teal' | 'amber' | 'neutral'; title: string; sub: string; auto: boolean; done: boolean; route: PlanRoute }

export function planTasks(b: Balance, h: HeroModel, day: DayDoc, now: number = Date.now()): PlanTask[] {
  const ws = day.weights.slice().sort((x, y) => x.t - y.t);
  const dinner = day.foods.some(f => f.meal === 'dinner');
  const times = ws.map(w => fmtTime(w.t));
  const listTimes = times.length <= 2 ? times.join(' and ') : times.slice(0, -1).join(', ') + ' and ' + times[times.length - 1];
  const tread = Math.max(1, Math.round(h.moveEq.treadmillMin || 0));
  const items: Omit<PlanTask, 'done'>[] = [];
  if (b.gain) items.push({ id: 'eat', icon: 'food', tone: 'brand', title: 'Eat at least ' + int(h.budget) + ' kcal', sub: b.left > 0 ? int(b.left) + ' kcal to go' : 'Target reached', auto: b.left <= 0, route: 'food' });
  else items.push({
    id: 'eat', icon: 'food', tone: h.over ? 'amber' : 'brand', title: 'Eat under ' + int(h.budget) + ' kcal',
    sub: !b.hasFood ? 'Nothing logged yet' : h.over ? 'Over by ' + int(b.overBy) + ' kcal · a walk evens it out' : int(b.left) + ' kcal left' + (dinner ? '' : ' for dinner'),
    auto: b.hasFood && dinner && !h.over, route: 'food',
  });
  items.push(h.moveLeft > 0
    ? { id: 'move', icon: 'activity', tone: 'teal', title: tread + ' min on the treadmill', sub: '3.5 mph · 5% incline ≈ ' + int(h.moveLeft) + ' kcal', auto: false, route: 'workout' }
    : { id: 'move', icon: 'activity', tone: 'teal', title: 'Move goal reached', sub: int(h.moveDone) + ' active kcal today', auto: true, route: 'workout' });
  items.push({ id: 'steps', icon: 'steps', tone: 'teal', title: 'Reach ' + int(h.stepGoal) + ' steps', sub: h.steps ? int(h.steps) + ' so far · ' + (h.stepsLeft ? int(h.stepsLeft) + ' to go' : 'goal reached') : 'Import from Samsung Health or type them in', auto: h.steps >= h.stepGoal, route: 'activity' });
  items.push(ws.length
    ? { id: 'weigh', icon: 'scale', tone: 'neutral', title: 'Weighed in today', sub: 'Logged ' + listTimes, auto: true, route: 'weighIn' }
    : { id: 'weigh', icon: 'scale', tone: 'neutral', title: 'Weigh in', sub: new Date(now).getHours() < 11 ? 'Best first thing in the morning' : 'Any time works. Your trend smooths it out', auto: false, route: 'weighIn' });
  const ticks = day.planTicks || {};
  return items.map(it => ({ ...it, done: typeof ticks[it.id] === 'boolean' ? ticks[it.id] : it.auto }));
}

/* ================= BMI row ================= */
export function bmiSummary(heightCm: number | undefined, kg: number | null | undefined, U: Units) {
  const v = C.bmi(kg, heightCm);
  if (v == null || !fin(heightCm)) return null;
  const cat = C.bmiCategory(Math.round(v * 10) / 10)!;
  const hr = C.healthyWeightRange(heightCm)!;
  const d = U.unit === 'lb' ? 0 : 1;
  const sub = cat.key === 'healthy' ? 'Healthy range ' + U.n(hr.minKg, d) + '–' + U.n(hr.maxKg, d) + ' ' + U.unit
    : cat.key === 'under' ? 'Healthy range from ' + U.n(hr.minKg, d) + ' ' + U.unit : 'Healthy range up to ' + U.n(hr.maxKg, d) + ' ' + U.unit;
  return { value: v, text: v.toFixed(1), cat, sub, pos: clamp((v - 15) / 25, 0, 1) };
}

export { addDays };
