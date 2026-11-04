/* Momentum — data store. Renders instantly from an AsyncStorage mirror; syncs to Firestore (users/{uid} +
   users/{uid}/days/{YYYY-MM-DD}) with per-day last-writer-wins on updatedAt. Demo mode (no Firebase config):
   AsyncStorage only. Feature code reads through hooks and writes through `store.*` mutations. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, deleteDoc, doc, getDocs, onSnapshot, setDoc, type Unsubscribe } from 'firebase/firestore';
import { useEffect, useState, useSyncExternalStore } from 'react';
import * as C from './calc';
import { db, ensureSignedIn, firebaseEnabled, onUser } from './firebase';
import { makeUnits, mealForTime, uid as newId, type Units } from './format';
import type { Activity, DayDoc, Days, FoodEntry, ItemKind, ItemOf, Profile, WeightEntry, WorkoutEntry } from './types';

export type SyncState = 'demo' | 'connecting' | 'cloud' | 'offline' | 'error';
export interface StoreState {
  ready: boolean;
  profile: Profile | null;
  days: Days;
  /** bumps on every change (cache key for derived data) */
  v: number;
  sync: SyncState;
  uid: string | null;
  isAnonymous: boolean;
  email: string | null;
  syncError: string | null;
}

/* ================= cleaning (port of web core.js) ================= */
const num = (v: unknown, lo: number, hi: number): number | null => { const n = +(v as number); return isFinite(n) && n >= lo && n <= hi && v !== null && v !== '' ? n : null; };
const str = (v: unknown, n = 200) => String(v == null ? '' : v).slice(0, n);
// Storage path, native demo file uri, or (web demo only) a small inline data URL.
const okPath = (p: unknown): p is string => typeof p === 'string' && p.length > 0 && (p.startsWith('local:data:image/') ? p.length < 300_000 : p.length < 600 && (p.startsWith('users/') || p.startsWith('local:')));

export const emptyDay = (key: string): DayDoc => ({ date: key, weights: [], foods: [], workouts: [], activity: null, planTicks: {}, updatedAt: 0 });

function cleanWeight(e: Partial<WeightEntry>): WeightEntry | null {
  const kg = num(e.kg, 10, 500), t = num(e.t, 0, 1e14);
  if (kg == null || t == null) return null;
  return { id: str(e.id || newId(), 40), kg, t, tags: Array.isArray(e.tags) ? e.tags.slice(0, 8).map(x => str(x, 40)) : [], note: str(e.note, 280) };
}
function cleanFood(e: Partial<FoodEntry>): FoodEntry | null {
  const t = num(e.t, 0, 1e14);
  if (t == null) return null;
  const items = Array.isArray(e.items) ? e.items.slice(0, 30).map(it => {
    const o: FoodEntry['items'][number] = { name: str(it.name, 120), portion: str(it.portion, 80), kcal: num(it.kcal, 0, 20000) || 0 };
    (['protein', 'carbs', 'fat'] as const).forEach(k => { const v = num(it[k], 0, 3000); if (v != null) o[k] = Math.round(v * 10) / 10; });
    return o;
  }) : [];
  let kcal = num(e.kcal, 0, 30000);
  if (kcal == null) kcal = items.reduce((s, it) => s + it.kcal, 0);
  const o: FoodEntry = {
    id: str(e.id || newId(), 40), t, meal: (['breakfast', 'lunch', 'dinner', 'snacks'] as const).includes(e.meal as never) ? e.meal! : mealForTime(t),
    name: str(e.name || (items[0] && items[0].name) || 'Food', 160), kcal: Math.round(kcal), items,
    source: (['photo', 'text', 'manual'] as const).includes(e.source as never) ? e.source! : 'manual',
  };
  (['protein', 'carbs', 'fat'] as const).forEach(k => { const v = num(e[k], 0, 3000); if (v != null) o[k] = Math.round(v * 10) / 10; });
  if (okPath(e.photoPath)) o.photoPath = e.photoPath;
  if (e.note) o.note = str(e.note, 280);
  return o;
}
function cleanWorkout(e: Partial<WorkoutEntry>): WorkoutEntry | null {
  const t = num(e.t, 0, 1e14);
  if (t == null) return null;
  const o: WorkoutEntry = {
    id: str(e.id || newId(), 40), t, type: str(e.type || 'other', 40), minutes: num(e.minutes, 0, 1440) || 0,
    kcal: Math.round(num(e.kcal, 0, 10000) || 0),
    source: (['photo', 'manual', 'samsung-export', 'health-connect'] as const).includes(e.source as never) ? e.source! : 'manual',
    countedInSamsung: !!e.countedInSamsung,
  };
  if (e.name) o.name = str(e.name, 80);
  const dk = num(e.distanceKm, 0, 1000); if (dk != null) o.distanceKm = dk;
  const hr = num(e.avgHr, 30, 250); if (hr != null) o.avgHr = Math.round(hr);
  const st = num(e.steps, 0, 200000); if (st != null) o.steps = Math.round(st);
  if (e.note) o.note = str(e.note, 280);
  if (okPath(e.photoPath)) o.photoPath = e.photoPath;
  return o;
}
function cleanActivity(a: Partial<Activity> | null | undefined): Activity | null {
  if (!a || typeof a !== 'object') return null;
  const o: Partial<Activity> = {};
  const steps = num(a.steps, 0, 200000); if (steps != null) o.steps = Math.round(steps);
  const ak = num(a.activeKcal, 0, 15000); if (ak != null) o.activeKcal = Math.round(ak);
  const tk = num(a.totalKcal, 0, 20000); if (tk != null) o.totalKcal = Math.round(tk);
  const am = num(a.activeMinutes, 0, 1440); if (am != null) o.activeMinutes = Math.round(am);
  const dk = num(a.distanceKm, 0, 1000); if (dk != null) o.distanceKm = Math.round(dk * 100) / 100;
  if (!Object.keys(o).length) return null;
  o.source = (['samsung-screenshot', 'samsung-export', 'health-connect', 'manual'] as const).includes(a.source as never) ? a.source : 'manual';
  o.syncedAt = num(a.syncedAt, 0, 1e14) || Date.now();
  return o as Activity;
}
const CLEAN = { weights: cleanWeight, foods: cleanFood, workouts: cleanWorkout } as const;
const KINDS: ItemKind[] = ['weights', 'foods', 'workouts'];

