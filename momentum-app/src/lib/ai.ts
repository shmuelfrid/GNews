/* Momentum — AI client. Claude is reached ONLY through the Firebase callable function 'analyze' (us-central1).
   Every call returns typed JSON or throws AiError {code, message (friendly copy)}. Results must go to an editable
   review card before saving (helpers at the bottom map them onto entry shapes). */
import { httpsCallable } from 'firebase/functions';

import { ensureSignedIn, functions } from './firebase';
import { prepareImage, type PickedImage, type PreparedImage } from './images';
import { getState } from './store';
import { keyOf } from './calc';
import { mealForTime } from './format';
import type { Activity, FoodEntry, Meal, WorkoutEntry } from './types';

export type Confidence = 'low' | 'medium' | 'high';
export interface FoodAiItem { name: string; portion: string; kcal: number; protein_g: number; carbs_g: number; fat_g: number }
export interface FoodAiResult { items: FoodAiItem[]; total_kcal: number; confidence: Confidence; notes: string }
export interface WorkoutAiResult {
  type: string; start_time_iso: string | null; duration_min: number | null; kcal: number | null; distance_km: number | null;
  avg_hr: number | null; steps: number | null; notes: string; confidence: Confidence;
}
export interface HealthAiResult {
  date_iso: string | null; steps: number | null; active_kcal: number | null; total_kcal: number | null;
  active_minutes: number | null; distance_km: number | null; confidence: Confidence;
}
type Kind = 'food_photo' | 'food_text' | 'workout_photo' | 'health_screenshot';
interface AnalyzeRequest {
  kind: Kind; text?: string; imageBase64?: string; mediaType?: 'image/jpeg' | 'image/png' | 'image/webp';
  context?: { unit: 'lb' | 'kg'; weightKg?: number; localDateISO: string; timeZone: string };
}

export type AiErrorCode = 'not-configured' | 'unauthenticated' | 'invalid-argument' | 'resource-exhausted' | 'failed-precondition'
  | 'deadline-exceeded' | 'unavailable' | 'cancelled' | 'internal';
const COPY: Record<AiErrorCode, string> = {
  'not-configured': 'AI isn’t set up in this build. Add your Firebase config to use photo and description analysis, or enter it manually.',
  unauthenticated: 'You’re not signed in yet. Check your connection and try again.',
  'invalid-argument': 'That request couldn’t be read. Try a different photo or description.',
  'resource-exhausted': 'You’ve hit the AI limit for now. Wait a few minutes, or enter it manually.',
  'failed-precondition': 'Claude couldn’t read that. Try a clearer, closer photo, or enter it manually.',
  'deadline-exceeded': 'That took too long. Check your connection and try again.',
  unavailable: 'You’re offline. Connect to the internet to use AI, or enter it manually.',
  cancelled: 'Cancelled.',
  internal: 'Something went wrong while analyzing. Try again, or enter it manually.',
};
export class AiError extends Error {
  code: AiErrorCode; raw?: unknown;
  constructor(code: AiErrorCode, message?: string, raw?: unknown) { super(message || COPY[code]); this.code = code; this.raw = raw; }
}
/** true when AI entry points should be hidden/replaced by manual entry (config problem, not transient) */
export const isFatal = (code: AiErrorCode) => code === 'not-configured';
/** false in demo mode: show AI_UNAVAILABLE_TEXT and route to manual forms */
export const aiAvailable = () => !!functions;
export const AI_UNAVAILABLE_TEXT = COPY['not-configured'];

function context(): AnalyzeRequest['context'] {
  const s = getState();
  let tz = 'UTC';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { /* Hermes without Intl tz */ }
  const w = s.profile?.startKg;
  const ws = Object.keys(s.days).sort().reverse();
  let weightKg = typeof w === 'number' ? w : undefined;
  for (const k of ws) { const arr = s.days[k].weights; if (arr.length) { weightKg = arr[arr.length - 1].kg; break; } }
  return { unit: s.profile?.unit || 'lb', weightKg, localDateISO: keyOf(Date.now()), timeZone: tz };
}

