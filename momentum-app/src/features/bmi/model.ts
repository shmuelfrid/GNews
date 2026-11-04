/* BMI — pure view-model (port of weight-tracker/js/views/bmi.js). */
import { addDays, age as calcAge, bmi as calcBmi, BMI_CATS, isValidKey, weightForBmi, type BmiCat, type Plan, type WeightAnalysis } from '@/lib/calc';
import { fmtDate, plural, type Units } from '@/lib/format';
import type { Profile } from '@/lib/types';

const fin = (v: unknown): v is number => typeof v === 'number' && isFinite(v);
export const SHORT: Record<BmiCat['key'], string> = { under: 'Under', healthy: 'Healthy', over: 'Over', obese: 'Obese' };
export const bmiOf = (kg: unknown, cm: unknown) => calcBmi(kg, cm);
/** classify the value the user SEES (1 decimal): 24.96 shows as "25.0" and must read Overweight */
export const catOf = (b: number | null | undefined): BmiCat | null => {
  if (!fin(b)) return null;
  const r = Math.round(b * 10) / 10;
  return BMI_CATS[r < 18.5 ? 0 : r < 25 ? 1 : r < 30 ? 2 : 3];
};
export const kgFor = (b: number, cm: number) => weightForBmi(b, cm) as number;
const rank = (k: BmiCat['key']) => ({ under: 1, healthy: 0, over: 1, obese: 2 })[k];
export const b1 = (b: number | null | undefined) => (fin(b) ? b.toFixed(1) : '–');
export const dateY = (k: string | null | undefined) => (isValidKey(k) ? fmtDate(k, true) : '–');

/** weight label: whole lb, or 0.1 kg */
export const wRound = (kg: number | null | undefined, U: Units) => (fin(kg) ? (U.unit === 'lb' ? String(Math.round(U.to(kg))) : U.to(kg).toFixed(1)) : '–');
export const paceText = (kgw: number, U: Units) => (U.unit === 'lb' ? U.abs(kgw) : Math.abs(kgw).toFixed(2).replace(/0$/, '')) + '\u00A0' + U.unit + '/wk';

export interface Crossing { key: string; from: BmiCat; to: BmiCat; better: boolean }
export interface SeriesPt { key: string; kg: number; bmi: number }
export interface Projection { kg: number; bmi: number; key: string; days: number; label: 'healthy' | 'goal' }
export type BmiModel =
  | { state: 'no-height'; p: Profile }
  | { state: 'no-weight'; p: Profile }
  | {
    state: 'ok'; p: Profile; cm: number; kg: number; bmi: number; cat: BmiCat; minKg: number; maxKg: number;
    startBmi: number | null; goalBmi: number | null; pl: Plan | null; pacePerWeek: number | null; series: SeriesPt[];
    today: string; proj: Projection | null; crossings: Crossing[];
  };
export type BmiOk = Extract<BmiModel, { state: 'ok' }>;

export function crossings(series: SeriesPt[]): Crossing[] {
  const out: Crossing[] = [];
  for (let i = 1; i < series.length; i++) {
    const a = catOf(series[i - 1].bmi), b = catOf(series[i].bmi);
    if (a && b && a.key !== b.key) out.push({ key: series[i].key, from: a, to: b, better: rank(b.key) < rank(a.key) });
  }
  return out;
}
const boundaryBetween = (a: BmiCat, b: BmiCat) => (a.key === 'obese' || b.key === 'obese' ? 30 : a.key === 'under' || b.key === 'under' ? 18.5 : 25);

