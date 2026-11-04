/* PROGRESS — pure view-model (port of weight-tracker/js/views/progress.js). No React here: unit-tested. */
import { addDays, diffDays, fromKey, isValidKey, KCAL_PER_KG, keyOf, type DeficitAnalysis, type Milestone, type WeightAnalysis } from '@/lib/calc';
import { bmi, bmiCategory } from '@/lib/calc';
import { clamp, fmtDate, int, kcal, mean, plural, relDay, weekday, type Units } from '@/lib/format';
import type { Profile } from '@/lib/types';
import type { Pt, Tip } from '@/components';
import type { Bar } from '@/components/charts/BarChart';

const fin = (v: unknown): v is number => typeof v === 'number' && isFinite(v);
export type Range = '1W' | '1M' | '3M' | 'All';
export const RANGES: { value: Range; label: string; days: number | null }[] = [
  { value: '1W', label: '1W', days: 7 }, { value: '1M', label: '1M', days: 30 }, { value: '3M', label: '3M', days: 91 }, { value: 'All', label: 'All', days: null },
];
const dateY = (k: string | null | undefined) => (isValidKey(k) ? fmtDate(k, true) : '');
export const weeksWord = (d: number) => { const w = Math.round(Math.abs(d) / 7); return w >= 1 ? plural(w, 'week') : plural(Math.abs(d), 'day'); };

/* ================= headline ================= */
export interface Headline { over: string; pre: string; num: string; post: string; warn?: boolean; sub: string; frac: number; done: number; journey: number }
export function headline(a: WeightAnalysis, U: Units): Headline | null {
  if (!a.series.length) return null;
  const u = U.unit;
  const toward = (d: number) => d * a.dir;
  const lost = a.dir < 0 ? 'lost' : 'gained';
  const lw = a.lastWeek;
  let h: Omit<Headline, 'frac' | 'done' | 'journey'>;
  if (a.goalReached) {
    h = { over: 'Goal reached', pre: 'You made it to ', num: U.w(a.goalKg), post: '', sub: 'Keep logging to hold it. Set a new goal in your plan whenever you are ready.' };
  } else if (lw && toward(lw.change) > 0.05) {
    const parts: string[] = [];
    if (a.bestWeek === lw && a.dataWeeks.length >= 3) parts.push('Your best week yet.');
    if (fin(a.pace4) && toward(a.pace4) > 0.02) {
      const ratio = Math.abs(lw.change) / Math.abs(a.pace4);
      if (ratio >= 1.3) parts.push(ratio.toFixed(1) + '× your 4-week pace.');
      else if (ratio >= 0.8) parts.push('Right in line with your 4-week pace.');
      else parts.push('Your 4-week pace is ' + U.abs(a.pace4) + ' ' + u + ' a week.');
    }
    if (!parts.length) parts.push('That is real progress. Keep the rhythm going.');
    h = { over: 'Last week · ' + fmtDate(lw.start) + ' – ' + fmtDate(lw.end), pre: 'You ' + lost + ' ', num: U.abs(lw.change) + ' ' + u, post: ' last week', sub: parts.join(' ') };
  } else if (lw && toward(lw.change) < -0.05) {
    h = {
      over: 'Last week · ' + fmtDate(lw.start) + ' – ' + fmtDate(lw.end), pre: a.dir < 0 ? 'Up ' : 'Down ', num: U.abs(lw.change) + ' ' + u, post: ' last week', warn: true,
      sub: fin(a.pace4) && toward(a.pace4) > 0.02
        ? 'One week is noise. Your 4-week trend is still ' + U.signed(a.pace4) + ' ' + u + ' a week.'
        : 'Scale weeks like this happen to everyone. Water and salt move the number; the next good week starts today.',
    };
  } else if (fin(a.change7) && toward(a.change7) > 0.05) {
    h = { over: 'Last 7 days', pre: '', num: U.abs(a.change7) + ' ' + u, post: (a.change7 < 0 ? ' down' : ' up') + ' this week', sub: 'Keep that rhythm and the trend line follows.' };
  } else if (toward(a.totalChange) > 0.05) {
    h = {
      over: 'Since ' + (dateY(a.startK) || 'you started'), pre: 'You have ' + lost + ' ', num: U.abs(a.totalChange) + ' ' + u, post: '',
      sub: a.series.length < 7 ? 'A few more weigh-ins and your weekly story appears here.' : 'Steady beats fast. Every log sharpens the picture.',
    };
  } else {
    h = {
      over: a.series.length === 1 ? 'Day one' : 'Getting started', pre: 'Your starting point: ', num: U.w(a.current), post: '',
      sub: a.series.length < 3 ? 'Weigh in on a few more days and your trend line appears.' : 'Keep logging. Real change shows up over weeks, not days.',
    };
  }
  const journey = Math.abs(U.to(a.goalKg) - U.to(a.startKg));
  const done = Math.max(0, a.toward(U.to(a.current) - U.to(a.startKg)));
  const frac = journey > 0 ? clamp(done / journey, 0, 1) : 0;
  return { ...h, frac, done, journey };
}