function cleanDay(d: unknown, key?: string): DayDoc | null {
  if (!d || typeof d !== 'object') return null;
  const src = d as Partial<DayDoc>;
  const k = key || src.date;
  if (!C.isValidKey(k)) return null;
  const o = emptyDay(k);
  o.weights = Array.isArray(src.weights) ? src.weights.map(cleanWeight).filter(Boolean) as WeightEntry[] : [];
  o.foods = Array.isArray(src.foods) ? src.foods.map(cleanFood).filter(Boolean) as FoodEntry[] : [];
  o.workouts = Array.isArray(src.workouts) ? src.workouts.map(cleanWorkout).filter(Boolean) as WorkoutEntry[] : [];
  o.activity = cleanActivity(src.activity);
  const ticks: Record<string, boolean> = {};
  if (src.planTicks && typeof src.planTicks === 'object') Object.keys(src.planTicks).slice(0, 20).forEach(id => { ticks[str(id, 40)] = !!(src.planTicks as Record<string, boolean>)[id]; });
  o.planTicks = ticks;
  o.updatedAt = +(src.updatedAt as number) || 0;
  return o;
}
const PROFILE_KEYS: (keyof Profile)[] = ['name', 'sex', 'birthYear', 'heightCm', 'unit', 'theme', 'startKg', 'startDate', 'goalKg', 'targetDate',
  'paceKgPerWeek', 'stepGoal', 'activityBaseline', 'waistCm', 'createdAt', 'updatedAt', 'celebrated'];
function cleanProfile(p: unknown): Profile | null {
  if (!p || typeof p !== 'object') return null;
  const src = p as Record<string, unknown>;
  const o: Record<string, unknown> = {};
  PROFILE_KEYS.forEach(k => { if (src[k] !== undefined && src[k] !== null) o[k] = src[k]; });
  if (!Array.isArray(o.celebrated)) o.celebrated = [];
  o.unit = o.unit === 'kg' ? 'kg' : 'lb';
  if (!['system', 'light', 'dark'].includes(o.theme as string)) o.theme = 'system';
  return o as unknown as Profile;
}
const dayIsEmpty = (d: DayDoc | undefined) => !d || (!d.weights.length && !d.foods.length && !d.workouts.length && !d.activity && !Object.keys(d.planTicks || {}).length);
const clone = <T,>(o: T): T => (o == null ? o : JSON.parse(JSON.stringify(o)));

