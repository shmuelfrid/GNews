/* Momentum — CSV: Samsung Health "Download personal data" parser (port of weight-tracker/js/views/activity.js),
   app CSV export/import, and file pick/share helpers. Parsing functions are pure. */
import * as DocumentPicker from 'expo-document-picker';
import { File as FsFile, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { isValidKey, keyOf, workoutType, WORKOUT_TYPES } from './calc';
import { hhmm, timeOn } from './format';
import type { Activity, Days, FoodEntry, WeightEntry, WorkoutEntry } from './types';

const fin = (v: unknown): v is number => typeof v === 'number' && isFinite(v);
const pad2 = (n: number) => String(n).padStart(2, '0');
const typeLabel = (id: string) => (WORKOUT_TYPES.find(w => w.id === id) || workoutType(id)).label;

/** split CSV text into rows of fields (handles quotes, CRLF, embedded commas/newlines, BOM) */
export function csvRows(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], f = '', q = false;
  text = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim() !== ''));
}
const normCol = (c: string) => String(c || '').trim().toLowerCase().split('.').pop() || '';
interface Table { idx: Record<string, number>; cols: string[]; rows: string[][] }
/** header row = first of the first 3 rows with ≥3 identifier-like columns incl. a known one */
function table(text: string): Table | null {
  const rows = csvRows(text);
  let hi = -1;
  for (let i = 0; i < Math.min(3, rows.length); i++) {
    const cols = rows[i].map(normCol);
    if (cols.some(c => /^(day_time|start_time|count|step_count|duration|calorie|create_time|update_time)$/.test(c)) && cols.filter(c => /^[a-z_][a-z0-9_]*$/.test(c)).length >= 3) { hi = i; break; }
  }
  if (hi < 0) return null;
  const cols = rows[hi].map(normCol);
  const idx: Record<string, number> = {}; cols.forEach((c, i) => { if (c && !(c in idx)) idx[c] = i; });
  return { idx, cols, rows: rows.slice(hi + 1) };
}
const cell = (r: string[], idx: Record<string, number>, ...names: string[]): string | null => { for (const n of names) if (n in idx) { const v = r[idx[n]]; if (v != null && String(v).trim() !== '') return String(v).trim(); } return null; };
const cnum = (r: string[], idx: Record<string, number>, ...names: string[]): number | null => { const v = cell(r, idx, ...names); if (v == null) return null; const n = parseFloat(v); return isFinite(n) ? n : null; };
/** Samsung timestamps: epoch ms (or s), or "YYYY-MM-DD HH:MM:SS.sss" in UTC (optional offset) */
export function parseTs(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (/^\d{9,14}(\.\d+)?$/.test(s)) { const n = +s; return n < 1e11 ? n * 1000 : n; }
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/.exec(s);
  if (!m) return null;
  let t = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0), m[7] ? +String(m[7]).slice(0, 3).padEnd(3, '0') : 0);
  if (m[8] && m[8] !== 'Z') { const sg = m[8][0] === '-' ? -1 : 1; const hh = +m[8].slice(1, 3), mm = +m[8].replace(':', '').slice(3, 5); t -= sg * (hh * 60 + mm) * 60000; }
  return t;
}
/** day_time is the user's calendar day stored as UTC midnight → key from its UTC date */
export function dayKeyOf(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const t = parseTs(s); if (t == null) return null;
  const d = new Date(t);
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
}
const EXERCISE_TYPES: Record<number, string> = { 1001: 'walk', 1002: 'run', 11007: 'cycling', 13001: 'walk', 14001: 'swim', 14002: 'swim', 9002: 'yoga', 15005: 'treadmill_walk', 15006: 'cycling', 15003: 'other', 10007: 'strength', 0: 'other' };
function exerciseType(code: string | null, title: string | null): string {
  const n = parseInt(code || '', 10);
  if (isFinite(n) && EXERCISE_TYPES[n]) return EXERCISE_TYPES[n];
  if (isFinite(n) && n >= 10001 && n <= 10026) return 'strength';
  return workoutType(title || '').id;
}
function kindOf(name: string, t: Table): 'summary' | 'steps' | 'exercise' | null {
  const n = String(name || '').toLowerCase();
  const has = (c: string) => c in t.idx;
  if (/day_summary/.test(n) && has('day_time')) return 'summary';
  if (/step_daily_trend/.test(n) || (has('day_time') && (has('count') || has('step_count')) && !has('start_time'))) return 'steps';
  if (/exercise/.test(n) && has('start_time') && !/weather|periodization|recovery|routine|custom_exercise|hr_zone|max_heart/.test(n)) return 'exercise';
  if (has('start_time') && has('duration') && has('exercise_type')) return 'exercise';
  return null;
}
/** Useful Samsung export files (filter a folder's CSV list down to these) */
export const isUsefulSamsungFile = (name: string) => /step_daily_trend|day_summary|exercise/i.test(name) && !/weather|periodization|recovery|routine|hr_zone|max_heart|custom_exercise/i.test(name);