/* ================= weight trend ================= */
export function rangeWindow(a: WeightAnalysis, range: Range, today: string) {
  const r = RANGES.find(x => x.value === range) || RANGES[2];
  let from: string;
  if (r.days) from = addDays(today, -(r.days - 1));
  else {
    const first = a.series.length ? a.series[0].key : today;
    from = isValidKey(a.startK) && a.startK < first ? a.startK : first;
  }
  return { from, today, days: r.days || Math.max(7, diffDays(from, today) + 1) };
}

export function weightCard(a: WeightAnalysis, range: Range, U: Units, today: string) {
  const u = U.unit;
  const w = rangeWindow(a, range, today);
  const inRange = a.series.filter(d => d.key >= w.from);
  const g = U.n(a.goalKg).replace(/\.0$/, '');
  let title: string, sub: string;
  if (a.goalReached) title = 'Goal reached at ' + g + ' ' + u;
  else if (a.projKey) title = 'On pace for ' + g + ' ' + u + ' by ' + dateY(a.projKey);
  else if (a.series.length >= 2) title = U.abs(a.remaining) + ' ' + u + ' to go to ' + g + ' ' + u;
  else title = 'Your weight trend';
  const first = inRange[0], last = inRange[inRange.length - 1];
  if (first && last && first !== last) {
    const span = range === '1W' ? 'in the last 7 days' : range === '1M' ? 'in the last 30 days' : range === '3M' ? 'in the last 3 months' : 'since ' + fmtDate(first.key, true);
    sub = U.signed(last.trend - first.trend) + ' ' + u + ' ' + span;
    if (range === 'All' && a.scheduleDays != null && a.target) {
      sub += a.scheduleDays >= 7 ? ' · ' + weeksWord(a.scheduleDays) + ' ahead of plan' : a.scheduleDays <= -7 ? ' · ' + weeksWord(a.scheduleDays) + ' behind plan' : ' · right on plan';
    }
  } else if (a.series.length) sub = 'Not enough weigh-ins in this range yet';
  else sub = 'Weigh-ins and your 7-day trend appear here';

  // chart data (display units)
  const dots: Pt[] = [], line: Pt[] = [];
  a.series.forEach(d => {
    if (d.key < addDays(w.from, -7)) return;
    d.entries.forEach(e => dots.push({ key: d.key, y: U.to(e.kg) }));
    line.push({ key: d.key, y: U.to(d.trend) });
  });
  let projection: Pt[] = [], to = w.today;
  if (a.projKey && range !== '1W' && a.last) {
    projection = [{ key: a.last.key, y: U.to(a.current) }, { key: a.projKey, y: U.to(a.goalKg) }];
    const ahead = diffDays(w.today, a.projKey);
    const room = range === 'All' ? ahead : Math.round(w.days * 0.6);
    to = addDays(w.today, Math.max(0, Math.min(ahead, room)));
    // the shared chart drops points outside the domain: end the dashed line at the window edge instead
    if (a.projKey > to) {
      const p0 = projection[0], p1 = projection[1], span = diffDays(p0.key, p1.key);
      const k = span > 0 ? diffDays(p0.key, to) / span : 1;
      projection = [p0, { key: to, y: p0.y + (p1.y - p0.y) * clamp(k, 0, 1) }];
    }
  }
  const showGoal = range === 'All' || projection.length > 0 || Math.abs(U.to(a.current) - U.to(a.goalKg)) < (range === '1W' ? 4 : 12);
  const vis = dots.concat(line).filter(p => p.key >= w.from).map(p => p.y).concat(showGoal ? [U.to(a.goalKg)] : []);
  const spanY = vis.length ? Math.max(...vis) - Math.min(...vis) : 10;
  const yd = spanY < 6 ? 1 : 0;
  const byKey: Record<string, (typeof a.series)[number]> = {};
  a.series.forEach(d => { byKey[d.key] = d; });
  const tip = (key: string): Tip => {
    const d = byKey[key];
    if (!d) return { title: relDay(key), rows: [] };
    const rows: [string, string][] = [['Trend', U.w(d.trend)]];
    if (d.n > 1) { rows.push(['Average', U.w(d.avg)]); rows.push(['Range', U.n(d.min) + '–' + U.n(d.max)]); }
    else rows.push(['Weigh-in', U.w(d.avg)]);
    return { title: relDay(key), rows };
  };
  return {
    title, sub, dots, line, projection, showGoal,
    projectionLabel: projection.length && a.projKey && diffDays(w.today, a.projKey) <= diffDays(w.today, to) ? fmtDate(a.projKey) : '',
    goal: showGoal ? U.to(a.goalKg) : null,
    goalLabel: 'Goal ' + U.n(a.goalKg, u === 'kg' ? 1 : 0) + ' ' + u,
    domain: { from: w.from, to }, yd, tip,
    legendProjected: !!a.projKey && range !== '1W',
    a11y: 'Weight trend, ' + range + ': now ' + U.w(a.current) + ', goal ' + U.w(a.goalKg) + (a.projKey ? ', projected to reach it ' + dateY(a.projKey) : ''),
  };
}