export const clean = { weight: cleanWeight, food: cleanFood, workout: cleanWorkout, activity: cleanActivity, day: cleanDay, profile: cleanProfile, emptyDay };

/* ================= state + subscription ================= */
let S: StoreState = { ready: false, profile: null, days: {}, v: 0, sync: firebaseEnabled ? 'connecting' : 'demo', uid: null, isAnonymous: true, email: null, syncError: null };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => { try { l(); } catch (e) { console.error(e); } });
const set = (patch: Partial<StoreState>) => { S = { ...S, ...patch }; emit(); };
export const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const getState = () => S;

const LOCAL_KEY = (id: string | null) => 'momentum.rn.v1:' + (id || 'local');
let syncedDays: string[] = [];
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function saveLocal() {
  if (saveTimer) clearTimeout(saveTimer);
  const key = LOCAL_KEY(S.uid);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    AsyncStorage.setItem(key, JSON.stringify({ v: 1, profile: S.profile, days: S.days, syncedDays })).catch(e => console.warn('local save failed', e));
  }, 250);
}
function changed(patch: Partial<StoreState>) { S = { ...S, ...patch, v: S.v + 1 }; saveLocal(); emit(); }

/* ================= cloud ================= */
const pendingDays = new Map<string, ReturnType<typeof setTimeout>>();
const inflight = new Set<string>();
let profileTimer: ReturnType<typeof setTimeout> | null = null;
let unsubs: Unsubscribe[] = [];
let firstDaysSnap = true;
let resetting = false;

const userRef = () => (db && S.uid ? doc(db, 'users', S.uid) : null);
const dayRef = (k: string) => (db && S.uid ? doc(db, 'users', S.uid, 'days', k) : null);
const plain = <T,>(o: T): T => JSON.parse(JSON.stringify(o));

function syncError(e: unknown) {
  const code = (e as { code?: string })?.code || '';
  console.warn('[sync]', code, e);
  const offline = code === 'unavailable' || code === 'deadline-exceeded';
  set({ sync: offline ? 'offline' : 'error', syncError: offline ? 'Offline. Changes are saved on this phone and will sync later.' : code === 'permission-denied' ? 'Sync was refused by the server (check Firestore rules).' : 'Sync paused. Your entries are saved on this phone.' });
}
function queueProfile() {
  if (!userRef()) return;
  if (profileTimer) clearTimeout(profileTimer);
  profileTimer = setTimeout(() => {
    profileTimer = null;
    const r = userRef();
    if (r && S.profile) setDoc(r, plain(S.profile)).catch(syncError);
  }, 400);
}
function queueDay(key: string) {
  if (!dayRef(key)) return;
  const t = pendingDays.get(key); if (t) clearTimeout(t);
  pendingDays.set(key, setTimeout(() => flushDay(key), 600));
}
function flushDay(key: string) {
  pendingDays.delete(key);
  const r = dayRef(key), d = S.days[key];
  if (!r || !d) return;
  inflight.add(key);
  setDoc(r, plain(d))
    .then(() => { if (!syncedDays.includes(key)) syncedDays.push(key); if (S.sync !== 'cloud') set({ sync: 'cloud', syncError: null }); })
    .catch(syncError)
    .finally(() => inflight.delete(key));
}
const busy = (k: string) => pendingDays.has(k) || inflight.has(k);