export function build(p: Profile | null, kg: number | null, pl: Plan | null, a: WeightAnalysis, today: string): BmiModel {
  const prof = (p || { unit: 'lb', celebrated: [] }) as Profile;
  const cm = Number(prof.heightCm);
  if (!fin(cm) || cm < 90 || cm > 260) return { state: 'no-height', p: prof };
  const b = bmiOf(kg, cm);
  if (!fin(b) || !fin(kg)) return { state: 'no-weight', p: prof };
  const cat = catOf(b) as BmiCat;
  const minKg = kgFor(18.5, cm), maxKg = kgFor(24.9, cm);
  const startBmi = bmiOf(prof.startKg, cm), goalBmi = bmiOf(prof.goalKg, cm);
  const pacePerWeek = pl && fin(pl.kgPerWeek) && pl.kgPerWeek > 0.01 ? pl.kgPerWeek : null;
  const series = (a?.series || []).filter(d => fin(d.trend)).map(d => ({ key: d.key, kg: d.trend, bmi: bmiOf(d.trend, cm) as number }));
  let proj: Projection | null = null;
  if (pacePerWeek && pl) {
    let tKg: number | null = null, label: Projection['label'] = 'goal';
    if ((cat.key === 'over' || cat.key === 'obese') && pl.dir < 0) { tKg = maxKg; label = 'healthy'; }
    else if (cat.key === 'under' && pl.dir > 0) { tKg = minKg; label = 'healthy'; }
    else if (!pl.goalReached && fin(prof.goalKg)) { tKg = prof.goalKg; label = 'goal'; }
    if (tKg != null && (tKg - kg) * pl.dir > 0.05) {
      const days = Math.ceil(Math.abs(tKg - kg) / pacePerWeek * 7);
      if (days > 0 && days <= 365 * 3) proj = { kg: tKg, bmi: bmiOf(tKg, cm) as number, key: addDays(today, days), days, label };
    }
  }
  return { state: 'ok', p: prof, cm, kg, bmi: b, cat, minKg, maxKg, startBmi, goalBmi, pl, pacePerWeek, series, today, proj, crossings: crossings(series) };
}

export function headSub(p: Profile, U: Units): string {
  const bits: string[] = [];
  if (fin(p.heightCm) && p.heightCm > 0) bits.push(U.height(p.heightCm));
  if (p.sex === 'male' || p.sex === 'female') bits.push(p.sex);
  const ag = calcAge(p.birthYear); if (fin(ag)) bits.push(String(ag));
  return 'Body mass index' + (bits.length ? ' · ' + bits.join(', ') : '');
}

/** Rich text: runs alternate plain / strong (odd = strong). */
export type Rich = string[];

export function heroSub(m: BmiOk, U: Units): Rich {
  const p = m.p;
  const head = U.w(m.kg);
  if (fin(m.startBmi) && isValidKey(p.startDate) && p.startDate < m.today) {
    const d = m.bmi - m.startBmi;
    return Math.abs(d) < 0.05 ? ['', head, ' · same as on ' + dateY(p.startDate)] : ['', head, ' · ' + (d < 0 ? 'down' : 'up') + ' from ' + b1(m.startBmi) + ' on ' + dateY(p.startDate)];
  }
  return ['', head, ' · trend weight'];
}

/** Round a target weight to the display unit, staying inside the healthy range */
export function niceTarget(kg: number, side: 'min' | 'max', cm: number, U: Units): number {
  const step = U.unit === 'lb' ? 1 : 0.1;
  let v = Math.round(U.to(kg) / step) * step;
  const ok = (x: number) => { const c = catOf(bmiOf(U.from(x), cm)); return !!c && c.key === 'healthy'; };
  for (let i = 0; i < 5 && !ok(v); i++) v += side === 'max' ? -step : step;
  return U.from(Math.round(v * 10) / 10);
}