/* ================= daily deficit ================= */
export const deficitDays = (range: Range) => (range === '1W' ? 7 : 30);
export interface Compare { expLabel: string; exp: string; actLabel: string; act: string; note: string }
export function deficitCard(da: DeficitAnalysis, a: WeightAnalysis, range: Range, U: Units) {
  const u = U.unit, n = deficitDays(range);
  const anyFood = da.days.some(d => d.logged);
  const target = da.today ? da.today.target : 0;
  const losing = target >= 0;
  if (!anyFood) return { empty: true as const, title: 'Your daily deficit', sub: 'Calories burned minus calories eaten, day by day', target };
  let title: string;
  if (da.completedCount >= 1) title = (losing ? 'Under budget ' : 'On target ') + da.underCount + ' of ' + plural(da.completedCount, 'day');
  else title = 'Today so far: ' + int(Math.abs(da.today.deficit)) + ' kcal ' + (da.today.deficit >= 0 ? 'deficit' : 'surplus');
  const parts: string[] = [];
  if (da.completedCount >= 1) {
    if (da.total > 0) parts.push(int(da.total) + ' kcal ≈ ' + U.abs(da.expectedKg) + ' ' + u + ' of fat');
    else if (da.total < 0) parts.push(int(-da.total) + ' kcal surplus');
  }
  if (target > 0) parts.push('goal ' + int(target) + ' a day');
  const sub = parts.length ? parts.join(' · ') : 'Last ' + n + ' days';
  let compare: Compare | null = null;
  if (da.completedCount >= 3 && fin(da.actualKg)) {
    const exp = fin(da.avg) ? -(da.avg * n / KCAL_PER_KG) : -da.expectedKg;
    const act = da.actualKg;
    const diff = act - exp;
    let note: string;
    if (Math.abs(diff) < 0.25) note = 'Your scale is tracking your food and activity log closely. That is a sign your logging is accurate.';
    else if (diff * a.dir > 0) note = 'The scale moved more than your ' + (losing ? 'deficit' : 'surplus') + ' explains. Part of that is water and food weight, so expect some of it to come back and even out.';
    else note = losing ? 'The scale is lagging your deficit. Water, salt and a heavier workout can hide fat loss for a week or two; the fat loss is still happening.' : 'The scale is lagging your surplus. Daily water swings can hide a gain for a week or two; keep eating to your target.';
    compare = {
      expLabel: 'Expected from ' + (losing ? 'deficit' : 'surplus') + (da.completedCount < n - 1 ? ', ' + da.completedCount + ' logged days' : ''),
      exp: U.signed(exp), actLabel: 'Scale trend, ' + n + ' days', act: U.signed(act), note,
    };
  }
  const nn = da.days.length;
  const every = nn > 7 ? 4 : 1;
  const bars: (Bar & { key: string })[] = da.days.map((d, i) => ({
    key: d.key,
    // 30 days: a date every 6 bars (multiples of the chart's own thinning step), clear of the Today label
    // (30 days: today stays unlabelled; its muted bar + tooltip mark it, and a centred edge label would clip)
    label: nn <= 7 ? (d.partial ? 'Today' : weekday(d.key)) : i % 6 === 0 && i >= 6 && i <= nn - 1 - every ? fmtDate(d.key) : '',
    value: d.logged ? d.deficit : 0,
    highlight: d.partial && nn <= 7, muted: d.partial,
  }));
  const tip = (b: Bar, i: number): Tip => {
    const d = da.days[i];
    if (!d || !d.logged) return { title: relDay(d ? d.key : ''), rows: [['No food logged', '']] };
    return { title: relDay(d.key) + (d.partial ? ' (so far)' : ''), rows: [['Eaten', kcal(d.eaten)], ['Burned', kcal(d.burn)], [d.deficit >= 0 ? 'Deficit' : 'Surplus', kcal(Math.abs(d.deficit))], ['Budget', kcal(d.budget)]] };
  };
  return {
    empty: false as const, title, sub, target, compare, bars, tip, labelsAll: nn <= 7,
    a11y: 'Daily calorie deficit, last ' + nn + ' days. ' + da.days.filter(d => d.logged).map(d => fmtDate(d.key) + ' ' + int(d.deficit)).join(', '),
  };
}