function connectCloud() {
  unsubs.forEach(u => u()); unsubs = [];
  firstDaysSnap = true;
  const ur = userRef();
  if (!db || !ur || !S.uid) return;
  unsubs.push(onSnapshot(ur, snap => {
    if (resetting) return;
    if (snap.exists()) {
      const rp = cleanProfile(snap.data());
      const lp = S.profile;
      if (rp && (!lp || (+(rp.updatedAt || 0)) > (+(lp.updatedAt || 0)))) {
        const merged = cleanProfile({ ...(lp || {}), ...rp });
        if (JSON.stringify(merged) !== JSON.stringify(lp)) changed({ profile: merged });
      } else if (rp && lp && (+(rp.updatedAt || 0)) < (+(lp.updatedAt || 0)) && !profileTimer) {
        setDoc(ur, plain(lp)).catch(syncError);
      }
    } else if (S.profile && !snap.metadata.hasPendingWrites && !profileTimer) {
      setDoc(ur, plain(S.profile)).catch(syncError);
    }
    if (!snap.metadata.fromCache && S.sync !== 'cloud') set({ sync: 'cloud', syncError: null });
  }, syncError));
  unsubs.push(onSnapshot(collection(db, 'users', S.uid, 'days'), snap => {
    if (resetting) return;
    const remote = new Map<string, DayDoc>();
    snap.docs.forEach(d => { const c = cleanDay(d.data(), d.id); if (c) remote.set(d.id, c); });
    const days = { ...S.days };
    let dirty = false;
    const synced = new Set(syncedDays);
    remote.forEach((rd, k) => {
      if (busy(k)) return;
      const ld = days[k];
      if (!ld || rd.updatedAt > ld.updatedAt) { if (JSON.stringify(rd) !== JSON.stringify(ld)) { days[k] = rd; dirty = true; } }
      else if (ld.updatedAt > rd.updatedAt) queueDay(k);
    });
    Object.keys(days).forEach(k => {
      if (remote.has(k) || busy(k)) return;
      if (firstDaysSnap && !synced.has(k)) queueDay(k);                  // never uploaded: push
      else if (synced.has(k)) { delete days[k]; dirty = true; }          // deleted elsewhere
    });
    firstDaysSnap = false;
    syncedDays = Array.from(new Set(Array.from(remote.keys()).concat(Array.from(pendingDays.keys()))));
    if (dirty) changed({ days }); else saveLocal();
    if (!snap.metadata.fromCache && S.sync !== 'cloud') set({ sync: 'cloud', syncError: null });
  }, syncError));
}

async function loadLocal(id: string | null): Promise<{ profile: Profile | null; days: Days }> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_KEY(id));
    if (raw) {
      const d = JSON.parse(raw);
      const days: Days = {};
      Object.keys(d.days || {}).forEach(k => { const c = cleanDay(d.days[k], k); if (c) days[k] = c; });
      syncedDays = Array.isArray(d.syncedDays) ? d.syncedDays : [];
      return { profile: cleanProfile(d.profile), days };
    }
  } catch (e) { console.warn('local load failed', e); }
  syncedDays = [];
  return { profile: null, days: {} };
}

let started = false;
/** Boot the store once (root layout). Loads the local mirror, signs in anonymously, starts sync. */
export async function initStore(): Promise<void> {
  if (started) return; started = true;
  if (!firebaseEnabled) {
    const l = await loadLocal(null);
    changed({ ...l, ready: true, sync: 'demo', uid: null });
    return;
  }
  // Load the last signed-in user's mirror immediately (works offline), then attach auth.
  const lastUid = await AsyncStorage.getItem('momentum.rn.lastUid').catch(() => null);
  const l = await loadLocal(lastUid);
  changed({ ...l, ready: true, uid: lastUid, sync: 'connecting' });
  onUser(async u => {
    if (!u) return;
    if (u.uid !== S.uid) {
      unsubs.forEach(x => x()); unsubs = [];
      const local = await loadLocal(u.uid);
      // first sign-in on this device: adopt anything entered before auth resolved
      const carry = !lastUid && !S.uid ? { profile: S.profile, days: S.days } : local;
      changed({ ...carry, uid: u.uid });
      AsyncStorage.setItem('momentum.rn.lastUid', u.uid).catch(() => {});
    }
    set({ isAnonymous: u.isAnonymous, email: u.email });
    connectCloud();
  });
  const attempt = () => ensureSignedIn().catch(e => { syncError(e); setTimeout(attempt, 15000); });
  attempt();
}

/* ================= mutations ================= */
function updateDayInternal(key: string, fn: (d: DayDoc) => void): DayDoc {
  const d = clone(S.days[key] || emptyDay(key));
  fn(d);
  d.date = key; d.updatedAt = Date.now();
  const c = cleanDay(d, key) || emptyDay(key);
  c.updatedAt = d.updatedAt;
  changed({ days: { ...S.days, [key]: c } });
  queueDay(key);
  return c;
}
function findItem<K extends ItemKind>(kind: K, id: string): { kind: K; key: string; item: ItemOf<K> } | null {
  for (const k in S.days) { const it = (S.days[k][kind] as ItemOf<K>[]).find(x => x.id === id); if (it) return { kind, key: k, item: it }; }
  return null;
}
type Undo = () => void;

