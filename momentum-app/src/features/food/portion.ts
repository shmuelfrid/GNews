/* Food — portion parsing/scaling for the AI review list ("4 oz" × 1.5 → "6 oz"). Faithful port of the web food.js helpers. */
import type { Meal } from '@/lib/types';

const fin = (v: unknown): v is number => typeof v === 'number' && isFinite(v);
const FRAC: Record<string, number> = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };
const NO_PLURAL = /^(oz|g|kg|mg|ml|l|lb|lbs|tbsp|tsp|fl|fl oz|cl|dl|kcal|in|cm|x)$/i;

export interface Portion { q: number; unit: string }

export function parsePortion(input: string | null | undefined): Portion | null {
  const s = String(input || '').trim();
  if (!s) return null;
  const mk = (q: number, unit0: string): Portion => {
    const unit = String(unit0 || '').trim();
    const w = unit.split(/\s+/);
    if (q > 1 && w.length && /^[a-z]+$/i.test(w[0]) && !NO_PLURAL.test(w[0])) {
      if (/(ches|shes|sses|xes)$/i.test(w[0])) w[0] = w[0].slice(0, -2);
      else if (/[^s]s$/i.test(w[0])) w[0] = w[0].slice(0, -1);
    }
    return { q, unit: w.join(' ') };
  };
  let m = s.match(/^(\d+)\s*\/\s*(\d+)\s*(.*)$/);
  if (m && +m[2]) return mk(+m[1] / +m[2], m[3]);
  m = s.match(/^(\d+(?:[.,]\d+)?)?\s*([¼½¾⅓⅔])?\s*(.*)$/);
  if (!m || (!m[1] && !m[2])) return null;
  const rest = m[3] || '';
  if (/^[-–—/~]/.test(rest)) return null; // ranges like "2-3 slices"
  const q = (m[1] ? parseFloat(m[1].replace(',', '.')) : 0) + (m[2] ? FRAC[m[2]] : 0);
  return q > 0 ? mk(q, rest) : null;
}

export function fmtQty(v: number): string {
  if (!fin(v) || v <= 0) return '0';
  if (v >= 10) return String(Math.round(v));
  const r = Math.round(v * 4) / 4;
  if (Math.abs(r - v) < 0.02) {
    const whole = Math.floor(r + 1e-9), frac = Math.round((r - whole) * 100) / 100;
    const f = frac === 0.25 ? '¼' : frac === 0.5 ? '½' : frac === 0.75 ? '¾' : '';
    return (whole ? String(whole) : '') + f || '0';
  }
  return String(Math.round(v * 10) / 10);
}

export function scaledPortion(portion: string, f: number): string {
  const p = parsePortion(portion);
  if (!p) return f === 1 ? (portion || '1 serving') : fmtQty(f) + ' × ' + (portion || 'serving');
  const q = p.q * f;
  let unit = p.unit;
  const w = unit.split(/\s+/);
  if (q > 1 && w[0] && /^[a-z]+$/i.test(w[0]) && !NO_PLURAL.test(w[0]) && !/s$/i.test(w[0])) {
    w[0] = /(ch|sh|ss|x)$/i.test(w[0]) ? w[0] + 'es' : w[0] + 's';
    unit = w.join(' ');
  }
  return (fmtQty(q) + ' ' + unit).trim();
}

const stepFor = (f: number, dir: number) => (dir > 0 ? (f >= 1 ? 0.5 : 0.25) : (f > 1 ? 0.5 : 0.25));
/** next portion factor: steps the visible quantity (½ cup → ¾ cup), or the multiplier when the portion has no number */
export function nextFactor(it: { portion: string; f: number }, dir: 1 | -1): number {
  const p = parsePortion(it.portion);
  if (!p) return dir > 0 ? Math.min(20, Math.round((it.f + stepFor(it.f, 1)) * 100) / 100) : Math.max(0.25, Math.round((it.f - stepFor(it.f, -1)) * 100) / 100);
  const q = p.q * it.f;
  let step: number, min: number;
  if (p.q >= 20) { step = Math.max(5, Math.round(p.q * 0.25 / 5) * 5); min = step; }
  else { step = dir > 0 ? (q < 1 ? 0.25 : q < 3 ? 0.5 : 1) : (q <= 1 ? 0.25 : q <= 3 ? 0.5 : 1); min = 0.25; }
  let nq = dir > 0 ? q + step : q - step;
  const g = p.q >= 20 ? 5 : 0.25;
  nq = Math.round(nq / g) * g;
  if (nq < min - 1e-9) return it.f;
  return Math.min(20, nq / p.q);
}
export const atMinFactor = (it: { portion: string; f: number }) => nextFactor(it, -1) === it.f;

