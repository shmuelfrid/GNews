/* Momentum — Health Connect (Android). Samsung Health syncs steps, active calories and exercise sessions into
   Health Connect; we read them. Needs the Android dev/production build (not Expo Go / iOS / web): every function
   is guarded and reports 'unsupported' instead of crashing. */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
import { NativeModules, Platform, TurboModuleRegistry } from 'react-native';
import { addDays, fromKey, keyOf, workoutType } from './calc';
import type { Activity, WorkoutEntry } from './types';

export type HealthStatus = 'unsupported' | 'not-installed' | 'needs-update' | 'available';
export const HEALTH_UNSUPPORTED_TEXT = 'Health Connect needs the Android app build. In Expo Go, on iPhone or on the web, import a Samsung Health screenshot or data export instead.';

let mod: any | null | undefined;
/** lazily load react-native-health-connect only when its native module is present */
function hc(): any | null {
  if (mod !== undefined) return mod;
  mod = null;
  if (Platform.OS !== 'android') return mod;
  try {
    const native = (TurboModuleRegistry?.get?.('HealthConnect') as unknown) || NativeModules.HealthConnect;
    if (!native) return mod;
    mod = require('react-native-health-connect');
  } catch { mod = null; }
  return mod;
}
/** sync check: is the native module in this build? (false in Expo Go / iOS / web) */
export const healthSupported = () => !!hc();

let inited = false;
export async function getHealthStatus(): Promise<HealthStatus> {
  const m = hc(); if (!m) return 'unsupported';
  try {
    const s: number = await m.getSdkStatus();
    if (s === m.SdkAvailabilityStatus.SDK_UNAVAILABLE) return 'not-installed';
    if (s === m.SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) return 'needs-update';
    if (!inited) inited = await m.initialize();
    return inited ? 'available' : 'not-installed';
  } catch { return 'unsupported'; }
}

export const HEALTH_PERMISSIONS = [
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
  { accessType: 'read', recordType: 'TotalCaloriesBurned' },
  { accessType: 'read', recordType: 'ExerciseSession' },
  { accessType: 'read', recordType: 'Distance' },
  { accessType: 'read', recordType: 'Weight' },
] as const;

/** Ask for read permissions. Returns the record types granted. */
export async function requestHealthPermissions(): Promise<string[]> {
  if ((await getHealthStatus()) !== 'available') return [];
  const granted: any[] = await hc().requestPermission(HEALTH_PERMISSIONS as any);
  return granted.filter(g => g.accessType === 'read').map(g => g.recordType);
}
export async function grantedHealthPermissions(): Promise<string[]> {
  if ((await getHealthStatus()) !== 'available') return [];
  try { const g: any[] = await hc().getGrantedPermissions(); return g.filter(x => x.accessType === 'read').map(x => x.recordType); } catch { return []; }
}
export function openHealthSettings(): void { try { hc()?.openHealthConnectSettings(); } catch { /* ignore */ } }

/** Health Connect exercise type → our workout type id */
function mapExercise(code: number, title?: string): string {
  const m = hc(); const E = m?.ExerciseType || {};
  const table: Record<number, string> = {
    [E.WALKING]: 'walk', [E.RUNNING]: 'run', [E.RUNNING_TREADMILL]: 'treadmill_run', [E.BIKING]: 'cycling', [E.BIKING_STATIONARY]: 'cycling',
    [E.STRENGTH_TRAINING]: 'strength', [E.WEIGHTLIFTING]: 'strength', [E.SWIMMING_POOL]: 'swim', [E.SWIMMING_OPEN_WATER]: 'swim',
    [E.HIGH_INTENSITY_INTERVAL_TRAINING]: 'hiit', [E.YOGA]: 'yoga', [E.PILATES]: 'yoga', [E.HIKING]: 'walk',
  };
  return table[code] || workoutType(title || '').id;
}

export interface HealthDay { date: string; steps: number | null; activeKcal: number | null; totalKcal: number | null; distanceKm: number | null; workouts: Partial<WorkoutEntry>[] }