export const store = {
  getState,
  /** true when onboarding has collected everything BMR + plan need */
  profileComplete(p?: Profile | null): boolean {
    const x = p === undefined ? S.profile : p;
    return !!(x && (x.sex === 'male' || x.sex === 'female') && isFinite(x.birthYear as number) && isFinite(x.heightCm as number) && isFinite(x.startKg as number) && isFinite(x.goalKg as number));
  },
  /** shallow-merge patch into profile; creates it if missing */
  setProfile(patch: Partial<Profile>): Profile {
    const now = Date.now();
    const base: Partial<Profile> = S.profile || { createdAt: now, celebrated: [], unit: 'lb', theme: 'system', stepGoal: 8000 };
    const p = cleanProfile({ ...base, ...patch, updatedAt: now }) as Profile;
    changed({ profile: p });
    queueProfile();
    return p;
  },
  /** day doc (empty template if none). Read-only. */
  getDay(key: string): DayDoc { return S.days[key] || emptyDay(key); },
  /** ascending keys that have any data */
  dayKeys(): string[] { return Object.keys(S.days).filter(k => !dayIsEmpty(S.days[k])).sort(); },
  /** low-level atomic edit: fn mutates a clone */
  updateDay: updateDayInternal,
  /** add an item; day derived from item.t; id auto. Returns stored item. Throws on invalid input. */
  addItem<K extends ItemKind>(kind: K, item: Partial<ItemOf<K>>): ItemOf<K> {
    const c = (CLEAN[kind] as (x: unknown) => ItemOf<K> | null)({ ...item, id: item.id || newId() });
    if (!c) throw new Error('Invalid ' + kind + ' item');
    updateDayInternal(C.keyOf(c.t), d => { (d[kind] as ItemOf<K>[]).push(c); (d[kind] as ItemOf<K>[]).sort((a, b) => a.t - b.t); });
    return c;
  },
  findItem,
  /** patch an item (moves days if t changes day) */
  updateItem<K extends ItemKind>(kind: K, id: string, patch: Partial<ItemOf<K>>): ItemOf<K> {
    const f = findItem(kind, id);
    if (!f) return store.addItem(kind, { ...patch, id } as Partial<ItemOf<K>>);
    const next = (CLEAN[kind] as (x: unknown) => ItemOf<K> | null)({ ...f.item, ...patch, id });
    if (!next) throw new Error('Invalid ' + kind + ' item');
    const nk = C.keyOf(next.t);
    if (nk === f.key) updateDayInternal(nk, d => { const arr = d[kind] as ItemOf<K>[]; const i = arr.findIndex(x => x.id === id); arr[i] = next; arr.sort((a, b) => a.t - b.t); });
    else {
      updateDayInternal(f.key, d => { (d[kind] as ItemOf<K>[]) = (d[kind] as ItemOf<K>[]).filter(x => x.id !== id) as never; });
      updateDayInternal(nk, d => { (d[kind] as ItemOf<K>[]).push(next); (d[kind] as ItemOf<K>[]).sort((a, b) => a.t - b.t); });
    }
    return next;
  },
  /** delete an item → undo() (null if not found). Photos are kept so undo restores them. */
  removeItem(kind: ItemKind, id: string): Undo | null {
    const f = findItem(kind, id);
    if (!f) return null;
    const copy = clone(f.item);
    updateDayInternal(f.key, d => { (d as unknown as Record<string, { id: string }[]>)[kind] = (d[kind] as { id: string }[]).filter(x => x.id !== id); });
    return () => { store.addItem(kind, copy as never); };
  },
  /** replace a day's activity (null clears) → undo() */
  setActivity(key: string, activity: Partial<Activity> | null): Undo {
    const prev = clone(store.getDay(key).activity);
    updateDayInternal(key, d => { d.activity = activity ? ({ ...activity, syncedAt: activity.syncedAt || Date.now() } as Activity) : null; });
    return () => { updateDayInternal(key, d => { d.activity = prev; }); };
  },
  /** bulk activity import ({key: activity}); merge keeps existing fields. One change. Returns count. */
  setActivityBulk(map: Record<string, Partial<Activity>>, opts?: { merge?: boolean }): number {
    const keys = Object.keys(map || {}).filter(C.isValidKey);
    if (!keys.length) return 0;
    const now = Date.now(), days = { ...S.days };
    keys.forEach(k => {
      const d = clone(days[k] || emptyDay(k));
      const merged = opts?.merge && d.activity ? { ...d.activity, ...map[k] } : map[k];
      d.activity = cleanActivity(merged); d.updatedAt = now;
      const c = cleanDay(d, k)!; c.updatedAt = now; days[k] = c;
    });
    changed({ days }); keys.forEach(queueDay);
    return keys.length;
  },
  /** bulk add (CSV, Samsung, Health Connect). Dedupes by id. Returns number of days touched. */
  addItemsBulk<K extends ItemKind>(kind: K, items: Partial<ItemOf<K>>[]): number {
    const now = Date.now(), days = { ...S.days }, touched = new Set<string>();
    items.forEach(it => {
      const c = (CLEAN[kind] as (x: unknown) => ItemOf<K> | null)({ ...it, id: it.id || newId() }); if (!c) return;
      const k = C.keyOf(c.t);
      const d = touched.has(k) ? days[k] : clone(days[k] || emptyDay(k));
      const arr = d[kind] as ItemOf<K>[];
      if (arr.some(x => x.id === c.id)) return;
      arr.push(c); arr.sort((a, b) => a.t - b.t); d.updatedAt = now; days[k] = d; touched.add(k);
    });
    const ks = Array.from(touched);
    if (ks.length) { changed({ days }); ks.forEach(queueDay); }
    return ks.length;
  },
  /** tick/untick a Today-plan task for a day */
  setPlanTick(key: string, id: string, on: boolean): void { updateDayInternal(key, d => { d.planTicks = { ...(d.planTicks || {}), [id]: on }; }); },
  /** replace many days at once (seed / JSON import). Merges per day by default. */
  importDays(input: Record<string, unknown>, opts?: { replace?: boolean }): number {
    const now = Date.now(), days = opts?.replace ? {} : { ...S.days };
    const keys: string[] = [];
    Object.keys(input || {}).forEach(k => { const c = cleanDay(input[k], k); if (c) { c.updatedAt = now; days[k] = c; keys.push(k); } });
    if (opts?.replace) Object.keys(S.days).filter(k => !days[k]).forEach(k => { const r = dayRef(k); if (r) deleteDoc(r).catch(() => {}); });
    changed({ days }); keys.forEach(queueDay);
    return keys.length;
  },
  allWeights(): WeightEntry[] { return Object.keys(S.days).sort().flatMap(k => S.days[k].weights).sort((a, b) => a.t - b.t); },
  allFoods(): FoodEntry[] { return Object.keys(S.days).sort().flatMap(k => S.days[k].foods).sort((a, b) => a.t - b.t); },
  allWorkouts(): WorkoutEntry[] { return Object.keys(S.days).sort().flatMap(k => S.days[k].workouts).sort((a, b) => a.t - b.t); },
  /** distinct recent foods by name, newest first (one-tap re-add) */
  recentFoods(limit = 12): FoodEntry[] {
    const seen = new Set<string>(), out: FoodEntry[] = [];
    store.allFoods().reverse().forEach(f => { const n = f.name.toLowerCase().trim(); if (!seen.has(n)) { seen.add(n); out.push(f); } });
    return out.slice(0, limit);
  },
  /** wipe local + cloud data for this user */
  async resetAll(): Promise<void> {
    const keys = Object.keys(S.days);
    pendingDays.forEach(t => clearTimeout(t)); pendingDays.clear();
    if (profileTimer) clearTimeout(profileTimer);
    resetting = true;
    changed({ profile: null, days: {} });
    try {
      if (db && S.uid) {
        const snap = await getDocs(collection(db, 'users', S.uid, 'days'));
        const ids = new Set(keys.concat(snap.docs.map(d => d.id)));
        await Promise.all(Array.from(ids).map(id => deleteDoc(doc(db!, 'users', S.uid!, 'days', id)).catch(() => {})));
        await deleteDoc(doc(db, 'users', S.uid));
      }
    } catch (e) { syncError(e); }
    resetting = false;
    syncedDays = [];
    changed({ profile: null, days: {} });
  },
  exportJSON(): string { return JSON.stringify({ app: 'momentum', v: 2, exportedAt: new Date().toISOString(), profile: S.profile, days: S.days }, null, 1); },
};