export interface SamsungResult {
  days: Record<string, Partial<Activity>>;
  workouts: Partial<WorkoutEntry>[];
  files: { steps: number; exercise: number; summary: number; skipped: string[] };
  from: string | null; to: string | null;
}
/** parseSamsung([{name, text}]) — tolerant parser for Samsung Health export CSVs */
export function parseSamsung(files: { name: string; text: string }[]): SamsungResult {
  type Rec = { count: number | null; cal: number | null; dist: number | null; agg?: boolean; activeMs?: number | null };
  const steps: Record<string, Rec> = {}, summary: Record<string, Rec> = {}, workouts: Partial<WorkoutEntry>[] = [];
  const used = { steps: 0, exercise: 0, summary: 0, skipped: [] as string[] };
  (files || []).forEach(f => {
    const t = table(f.text);
    const kind = t && kindOf(f.name, t);
    if (!t || !kind) { used.skipped.push(f.name); return; }
    used[kind]++;
    const I = t.idx;
    t.rows.forEach(r => {
      if (kind === 'steps') {
        const key = dayKeyOf(cell(r, I, 'day_time')); if (!isValidKey(key)) return;
        const count = cnum(r, I, 'count', 'step_count'); if (count == null || count < 0) return;
        const src = cell(r, I, 'source_type');
        const rec: Rec = { count, cal: cnum(r, I, 'calorie'), dist: cnum(r, I, 'distance'), agg: src === '-2' };
        const prev = steps[key];
        if (!prev || (rec.agg && !prev.agg) || (rec.agg === prev.agg && (rec.count as number) > (prev.count as number))) steps[key] = rec;
      } else if (kind === 'summary') {
        const key = dayKeyOf(cell(r, I, 'day_time')); if (!isValidKey(key)) return;
        const rec: Rec = { count: cnum(r, I, 'step_count'), cal: cnum(r, I, 'calorie'), dist: cnum(r, I, 'distance'), activeMs: cnum(r, I, 'active_time') };
        const prev = summary[key];
        if (!prev || (rec.count || 0) >= (prev.count || 0)) summary[key] = rec;
      } else {
        const start = parseTs(cell(r, I, 'start_time')); if (start == null) return;
        const durMs = cnum(r, I, 'duration');
        let minutes = durMs != null ? durMs / 60000 : null;
        if (minutes == null) { const end = parseTs(cell(r, I, 'end_time')); if (end != null) minutes = (end - start) / 60000; }
        const kcal = cnum(r, I, 'calorie', 'total_calorie');
        if (!((minutes || 0) > 0) && !((kcal || 0) > 0)) return;
        const code = cell(r, I, 'exercise_type');
        const type = exerciseType(code, cell(r, I, 'exercise_custom_type', 'title', 'custom_title'));
        const dist = cnum(r, I, 'distance');
        const hr = cnum(r, I, 'mean_heart_rate', 'heart_rate');
        const uuid = cell(r, I, 'datauuid');
        workouts.push({
          id: 'sh-' + (uuid ? uuid.slice(0, 30) : String(start)), t: start, type, name: typeLabel(type),
          minutes: (minutes || 0) > 0 ? Math.round(minutes as number) : 0, kcal: (kcal || 0) > 0 ? Math.round(kcal as number) : 0,
          distanceKm: (dist || 0) > 0 ? Math.round((dist as number) / 10) / 100 : undefined, avgHr: (hr || 0) > 30 ? Math.round(hr as number) : undefined,
          source: 'samsung-export', countedInSamsung: true,
        });
      }
    });
  });
  const days: Record<string, Partial<Activity>> = {};
  const keys = new Set(Object.keys(steps).concat(Object.keys(summary)));
  keys.forEach(k => {
    const st = steps[k], su = summary[k];
    const o: Partial<Activity> = {};
    const sc = st ? st.count : su && su.count; if (fin(sc)) o.steps = Math.round(sc);
    const cal = su && fin(su.cal) ? su.cal : st && fin(st.cal) ? st.cal : null; if (fin(cal)) o.activeKcal = Math.round(cal);
    const dist = st && fin(st.dist) ? st.dist : su && fin(su.dist) ? su.dist : null; if (fin(dist) && dist > 0) o.distanceKm = Math.round(dist / 10) / 100;
    if (su && fin(su.activeMs)) o.activeMinutes = Math.round(su.activeMs / 60000);
    if (Object.keys(o).length) { o.source = 'samsung-export'; days[k] = o; }
  });
  // Was each session already inside Samsung's active calories for its day? Day summaries include exercise;
  // step-only calories include walks and runs (they are steps) but not cycling, swimming, weights, yoga…
  const STEP_BASED = ['walk', 'run', 'treadmill_walk', 'treadmill_run'];
  workouts.forEach(w => { const k = keyOf(w.t as number), d = days[k]; w.countedInSamsung = !!(d && fin(d.activeKcal) && (summary[k] || STEP_BASED.includes(w.type as string))); });
  const all = Object.keys(days).concat(workouts.map(w => keyOf(w.t as number))).sort();
  return { days, workouts, files: used, from: all[0] || null, to: all[all.length - 1] || null };
}