/* ---------- review items ---------- */
export interface ReviewItem {
  key: string; name: string; portion: string; f: number;
  base: { kcal: number; protein: number | null; carbs: number | null; fat: number | null };
}
export function itemTotals(it: ReviewItem) {
  const f = it.f;
  return {
    kcal: Math.round(it.base.kcal * f),
    protein: fin(it.base.protein) ? it.base.protein * f : null,
    carbs: fin(it.base.carbs) ? it.base.carbs * f : null,
    fat: fin(it.base.fat) ? it.base.fat * f : null,
  };
}
export function reviewTotal(items: ReviewItem[]) {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0, hasMacros: false };
  for (const it of items) {
    const x = itemTotals(it);
    t.kcal += x.kcal;
    (['protein', 'carbs', 'fat'] as const).forEach(k => { const v = x[k]; if (v != null) { t[k] += v; t.hasMacros = true; } });
  }
  return t;
}
/** freeze a scaled item back to factor 1 (after manual edits of the portion text) */
export function bake(it: ReviewItem): ReviewItem {
  const m = (v: number | null) => (fin(v) ? v * it.f : v);
  return { ...it, portion: scaledPortion(it.portion, it.f), f: 1, base: { kcal: it.base.kcal * it.f, protein: m(it.base.protein), carbs: m(it.base.carbs), fat: m(it.base.fat) } };
}
/** set an item's displayed kcal; macros scale proportionally */
export function withKcal(it: ReviewItem, kcal: number): ReviewItem {
  if (!fin(kcal) || kcal < 0) return it;
  const k = it.f || 1;
  const cur = it.base.kcal * k;
  const ratio = cur > 0 ? kcal / cur : null;
  const m = (v: number | null) => (ratio != null && fin(v) ? v * ratio : v);
  return { ...it, base: { kcal: kcal / k, protein: m(it.base.protein), carbs: m(it.base.carbs), fat: m(it.base.fat) } };
}

/* ---------- meals ---------- */
export const MEAL_IDS: Meal[] = ['breakfast', 'lunch', 'dinner', 'snacks'];
export const MEAL_LABEL: Record<Meal, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' };
export const MEAL_ICON = { breakfast: 'sun', lunch: 'food', dinner: 'moon', snacks: 'sparkle' } as const;
export const MEAL_TIME: Record<Meal, string> = { breakfast: '08:00', lunch: '12:30', dinner: '19:00', snacks: '15:30' };
const MEAL_SHARE: Record<Meal, number> = { breakfast: 0.25, lunch: 0.35, dinner: 0.3, snacks: 0.1 };
const r5 = (v: number) => Math.max(0, Math.round(v / 5) * 5);
export const isMeal = (m: unknown): m is Meal => typeof m === 'string' && (MEAL_IDS as string[]).includes(m);

/** remaining-budget hint per still-empty meal */
export function mealHints(counts: Record<Meal, number>, left: number): Partial<Record<Meal, number>> {
  const empty = MEAL_IDS.filter(m => !counts[m]);
  const shareSum = empty.reduce((s, m) => s + MEAL_SHARE[m], 0) || 1;
  const out: Partial<Record<Meal, number>> = {};
  empty.forEach(m => { out[m] = left > 0 ? r5(left * MEAL_SHARE[m] / shareSum) : 0; });
  return out;
}