export interface RangeCard { range: string; body: Rich; note: Rich | null; setGoal: { kg: number; label: string; a11y: string } | null }
export function rangeCard(m: BmiOk, U: Units): RangeCard {
  const u = U.unit, p = m.p;
  const range = u === 'lb' ? wRound(m.minKg, U) + '–' + wRound(m.maxKg, U) : U.to(m.minKg).toFixed(1) + '–' + U.to(m.maxKg).toFixed(1);
  const dir = m.pl ? m.pl.dir : 0;
  const weeks = (kgDiff: number) => (m.pacePerWeek ? Math.max(1, Math.round(kgDiff / m.pacePerWeek)) : null);
  let body: Rich;
  if (m.cat.key === 'over' || m.cat.key === 'obese') {
    const d = m.kg - m.maxKg;
    const w = dir < 0 ? weeks(d) : null;
    body = w && m.pacePerWeek
      ? ['You’re ', U.abs(d) + ' ' + u, ' from the healthy range — about ', plural(w, 'week'), ' at your plan pace\u00A0(' + paceText(m.pacePerWeek, U) + ').']
      : ['You’re ', U.abs(d) + ' ' + u, ' from the healthy range.'];
  } else if (m.cat.key === 'healthy') {
    const room = m.maxKg - m.kg;
    body = room > 0.2
      ? ['You’re inside it, with ', U.abs(room) + ' ' + u, ' of room below the top of the range. Keeping steady here is a great outcome.']
      : ['You’re inside it, right at the top edge. Keeping steady here is a great outcome.'];
  } else {
    const d = m.minKg - m.kg;
    const w = dir > 0 ? weeks(d) : null;
    body = w && m.pacePerWeek
      ? ['You’re ', U.abs(d) + ' ' + u, ' below the healthy range. Gaining gradually, about ', plural(w, 'week'), ' at your plan pace\u00A0(' + paceText(m.pacePerWeek, U) + ').']
      : ['You’re ', U.abs(d) + ' ' + u, ' below the healthy range. A gradual gain would bring you into it. If you’ve lost weight without trying, check in with your doctor.'];
  }
  let note: Rich | null = null, setGoal: RangeCard['setGoal'] = null;
  if (fin(m.goalBmi) && fin(p.goalKg)) {
    const goalTxt = wRound(p.goalKg, U) + ' ' + u;
    const gk = (catOf(m.goalBmi) as BmiCat).key;
    if ((gk === 'over' || gk === 'obese') && m.cat.key !== 'under') {
      const target = niceTarget(m.maxKg, 'max', m.cm, U);
      note = ['Your ' + goalTxt + ' goal is a BMI of ' + b1(m.goalBmi) + ', ', wRound(p.goalKg - m.maxKg, U) + ' ' + u, ' above the healthy range. Totally fine to keep it.'];
      const goalReached = !!(m.pl && m.pl.goalReached);
      if ((goalReached && target < m.kg) || (p.goalKg - m.kg) * (dir || -1) >= -0.05)
        setGoal = { kg: target, label: 'Set goal to ' + wRound(target, U) + ' ' + u, a11y: 'Set goal to ' + wRound(target, U) + ' ' + u + ', the top of your healthy range' };
    } else if (gk === 'under') {
      const target = niceTarget(m.minKg, 'min', m.cm, U);
      note = ['Your ' + goalTxt + ' goal is a BMI of ' + b1(m.goalBmi) + ', below the healthy range. A goal of at least ', wRound(target, U) + ' ' + u, ' keeps you in it.'];
      setGoal = { kg: target, label: 'Set goal to ' + wRound(target, U) + ' ' + u, a11y: 'Set goal to ' + wRound(target, U) + ' ' + u + ', the bottom of your healthy range' };
    } else if (gk === 'healthy' && m.cat.key !== 'healthy') {
      note = ['Your ' + goalTxt + ' goal is a BMI of ' + b1(m.goalBmi) + ', inside the healthy range.'];
    } else if (m.cat.key === 'under') {
      note = ['Your ' + goalTxt + ' goal passes through the healthy range, which starts at ' + wRound(m.minKg, U) + ' ' + u + '.'];
    }
  }
  return { range, body, note, setGoal };
}

