/* Momentum — formatting + units (pure). Every formatter returns '–' for non-finite input: never print NaN.
   Dates are local 'YYYY-MM-DD' keys. Deterministic English month/day names (no Intl dependency on Hermes). */
import { addDays, fromKey, isValidKey, keyOf, LB } from './calc';
import type { Meal, Unit } from './types';

export { addDays, diffDays, fromKey, isValidKey, keyOf, weekStartKey } from './calc';

const pad2 = (n: number) => String(n).padStart(2, '0');
const fin = (v: unknown): v is number => typeof v === 'number' && isFinite(v);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const s3 = (s: string) => s.slice(0, 3);

export const todayKey = () => keyOf(Date.now());
/** ms timestamp for a day key + 'HH:MM' (local) */
export function timeOn(k: string, hhmm?: string): number { const d = fromKey(k); const p = String(hhmm || '12:00').split(':').map(Number); d.setHours(p[0] || 0, p[1] || 0, 0, 0); return d.getTime(); }
/** '07:05' */
export const hhmm = (t: number) => { const d = new Date(t); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); };
/** parse 'HH:MM', '7:5', '7.05', '705', '7 pm' → 'HH:MM' or null */
export function parseTime(s: string): string | null {
  const m = /^\s*(\d{1,2})(?:[:.\s]?(\d{2}))?\s*(am|pm|a|p)?\s*$/i.exec(String(s || ''));
  if (!m) return null;
  let h = +m[1]; const min = m[2] ? +m[2] : 0; const ap = (m[3] || '').toLowerCase();
  if (ap.startsWith('p') && h < 12) h += 12;
  if (ap.startsWith('a') && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return pad2(h) + ':' + pad2(min);
}
/** 'Nov 3' (adds year when not this year unless withYear=false) */
export function fmtDate(k: string, withYear?: boolean): string {
  if (!isValidKey(k)) return '–';
  const d = fromKey(k);
  const y = withYear ?? d.getFullYear() !== new Date().getFullYear();
  return s3(MONTHS[d.getMonth()]) + ' ' + d.getDate() + (y ? ', ' + d.getFullYear() : '');
}
/** 'Tuesday, November 3' */
export function fmtDateLong(k: string): string { if (!isValidKey(k)) return '–'; const d = fromKey(k); return DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate(); }
/** 'Tue, Nov 3' */
export function fmtDateShort(k: string): string { if (!isValidKey(k)) return '–'; const d = fromKey(k); return s3(DAYS[d.getDay()]) + ', ' + s3(MONTHS[d.getMonth()]) + ' ' + d.getDate(); }
/** 'Tue' */
export function weekday(k: string, len: 1 | 3 = 3): string { if (!isValidKey(k)) return '–'; return DAYS[fromKey(k).getDay()].slice(0, len); }
/** '7:05 PM' */
export function fmtTime(t: number): string { if (!fin(t)) return '–'; const d = new Date(t); const h = d.getHours(); return ((h + 11) % 12 + 1) + ':' + pad2(d.getMinutes()) + ' ' + (h < 12 ? 'AM' : 'PM'); }
/** 'Today' / 'Yesterday' / 'Tomorrow' / 'Tue, Nov 3' */
export function relDay(k: string): string { const t = todayKey(); if (k === t) return 'Today'; if (k === addDays(t, -1)) return 'Yesterday'; if (k === addDays(t, 1)) return 'Tomorrow'; return fmtDateShort(k); }

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const mean = (a: number[]) => a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN;
export const sum = (a: number[]) => a.reduce((s, v) => s + (isFinite(v) ? v : 0), 0);
/** tolerant number parsing: '1,420' → 1420, '87,5' → 87.5; NaN when invalid */
export function parseNum(s: unknown): number {
  if (typeof s === 'number') return isFinite(s) ? s : NaN;
  let t = String(s == null ? '' : s).trim();
  t = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
  const v = parseFloat(t); return isFinite(v) ? v : NaN;
}
export const plural = (n: number, w: string, ws?: string) => n + ' ' + (n === 1 ? w : (ws || w + 's'));
/** 1420 → '1,420' */
export const int = (n: number | null | undefined) => fin(n) ? Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '–';
export const fixed = (n: number | null | undefined, d = 1) => fin(n) ? Number(n).toFixed(d) : '–';
/** '+120' / '−120' (true minus) */
export const signedInt = (n: number | null | undefined) => { if (!fin(n)) return '–'; const r = Math.round(n); return (r > 0 ? '+' : r < 0 ? '−' : '') + int(Math.abs(r)); };
export const kcal = (n: number | null | undefined) => int(n) + ' kcal';
export const pct = (x: number | null | undefined) => fin(x) ? Math.round(x * 100) + '%' : '–';
/** 65 → '1 h 5 min' */
export const minutes = (m: number | null | undefined) => { if (!fin(m)) return '–'; m = Math.round(m); if (m < 60) return m + ' min'; const h = Math.floor(m / 60), r = m % 60; return h + ' h' + (r ? ' ' + r + ' min' : ''); };
export const greeting = (now?: number) => { const h = new Date(now || Date.now()).getHours(); return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
export const mealForTime = (t: number): Meal => { const h = new Date(t).getHours(); return h >= 4 && h < 11 ? 'breakfast' : h >= 11 && h < 15 ? 'lunch' : h >= 17 && h < 22 ? 'dinner' : 'snacks'; };

export const MEALS: { id: Meal; label: string }[] = [
  { id: 'breakfast', label: 'Breakfast' }, { id: 'lunch', label: 'Lunch' }, { id: 'dinner', label: 'Dinner' }, { id: 'snacks', label: 'Snacks' },
];
export const WEIGH_TAGS = ['Morning', 'After workout', 'Before bed', 'After meal'];

/* ================= units (canonical kg / km / cm) ================= */
const KM_MI = 1.609344;
export interface Units {
  unit: Unit;
  LB: number;
  /** kg → display number */
  to(kg: number): number;
  /** display number → kg */
  from(v: number): number;
  /** '193.6' */
  n(kg: number | null | undefined, d?: number): string;
  /** '193.6 lb' */
  w(kg: number | null | undefined, d?: number): string;
  /** abs delta '4.6' */
  abs(dKg: number | null | undefined, d?: number): string;
  /** '−4.6' / '+0.4' / '0.0' */
  signed(dKg: number | null | undefined, d?: number): string;
  /** '3.3 mi' (lb users) / '5.3 km' */
  dist(km: number | null | undefined): string;
  distUnit(): 'mi' | 'km';
  distTo(km: number): number;
  distFrom(v: number): number;
  /** '5′ 10″' / '178 cm' */
  height(cm: number | null | undefined): string;
  cmToFtIn(cm: number): { ft: number; inch: number };
  ftInToCm(ft: number, inch: number): number;
}
export function makeUnits(unit: Unit = 'lb'): Units {
  const u: Units = {
    unit, LB,
    to: kg => unit === 'lb' ? kg / LB : kg,
    from: v => unit === 'lb' ? v * LB : v,
    n: (kg, d = 1) => fin(kg) ? u.to(kg).toFixed(d) : '–',
    w: (kg, d = 1) => u.n(kg, d) + ' ' + unit,
    abs: (dk, d = 1) => fin(dk) ? Math.abs(u.to(dk)).toFixed(d) : '–',
    signed: (dk, d = 1) => { if (!fin(dk)) return '–'; const v = u.to(dk); const r = Math.abs(v) < 0.5 * Math.pow(10, -d) ? 0 : v; return (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r).toFixed(d); },
    dist: km => !fin(km) ? '–' : unit === 'lb' ? (km / KM_MI).toFixed(1) + ' mi' : km.toFixed(1) + ' km',
    distUnit: () => unit === 'lb' ? 'mi' : 'km',
    distTo: km => unit === 'lb' ? km / KM_MI : km,
    distFrom: v => unit === 'lb' ? v * KM_MI : v,
    cmToFtIn: cm => { const tin = cm / 2.54; let ft = Math.floor(tin / 12), inch = Math.round(tin - ft * 12); if (inch === 12) { ft++; inch = 0; } return { ft, inch }; },
    ftInToCm: (ft, inch) => ((+ft || 0) * 12 + (+inch || 0)) * 2.54,
    height: cm => { if (!fin(cm)) return '–'; if (unit === 'lb') { const f = u.cmToFtIn(cm); return f.ft + '′ ' + f.inch + '″'; } return Math.round(cm) + ' cm'; },
  };
  return u;
}