/* ================= app CSV export / import ================= */
export const APP_CSV_COLUMNS = ['kind', 'date', 'time', 'weight_kg', 'meal', 'name', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'type', 'minutes',
  'distance_km', 'avg_hr', 'steps', 'active_kcal', 'total_kcal', 'active_minutes', 'tags', 'note', 'source', 'counted_in_samsung', 'id'] as const;
type Col = typeof APP_CSV_COLUMNS[number];
const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

/** All entries as one CSV (canonical units; one row per weigh-in / food / workout / day activity). */
export function toAppCSV(days: Days): string {
  const lines = [APP_CSV_COLUMNS.join(',')];
  const row = (o: Partial<Record<Col, unknown>>) => lines.push(APP_CSV_COLUMNS.map(c => esc(o[c])).join(','));
  Object.keys(days).sort().forEach(k => {
    const d = days[k];
    d.weights.forEach(w => row({ kind: 'weight', date: k, time: hhmm(w.t), weight_kg: Math.round(w.kg * 100) / 100, tags: w.tags.join('|'), note: w.note, id: w.id }));
    d.foods.forEach(f => row({ kind: 'food', date: k, time: hhmm(f.t), meal: f.meal, name: f.name, kcal: f.kcal, protein_g: f.protein, carbs_g: f.carbs, fat_g: f.fat, note: f.note, source: f.source, id: f.id }));
    d.workouts.forEach(w => row({ kind: 'workout', date: k, time: hhmm(w.t), type: w.type, name: w.name, kcal: w.kcal, minutes: w.minutes, distance_km: w.distanceKm, avg_hr: w.avgHr, steps: w.steps, note: w.note, source: w.source, counted_in_samsung: w.countedInSamsung ? 1 : 0, id: w.id }));
    if (d.activity) row({ kind: 'activity', date: k, steps: d.activity.steps, active_kcal: d.activity.activeKcal, total_kcal: d.activity.totalKcal, active_minutes: d.activity.activeMinutes, distance_km: d.activity.distanceKm, source: d.activity.source });
  });
  return lines.join('\n') + '\n';
}