/** Read one local day from Health Connect. Throws if unavailable or permission missing. */
export async function readDay(date: string): Promise<HealthDay> {
  if ((await getHealthStatus()) !== 'available') throw Object.assign(new Error(HEALTH_UNSUPPORTED_TEXT), { code: 'unsupported' });
  const m = hc();
  const timeRangeFilter = { operator: 'between', startTime: fromKey(date).toISOString(), endTime: fromKey(addDays(date, 1)).toISOString() };
  const agg = async (recordType: string) => { try { return await m.aggregateRecord({ recordType, timeRangeFilter }); } catch { return null; } };
  const [st, ac, tc, di] = await Promise.all([agg('Steps'), agg('ActiveCaloriesBurned'), agg('TotalCaloriesBurned'), agg('Distance')]);
  let sessions: any[] = [];
  try { sessions = (await m.readRecords('ExerciseSession', { timeRangeFilter })).records || []; } catch { sessions = []; }
  const workouts: Partial<WorkoutEntry>[] = await Promise.all(sessions.map(async s => {
    const start = Date.parse(s.startTime), end = Date.parse(s.endTime);
    const range = { operator: 'between', startTime: s.startTime, endTime: s.endTime };
    let kcal = 0;
    try { const r = await m.aggregateRecord({ recordType: 'ActiveCaloriesBurned', timeRangeFilter: range }); kcal = Math.round(r?.ACTIVE_CALORIES_TOTAL?.inKilocalories || 0); } catch { /* none */ }
    const type = mapExercise(s.exerciseType, s.title);
    return {
      id: 'hc-' + String(s.metadata?.id || start).slice(0, 36), t: start, type, name: s.title || undefined,
      minutes: isFinite(end - start) ? Math.round((end - start) / 60000) : 0, kcal,
      source: 'health-connect' as const,
      // Samsung's active calories already include exercise sessions
      countedInSamsung: true,
    };
  }));
  const num = (v: any) => (typeof v === 'number' && isFinite(v) ? v : null);
  return {
    date,
    steps: num(st?.COUNT_TOTAL),
    activeKcal: num(ac?.ACTIVE_CALORIES_TOTAL?.inKilocalories) != null ? Math.round(ac.ACTIVE_CALORIES_TOTAL.inKilocalories) : null,
    totalKcal: num(tc?.ENERGY_TOTAL?.inKilocalories) != null ? Math.round(tc.ENERGY_TOTAL.inKilocalories) : null,
    distanceKm: num(di?.DISTANCE?.inKilometers) != null ? Math.round(di.DISTANCE.inKilometers * 100) / 100 : null,
    workouts,
  };
}
/** HealthDay → activity object for store.setActivity (null when nothing was recorded) */
export function healthDayToActivity(d: HealthDay): Partial<Activity> | null {
  const a: Partial<Activity> = { source: 'health-connect', syncedAt: Date.now() };
  if (d.steps != null) a.steps = d.steps;
  if (d.activeKcal != null && d.activeKcal > 0) a.activeKcal = d.activeKcal;
  if (d.totalKcal != null) a.totalKcal = d.totalKcal;
  if (d.distanceKm != null) a.distanceKm = d.distanceKm;
  return Object.keys(a).length > 2 ? a : null;
}
/** Read the last n days (ending today), oldest first. */
export async function readRecentDays(n = 7): Promise<HealthDay[]> {
  const today = keyOf(Date.now());
  const out: HealthDay[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(await readDay(addDays(today, -i)));
  return out;
}
/** Latest weight in Health Connect within `days` (kg) or null */
export async function readLatestWeight(days = 30): Promise<{ kg: number; t: number } | null> {
  if ((await getHealthStatus()) !== 'available') return null;
  try {
    const now = new Date();
    const r = await hc().readRecords('Weight', { timeRangeFilter: { operator: 'between', startTime: new Date(now.getTime() - days * 864e5).toISOString(), endTime: now.toISOString() }, ascendingOrder: false, pageSize: 1 });
    const w = r.records?.[0];
    return w ? { kg: w.weight.inKilograms, t: Date.parse(w.time) } : null;
  } catch { return null; }
}