/* ================= derived data (memoized per data version + minute) ================= */
let memo: Record<string, unknown> = {}, memoV = -1, memoMin = -1;
function cached<T>(k: string, fn: () => T): T {
  const min = Math.floor(Date.now() / 60000);
  if (memoV !== S.v || memoMin !== min) { memo = {}; memoV = S.v; memoMin = min; }
  if (!(k in memo)) memo[k] = fn();
  return memo[k] as T;
}
export const derived = {
  currentKg: () => cached('kg', () => C.currentKg(S.profile, S.days)),
  balance: (key?: string) => cached('bal:' + (key || C.keyOf(Date.now())), () => C.balance(S.profile, S.days, key || C.keyOf(Date.now()), Date.now())),
  plan: () => cached('plan', () => derived.balance().plan),
  analysis: () => cached('wa', () => C.weightAnalysis(S.profile, S.days, Date.now())),
  deficits: (n = 7) => cached('da:' + n, () => C.deficitAnalysis(S.profile, S.days, Date.now(), n)),
  headlines: () => cached('hl', () => C.headlines(S.profile, S.days, Date.now())),
  todayActions: (key?: string) => cached('ta:' + (key || ''), () => C.todayActions(derived.balance(key))),
  bmr: () => cached('bmr', () => C.bmrFor(S.profile, derived.currentKg(), Date.now())),
};