export interface MilestoneCard { icon: 'check' | 'flag'; tone: 'good' | 'brand'; title: Rich; sub: Rich; foot: string | null }
export function milestoneCard(m: BmiOk, U: Units): MilestoneCard {
  const u = U.unit;
  const dir = m.pl ? m.pl.dir : 0;
  const last = m.crossings.filter(c => c.better && rank(c.to.key) >= rank(m.cat.key)).slice(-1)[0];
  let next: { bmi: number; to: BmiCat } | null = null;
  if (m.cat.key === 'obese') next = { bmi: 30, to: BMI_CATS[2] };
  else if (m.cat.key === 'over') next = { bmi: 24.9, to: BMI_CATS[1] };
  else if (m.cat.key === 'under') next = { bmi: 18.5, to: BMI_CATS[1] };
  const nextLine = (n: { bmi: number; to: BmiCat }) => {
    const kg = kgFor(n.bmi === 30 ? 29.9 : n.bmi, m.cm);
    const towards = (kg - m.kg) * dir > 0 && m.pacePerWeek;
    const wk = towards && m.pacePerWeek ? Math.max(1, Math.round(Math.abs(kg - m.kg) / m.pacePerWeek)) : null;
    return { kg, text: (n.to.key === 'healthy' ? 'healthy BMI' : n.to.label) + ' at ' + wRound(kg, U) + ' ' + u, wk };
  };
  if (last) {
    return {
      icon: 'check', tone: 'good',
      title: ['You moved from ' + last.from.label + ' to ' + last.to.label + ' on ', dateY(last.key)],
      sub: ['Crossed ', wRound(kgFor(boundaryBetween(last.from, last.to), m.cm), U) + ' ' + u, ' · a real health milestone'],
      foot: next ? 'Next: ' + nextLine(next).text : null,
    };
  }
  if (next) {
    const n = nextLine(next);
    return {
      icon: 'flag', tone: 'brand',
      title: ['Next milestone: ' + (next.to.key === 'healthy' ? 'a healthy BMI' : next.to.label) + ' at ', wRound(n.kg, U) + ' ' + u],
      sub: ['', U.abs(n.kg - m.kg) + ' ' + u, ' to go' + (n.wk ? ' · about ' + plural(n.wk, 'week') + ' at plan pace' : '')],
      foot: null,
    };
  }
  const inSince = m.crossings.filter(c => c.to.key === 'healthy').slice(-1)[0];
  return {
    icon: 'check', tone: 'good',
    title: inSince ? ['Healthy BMI since ', dateY(inSince.key)] : ['Your BMI is in the healthy range'],
    sub: ['Stay between ', wRound(m.minKg, U) + '–' + wRound(m.maxKg, U) + ' ' + u, ' to keep it there'],
    foot: null,
  };
}

export type TrendRange = '1M' | '3M' | 'All';
export function trendView(m: BmiOk, range: TrendRange) {
  const from = range === '1M' ? addDays(m.today, -30) : range === '3M' ? addDays(m.today, -91) : null;
  const pts = m.series.filter(d => !from || d.key >= from);
  const proj = range === 'All' && m.proj && pts.length ? m.proj : null;
  let title: string, sub: string;
  if (pts.length < 2) { title = 'Your BMI trend'; sub = pts.length ? 'One day of weigh-ins so far' : 'No weigh-ins in this range'; }
  else {
    const d = pts[pts.length - 1].bmi - pts[0].bmi;
    title = Math.abs(d) < 0.05 ? 'Steady at ' + b1(pts[pts.length - 1].bmi) : (d < 0 ? 'Down ' : 'Up ') + Math.abs(d).toFixed(1) + (Math.abs(d) >= 0.95 && Math.abs(d) < 1.05 ? ' point' : ' points');
    sub = 'Since ' + dateY(pts[0].key) + ' · ' + (proj ? (proj.label === 'healthy' ? 'healthy by ' : 'goal by ') + dateY(proj.key) + ' at plan pace' : 'from ' + b1(pts[0].bmi) + ' to ' + b1(pts[pts.length - 1].bmi));
  }
  return { pts, proj, title, sub };
}

/* ---------- waist ---------- */
export const waistLen = (cm: number, U: Units) => (U.unit === 'lb' ? Math.round(cm / 2.54) + ' in' : Math.round(cm) + ' cm');
export function waistRow(p: Profile, cm: number, U: Units) {
  const half = cm / 2;
  if (fin(p.waistCm) && p.waistCm > 0) {
    const r = p.waistCm / cm, good = r < 0.5;
    return { has: true, good, title: 'Waist-to-height ' + r.toFixed(2), sub: 'Waist ' + waistLen(p.waistCm, U) + ' · ' + (good ? 'under 0.5, a healthy sign' : 'target under ' + waistLen(half, U) + ' (half your height)') };
  }
  return { has: false, good: false, title: 'Add waist measurement', sub: 'Healthy target: under ' + waistLen(half, U) + ' (half your height)' };
}
/** parse the waist field (inches for lb users) → cm or NaN when out of range */
export function parseWaist(s: string, U: Units): number {
  const v = parseFloat(String(s).replace(',', '.'));
  if (!fin(v)) return NaN;
  const cm = U.unit === 'lb' ? v * 2.54 : v;
  return cm >= 40 && cm <= 250 ? Math.round(cm * 10) / 10 : NaN;
}