/* ================= stats ================= */
export interface Tile { label: string; value: string; unit?: string; cap: string; tone?: 'good' | 'warn' | ''; bmi?: { key: string } }
export function statTiles(a: WeightAnalysis, da30: DeficitAnalysis, p: Profile | null, U: Units, currentKg: number | null, today: string): Tile[] {
  const u = U.unit, tiles: Tile[] = [];
  const toward = (d: number) => d * a.dir;
  if (a.series.length) {
    const tc = toward(a.totalChange);
    tiles.push({ label: a.dir < 0 ? 'Total lost' : 'Total gained', value: tc > 0 ? U.abs(a.totalChange) : '0.0', unit: u, cap: Math.round(a.progress * 100) + '% of your goal' });
  }
  if (fin(a.paceAll)) tiles.push({ label: 'Avg per week', value: U.signed(a.paceAll), unit: u, cap: fin(a.pace4) ? 'Last 4 wks ' + U.signed(a.pace4) : 'Since ' + dateY(a.startK) });
  const tgt = da30.today ? da30.today.target : 0;
  if (fin(da30.avg) && da30.gain) tiles.push({ label: da30.avg <= 0 ? 'Avg daily surplus' : 'Avg daily deficit', value: int(Math.abs(da30.avg)), unit: 'kcal', cap: tgt < 0 ? 'Goal +' + int(-tgt) : 'Last 30 days', tone: tgt < 0 && -da30.avg >= -tgt ? 'good' : '' });
  else if (fin(da30.avg)) tiles.push({ label: 'Avg daily deficit', value: int(da30.avg), unit: 'kcal', cap: tgt > 0 ? 'Goal ' + int(tgt) : 'Last 30 days', tone: tgt > 0 && da30.avg >= tgt ? 'good' : '' });
  if (a.goalReached) tiles.push({ label: 'Goal', value: 'Reached', cap: 'Nice work', tone: 'good' });
  else if (a.projKey) {
    let cap = 'At your 4-week pace', tone: Tile['tone'] = '';
    if (a.scheduleDays != null) {
      if (a.scheduleDays >= 7) { cap = weeksWord(a.scheduleDays) + ' early'; tone = 'good'; }
      else if (a.scheduleDays <= -7) { cap = weeksWord(a.scheduleDays) + ' late'; tone = 'warn'; }
      else cap = 'Right on time';
    }
    tiles.push({ label: 'Goal ETA', value: fmtDate(a.projKey, false), unit: a.projKey.slice(0, 4) !== today.slice(0, 4) ? a.projKey.slice(0, 4) : '', cap, tone });
  }
  if (a.series.length) tiles.push({ label: 'Logging streak', value: String(a.streak), unit: a.streak === 1 ? 'day' : 'days', cap: a.longest > a.streak ? 'Best ' + a.longest + ' days' : a.streak >= 3 ? 'Your best yet' : 'Log daily to build it' });
  if (da30.completedCount >= 2) tiles.push({ label: da30.gain ? 'On target' : 'Under budget', value: da30.underCount + '/' + da30.completedCount, unit: 'days', cap: 'Last 30 days' });
  if (a.bestWeek && a.dataWeeks.length >= 2) tiles.push({ label: 'Best week', value: U.signed(a.bestWeek.change), unit: u, cap: 'Week of ' + fmtDate(a.bestWeek.start) });
  if (a.extreme && a.series.length >= 3) tiles.push({ label: a.dir < 0 ? 'Lowest' : 'Highest', value: U.n(a.extreme.kg), unit: u, cap: relDay(keyOf(a.extreme.t)) });
  const b = bmi(currentKg, p?.heightCm);
  const c = fin(b) ? bmiCategory(Math.round(b * 10) / 10) : null;
  if (fin(b) && c) tiles.push({ label: 'BMI', value: b.toFixed(1), cap: c.label, bmi: { key: c.key } });
  return tiles;
}