/* ================= hooks ================= */
/** whole store state (re-renders on any change) */
export const useStore = () => useSyncExternalStore(subscribe, getState, getState);
function useSelect<T>(sel: (s: StoreState) => T): T {
  return useSyncExternalStore(subscribe, () => sel(S), () => sel(S));
}
/** re-render every minute (for "so far" numbers, day rollover) */
export function useMinute(): number {
  const [m, setM] = useState(() => Math.floor(Date.now() / 60000));
  useEffect(() => { const id = setInterval(() => setM(Math.floor(Date.now() / 60000)), 15000); return () => clearInterval(id); }, []);
  return m;
}
/** today's local key, updates at midnight */
export function useToday(): string { useMinute(); return C.keyOf(Date.now()); }
export const useProfile = () => useSelect(s => s.profile);
export const useReady = () => useSelect(s => s.ready);
export const useSync = () => useSelect(s => s.sync);
export const useUnits = (): Units => { const unit = useSelect(s => s.profile?.unit || 'lb'); return makeUnits(unit); };
const emptyCache = new Map<string, DayDoc>();
/** one day doc (stable empty template when none) */
export function useDay(key: string): DayDoc {
  return useSelect(s => s.days[key] || (emptyCache.get(key) ?? (emptyCache.set(key, emptyDay(key)), emptyCache.get(key)!)));
}
/** all days map */
export const useDays = () => useSelect(s => s.days);
/** data version (use as a memo dependency) */
export const useVersion = () => useSelect(s => s.v);
/** days in [from, to] inclusive, ascending (missing days → empty docs) */
export function useDayRange(from: string, to: string): DayDoc[] {
  const days = useDays();
  const [cache] = useState(() => ({ k: '', v: [] as DayDoc[] }));
  const k = from + to + S.v;
  if (cache.k !== k) {
    const out: DayDoc[] = [];
    for (let d = from, g = 0; d <= to && g < 3700; d = C.addDays(d, 1), g++) out.push(days[d] || emptyDay(d));
    cache.k = k; cache.v = out;
  }
  return cache.v;
}
export function useBalance(key?: string) { useVersion(); useMinute(); return derived.balance(key); }
export function useAnalysis() { useVersion(); useMinute(); return derived.analysis(); }
export function useDeficits(n = 7) { useVersion(); useMinute(); return derived.deficits(n); }
export function useHeadlines() { useVersion(); useMinute(); return derived.headlines(); }
export function usePlan() { useVersion(); useMinute(); return derived.plan(); }
export function useTodayActions(key?: string) { useVersion(); useMinute(); return derived.todayActions(key); }
export function useCurrentKg() { useVersion(); return derived.currentKg(); }