async function call<T>(req: AnalyzeRequest, signal?: AbortSignal): Promise<T> {
  if (!functions) throw new AiError('not-configured');
  if (signal?.aborted) throw new AiError('cancelled');
  try { await ensureSignedIn(); } catch (e) { throw new AiError('unauthenticated', undefined, e); }
  const fn = httpsCallable<AnalyzeRequest, T>(functions, 'analyze', { timeout: 120_000 });
  const p = fn(req).then(r => r.data);
  const aborted = new Promise<never>((_, rej) => signal?.addEventListener('abort', () => rej(new AiError('cancelled')), { once: true }));
  try {
    return await (signal ? Promise.race([p, aborted]) : p);
  } catch (e) {
    if (e instanceof AiError) throw e;
    const code = String((e as { code?: string })?.code || '').replace(/^functions\//, '');
    const known: AiErrorCode[] = ['unauthenticated', 'invalid-argument', 'resource-exhausted', 'failed-precondition', 'deadline-exceeded', 'unavailable', 'cancelled', 'internal'];
    const c = (known.includes(code as AiErrorCode) ? code : 'internal') as AiErrorCode;
    // server sends friendly copy for failed-precondition (e.g. "That doesn't look like food")
    const serverMsg = (e as { message?: string })?.message;
    throw new AiError(c, c === 'failed-precondition' && serverMsg && serverMsg.length < 200 && !/^internal$/i.test(serverMsg) ? serverMsg : undefined, e);
  }
}
async function imageReq(kind: Kind, img: string | PickedImage | PreparedImage, signal?: AbortSignal): Promise<AnalyzeRequest> {
  const prepared = typeof img !== 'string' && 'base64' in img ? img : await prepareImage(img);
  if (signal?.aborted) throw new AiError('cancelled');
  return { kind, imageBase64: prepared.base64, mediaType: prepared.mediaType, context: context() };
}
export interface AiOpts { signal?: AbortSignal }

/** Photo of a meal → items + kcal/macros. `img` = local uri, picked image, or PreparedImage (preferred: reuse for upload). */
export async function analyzeFoodPhoto(img: string | PickedImage | PreparedImage, opts?: AiOpts): Promise<FoodAiResult> {
  return normFood(await call<FoodAiResult>(await imageReq('food_photo', img, opts?.signal), opts?.signal));
}
/** "2 eggs and toast with butter" → items + kcal/macros */
export async function analyzeFoodText(text: string, opts?: AiOpts): Promise<FoodAiResult> {
  const t = String(text || '').trim();
  if (!t) throw new AiError('invalid-argument', 'Describe what you ate first.');
  return normFood(await call<FoodAiResult>({ kind: 'food_text', text: t.slice(0, 2000), context: context() }, opts?.signal));
}
/** Treadmill/watch/app screenshot or photo → workout fields (nulls when not visible) */
export async function analyzeWorkoutPhoto(img: string | PickedImage | PreparedImage, opts?: AiOpts): Promise<WorkoutAiResult> {
  return call<WorkoutAiResult>(await imageReq('workout_photo', img, opts?.signal), opts?.signal);
}
/** Samsung Health (or any health app) daily screenshot → steps / active kcal / … */
export async function analyzeHealthScreenshot(img: string | PickedImage | PreparedImage, opts?: AiOpts): Promise<HealthAiResult> {
  return call<HealthAiResult>(await imageReq('health_screenshot', img, opts?.signal), opts?.signal);
}

const n0 = (v: unknown) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : 0);
function normFood(r: FoodAiResult): FoodAiResult {
  const items = Array.isArray(r?.items) ? r.items.map(i => ({ name: String(i.name || 'Item'), portion: String(i.portion || ''), kcal: Math.round(n0(i.kcal)), protein_g: n0(i.protein_g), carbs_g: n0(i.carbs_g), fat_g: n0(i.fat_g) })) : [];
  if (!items.length) throw new AiError('failed-precondition', 'No food was recognised. Try a closer photo or describe it.');
  const total = n0(r.total_kcal) || items.reduce((s, i) => s + i.kcal, 0);
  return { items, total_kcal: Math.round(total), confidence: (['low', 'medium', 'high'].includes(r.confidence) ? r.confidence : 'medium') as Confidence, notes: String(r.notes || '') };
}

/* ---------- mapping helpers (results → editable entry drafts) ---------- */
const r1 = (v: number) => Math.round(v * 10) / 10;
/** Food result → FoodEntry draft (no id). Name = joined item names (≤3). */
export function foodDraft(r: FoodAiResult, o: { t?: number; meal?: Meal; source: 'photo' | 'text'; photoPath?: string }): Omit<FoodEntry, 'id'> {
  const t = o.t ?? Date.now();
  const names = r.items.map(i => i.name);
  return {
    t, meal: o.meal || mealForTime(t), source: o.source, photoPath: o.photoPath,
    name: names.slice(0, 3).join(', ') + (names.length > 3 ? ' +' + (names.length - 3) : ''),
    kcal: r.total_kcal,
    protein: r1(r.items.reduce((s, i) => s + i.protein_g, 0)), carbs: r1(r.items.reduce((s, i) => s + i.carbs_g, 0)), fat: r1(r.items.reduce((s, i) => s + i.fat_g, 0)),
    items: r.items.map(i => ({ name: i.name, portion: i.portion, kcal: i.kcal, protein: i.protein_g, carbs: i.carbs_g, fat: i.fat_g })),
    note: r.notes || undefined,
  };
}
/** Workout result → WorkoutEntry draft. Unknown values stay undefined (form shows empty fields). */
export function workoutDraft(r: WorkoutAiResult, o: { photoPath?: string; fallbackT?: number } = {}): Partial<WorkoutEntry> {
  const t = r.start_time_iso ? Date.parse(r.start_time_iso) : NaN;
  return {
    t: isFinite(t) ? t : (o.fallbackT ?? Date.now()), type: r.type || 'other', minutes: r.duration_min ?? undefined, kcal: r.kcal ?? undefined,
    distanceKm: r.distance_km ?? undefined, avgHr: r.avg_hr ?? undefined, steps: r.steps ?? undefined, note: r.notes || undefined,
    source: 'photo', countedInSamsung: false, photoPath: o.photoPath,
  };
}
/** Health screenshot → {date key, activity} */
export function activityDraft(r: HealthAiResult): { date: string | null; activity: Partial<Activity> } {
  const a: Partial<Activity> = { source: 'samsung-screenshot', syncedAt: Date.now() };
  if (r.steps != null) a.steps = r.steps;
  if (r.active_kcal != null) a.activeKcal = r.active_kcal;
  if (r.total_kcal != null) a.totalKcal = r.total_kcal;
  if (r.active_minutes != null) a.activeMinutes = r.active_minutes;
  if (r.distance_km != null) a.distanceKm = r.distance_km;
  return { date: r.date_iso && /^\d{4}-\d{2}-\d{2}/.test(r.date_iso) ? r.date_iso.slice(0, 10) : null, activity: a };
}