/* ================= weekly ================= */
export function weeklyCard(a: WeightAnalysis, U: Units) {
  const u = U.unit;
  const wk = a.dataWeeks.slice(-13);
  if (wk.length < 2) return { empty: true as const, title: 'Week by week', sub: 'Your weekly change shows up after two weeks of weigh-ins' };
  const done = wk.filter(w => !w.partial);
  const toward = done.filter(w => a.toward(w.change) > 0.01).length;
  const title = (a.dir < 0 ? 'Down ' : 'Up ') + toward + ' of the last ' + plural(done.length, 'week');
  const best = a.bestWeek && wk.includes(a.bestWeek) ? (a.bestWeek === a.lastWeek ? 'best week was last week' : 'best week was ' + fmtDate(a.bestWeek.start)) : '';
  // labels every 4th week (never on the edge bars, where centred text would clip)
  const bars: Bar[] = wk.map((w, i) => ({ label: i % 4 === 2 && i <= wk.length - 2 ? fmtDate(w.start) : '', value: +U.to(w.change).toFixed(2), muted: w.partial }));
  const tip = (_b: Bar, i: number): Tip => {
    const w = wk[i];
    const rows: [string, string][] = [['Change', U.signed(w.change) + ' ' + u]];
    if (w === a.bestWeek) rows.push(['Best week', '']);
    return { title: 'Week of ' + fmtDate(w.start) + (w.partial ? ' (so far)' : ''), rows };
  };
  return {
    empty: false as const, title, sub: 'Weekly change in ' + u + (best ? ' · ' + best : ''), bars, tip,
    losing: a.dir < 0,
    a11y: 'Weekly weight change: ' + wk.map(w => fmtDate(w.start) + ' ' + U.signed(w.change) + ' ' + u).join(', '),
  };
}

