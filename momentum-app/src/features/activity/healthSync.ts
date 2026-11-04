/* Health Connect sync (Samsung Health → Health Connect → Momentum).
   - syncHealth(n): reads the last n days; replaces each day's activity with Health Connect's numbers and adds exercise
     sessions as workouts with countedInSamsung:true (their calories are already inside active kcal → never double counted).
     A manual/photo workout that overlaps a synced session is marked countedInSamsung instead of listing it twice.
   - startHealthAutoSync(): on launch and whenever the app returns to the foreground, quietly syncs the last 3 days
     when permission was granted (throttled). Called once from the Activity route module.
   - useHealthState(): status, granted, lastSync, syncing for the UI. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import { keyOf } from '@/lib/calc';
import {
  getHealthStatus, grantedHealthPermissions, healthDayToActivity, healthSupported, readRecentDays, requestHealthPermissions, type HealthStatus,
} from '@/lib/health';
import { getState, store, subscribe as subscribeStore } from '@/lib/store';
import type { Activity, WorkoutEntry } from '@/lib/types';
import { overlapping } from './model';

const LAST_KEY = 'momentum.healthConnect.lastSync';
const AUTO_MIN_GAP = 15 * 60_000;

export interface HealthState { status: HealthStatus | 'checking'; granted: string[]; lastSync: number | null; syncing: boolean; error: string | null }
let S: HealthState = { status: healthSupported() ? 'checking' : 'unsupported', granted: [], lastSync: null, syncing: false, error: null };
const listeners = new Set<() => void>();
const set = (p: Partial<HealthState>) => { S = { ...S, ...p }; listeners.forEach(f => f()); };
const sub = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
export const getHealthState = () => S;

let loaded = false;
async function loadLast() {
  if (loaded) return; loaded = true;
  try { const v = await AsyncStorage.getItem(LAST_KEY); if (v && isFinite(+v)) set({ lastSync: +v }); } catch { /* ignore */ }
}
export async function refreshHealthStatus(): Promise<HealthState> {
  await loadLast();
  if (!healthSupported()) { set({ status: 'unsupported', granted: [] }); return S; }
  const status = await getHealthStatus();
  const granted = status === 'available' ? await grantedHealthPermissions() : [];
  set({ status, granted });
  return S;
}
export const hasCorePermissions = (g: string[]) => g.includes('Steps') || g.includes('ActiveCaloriesBurned');

export async function connectHealth(): Promise<string[]> {
  const granted = await requestHealthPermissions();
  set({ granted });
  return granted;
}

export interface SyncResult { days: number; workouts: number; merged: number }
/** Read the last n days from Health Connect into the store. */
export async function syncHealth(n = 7): Promise<SyncResult> {
  if (S.syncing) return { days: 0, workouts: 0, merged: 0 };
  set({ syncing: true, error: null });
  try {
    const list = await readRecentDays(n);
    const map: Record<string, Partial<Activity>> = {};
    const fresh: Partial<WorkoutEntry>[] = [];
    let merged = 0;
    list.forEach(d => {
      const a = healthDayToActivity(d);
      if (a) map[d.date] = a;
      const existing = store.getDay(d.date).workouts;
      d.workouts.forEach(w => {
        if (!w.id || !isFinite(w.t as number)) return;
        const same = existing.find(x => x.id === w.id);
        if (same) {
          // session already imported: refresh its numbers if Samsung updated them
          if (same.kcal !== w.kcal || same.minutes !== w.minutes) store.updateItem('workouts', same.id, { kcal: w.kcal, minutes: w.minutes });
          return;
        }
        const dup = existing.find(x => overlapping(x, w as WorkoutEntry));
        if (dup) { store.updateItem('workouts', dup.id, { countedInSamsung: true }); merged++; return; }
        fresh.push(w);
      });
    });
    const days = Object.keys(map).length ? store.setActivityBulk(map) : 0;
    if (fresh.length) store.addItemsBulk('workouts', fresh);
    const now = Date.now();
    set({ lastSync: now, syncing: false });
    AsyncStorage.setItem(LAST_KEY, String(now)).catch(() => {});
    return { days, workouts: fresh.length, merged };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Health Connect couldn’t be read.';
    set({ syncing: false, error: msg });
    throw e;
  }
}

/* ---------------- auto-sync on launch + foreground ---------------- */
let started = false;
let lastAuto = 0;
async function autoSync() {
  if (Date.now() - lastAuto < AUTO_MIN_GAP || S.syncing) return;
  if (!getState().ready || !store.profileComplete()) return;
  lastAuto = Date.now();
  try {
    const st = await refreshHealthStatus();
    if (st.status !== 'available' || !hasCorePermissions(st.granted)) return;
    await syncHealth(3);
  } catch (e) { console.warn('[health auto-sync]', e); }
}
export function startHealthAutoSync(): void {
  if (started || Platform.OS !== 'android' || !healthSupported()) return;
  started = true;
  // first sync once the store has loaded
  if (getState().ready) autoSync();
  else { const off = subscribeStore(() => { if (getState().ready) { off(); autoSync(); } }); }
  AppState.addEventListener('change', s => { if (s === 'active') autoSync(); });
}

export function useHealthState(): HealthState {
  const s = useSyncExternalStore(sub, getHealthState, getHealthState);
  useEffect(() => { refreshHealthStatus().catch(() => {}); }, []);
  return s;
}
/** "Synced 2:14 PM" / "Synced yesterday" */
export function syncedLabel(t: number | null | undefined, fmtTime: (t: number) => string, relDay: (k: string) => string): string {
  if (!t || !isFinite(t)) return 'Not synced yet';
  const k = keyOf(t);
  if (keyOf(Date.now()) === k) return 'Synced ' + fmtTime(t);
  const r = relDay(k);
  return 'Synced ' + (r === 'Yesterday' ? 'yesterday' : r);
}