export interface AppCSVImport { weights: Partial<WeightEntry>[]; foods: Partial<FoodEntry>[]; workouts: Partial<WorkoutEntry>[]; activity: Record<string, Partial<Activity>>; skipped: number }
/** Parse an app CSV (from toAppCSV). Also accepts a simple weight log with columns date[,time],weight_kg|weight_lb|weight. */
export function parseAppCSV(text: string, unitForBareWeight: 'lb' | 'kg' = 'lb'): AppCSVImport {
  const rows = csvRows(text);
  const out: AppCSVImport = { weights: [], foods: [], workouts: [], activity: {}, skipped: 0 };
  if (!rows.length) return out;
  const head = rows[0].map(h => h.trim().toLowerCase());
  const ix = (n: string) => head.indexOf(n);
  const g = (r: string[], n: string) => { const i = ix(n); return i >= 0 ? String(r[i] ?? '').trim() : ''; };
  const nn = (r: string[], n: string) => { const v = parseFloat(g(r, n)); return isFinite(v) ? v : undefined; };
  rows.slice(1).forEach(r => {
    const date = g(r, 'date');
    if (!isValidKey(date)) { out.skipped++; return; }
    const t = timeOn(date, g(r, 'time') || '12:00');
    const kind = g(r, 'kind') || 'weight';
    const id = g(r, 'id') || undefined;
    if (kind === 'weight') {
      let kg = nn(r, 'weight_kg');
      if (kg == null && nn(r, 'weight_lb') != null) kg = (nn(r, 'weight_lb') as number) * 0.45359237;
      if (kg == null && nn(r, 'weight') != null) kg = unitForBareWeight === 'lb' ? (nn(r, 'weight') as number) * 0.45359237 : nn(r, 'weight');
      if (kg == null) { out.skipped++; return; }
      out.weights.push({ id, kg, t, tags: g(r, 'tags') ? g(r, 'tags').split('|') : [], note: g(r, 'note') });
    } else if (kind === 'food') {
      out.foods.push({ id, t, meal: (g(r, 'meal') || undefined) as FoodEntry['meal'], name: g(r, 'name'), kcal: nn(r, 'kcal'), protein: nn(r, 'protein_g'), carbs: nn(r, 'carbs_g'), fat: nn(r, 'fat_g'), note: g(r, 'note') || undefined, source: (g(r, 'source') || 'manual') as FoodEntry['source'], items: [] });
    } else if (kind === 'workout') {
      out.workouts.push({ id, t, type: g(r, 'type') || 'other', name: g(r, 'name') || undefined, kcal: nn(r, 'kcal'), minutes: nn(r, 'minutes'), distanceKm: nn(r, 'distance_km'), avgHr: nn(r, 'avg_hr'), steps: nn(r, 'steps'), note: g(r, 'note') || undefined, source: (g(r, 'source') || 'manual') as WorkoutEntry['source'], countedInSamsung: g(r, 'counted_in_samsung') === '1' });
    } else if (kind === 'activity') {
      out.activity[date] = { steps: nn(r, 'steps'), activeKcal: nn(r, 'active_kcal'), totalKcal: nn(r, 'total_kcal'), activeMinutes: nn(r, 'active_minutes'), distanceKm: nn(r, 'distance_km'), source: (g(r, 'source') || 'manual') as Activity['source'] };
    } else out.skipped++;
  });
  return out;
}

/* ================= files ================= */
/** Let the user pick one or more text/CSV files. Resolves [] on cancel. */
export async function pickTextFiles(opts: { multiple?: boolean } = {}): Promise<{ name: string; text: string }[]> {
  const r = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/csv', 'application/vnd.ms-excel', '*/*'], multiple: opts.multiple ?? true, copyToCacheDirectory: true });
  if (r.canceled || !r.assets) return [];
  return Promise.all(r.assets.map(async a => ({
    name: a.name,
    text: a.file ? await a.file.text() : Platform.OS === 'web' ? await (await fetch(a.uri)).text() : await new FsFile(a.uri).text(),
  })));
}
/** Share (native) or download (web) a text file. */
export async function shareTextFile(filename: string, text: string, mimeType = 'text/csv'): Promise<void> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return;
  }
  const f = new FsFile(Paths.cache, filename);
  if (f.exists) f.delete();
  f.create();
  f.write(text);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing isn’t available on this device.');
  await Sharing.shareAsync(f.uri, { mimeType, dialogTitle: filename, UTI: mimeType === 'text/csv' ? 'public.comma-separated-values-text' : 'public.json' });
}