/* ================= patterns ================= */
export function weekdayPattern(a: WeightAnalysis): { wd: number; m: number } | null {
  const groups: Record<number, number[]> = {};
  a.series.forEach(d => {
    if (!fin(d.trend)) return;
    const wd = fromKey(d.key).getDay();
    (groups[wd] = groups[wd] || []).push(d.avg - d.trend);
  });
  const ok = Object.keys(groups).map(Number).filter(k => groups[k].length >= 2);
  if (a.series.length < 14 || ok.length < 4) return null;
  let best: { wd: number; m: number } | null = null;
  ok.forEach(k => { const m = mean(groups[k]); if (!best || m * a.dir > best.m * a.dir) best = { wd: k, m }; });
  const b = best as { wd: number; m: number } | null;
  if (!b || Math.abs(b.m) < 0.05) return null;
  return b;
}
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export interface PatternRow { icon: 'sun' | 'activity' | 'calendar'; tone: 'amber' | 'teal' | 'brand'; title: string; sub: string }
export function patterns(a: WeightAnalysis, U: Units): { rows: PatternRow[]; teaser: boolean } | null {
  const u = U.unit, rows: PatternRow[] = [];
  const mve = a.morningVsEvening as { diff: number; days: number } | null;
  if (mve) rows.push({ icon: 'sun', tone: 'amber', title: mve.diff > 0 ? 'Evenings run ' + U.abs(mve.diff) + ' ' + u + ' heavier' : 'Mornings run ' + U.abs(mve.diff) + ' ' + u + ' heavier', sub: 'Across ' + mve.days + ' days with both. Weigh in each morning for the fairest read.' });
  const sw = a.swing as { avg: number; max: number } | null;
  if (sw) rows.push({ icon: 'activity', tone: 'teal', title: 'Your weight swings ' + U.abs(sw.avg) + ' ' + u + ' within a day', sub: 'That is food and water, not fat. The biggest swing was ' + U.abs(sw.max) + ' ' + u + '.' });
  const wd = weekdayPattern(a);
  if (wd) rows.push({ icon: 'calendar', tone: 'brand', title: WEEKDAYS[wd.wd] + 's are your lightest day', sub: 'On average ' + U.abs(wd.m) + ' ' + u + ' ' + (wd.m < 0 ? 'under' : 'over') + ' your trend. Weekends usually show the opposite.' });
  if (!rows.length) return a.series.length < 3 ? null : { rows, teaser: true };
  return { rows, teaser: false };
}

/* ================= milestones ================= */
export interface MsItem { m: Milestone; isNext: boolean; frac: number; sub: string; icon: 'trophy' | 'bolt' | 'target' | 'flag' }
export function milestoneList(a: WeightAnalysis, U: Units, showAll: boolean) {
  const ms = a.milestones;
  const all = ms.weight.concat(ms.streaks);
  if (!all.length) return null;
  let list: Milestone[];
  if (showAll) list = all;
  else {
    const nextS0 = ms.streaks.filter(m => !m.earned).length ? 1 : 0;
    const nextW0 = ms.weight.filter(m => !m.earned).slice(0, 2);
    const earned = all.filter(m => m.earned).sort((x, y) => (y.date || '').localeCompare(x.date || '')).slice(0, Math.max(1, 4 - nextS0 - nextW0.length)).reverse();
    const nextW = nextW0.slice(0, 4 - nextS0 - earned.length);
    const nextS = ms.streaks.filter(m => !m.earned).slice(0, 1);
    list = earned.concat(nextW, nextS);
    if (list.length < 4) list = list.concat(all.filter(m => !list.includes(m)).slice(0, 4 - list.length));
    list = list.slice(0, 4);
  }
  const nx = ms.next;
  const earnedN = all.filter(m => m.earned).length;
  const items: MsItem[] = list.map(m => {
    let frac = 0;
    if (!m.earned && m.kind === 'w' && fin(m.targetKg)) {
      const span = Math.abs(m.targetKg - a.startKg);
      frac = span > 0 ? clamp(1 - m.toGo / span, 0, 1) : 0;
    } else if (!m.earned && m.kind === 's' && m.n) frac = clamp(a.streak / m.n, 0, 1);
    const sub = m.earned ? (m.date ? fmtDate(m.date, true) : 'Earned') : m.kind === 's' ? plural(Math.max(1, m.toGo), 'day') + ' to go' : U.abs(m.toGo) + ' ' + U.unit + ' to go';
    const icon = m.earned ? (m.kind === 's' && !m.isGoal ? 'bolt' : 'trophy') : m.isGoal ? 'target' : m.kind === 's' ? 'bolt' : 'flag';
    return { m, isNext: !!nx && m === nx, frac, sub, icon };
  });
  return {
    items, total: all.length, canToggle: all.length > list.length || showAll,
    sub: earnedN ? earnedN + ' of ' + all.length + ' earned' : 'Your first one is close',
    next: nx && !a.goalReached ? nx.title : null,
  };
}
