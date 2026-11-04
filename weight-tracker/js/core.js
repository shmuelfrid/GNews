/* Momentum v2 — core: namespace, utilities, units, event bus, state + store (owner: foundation). */
(function () {
  'use strict';
  const M = window.M = window.M || {};
  M.views = M.views || {};
  M.sheets = M.sheets || {};

  /* ================= utilities ================= */
  const DAY = 864e5;
  const pad2 = n => String(n).padStart(2, '0');
  const U = M.util = {
    DAY,
    pad2,
    keyOf(t) { const d = new Date(t); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); },
    fromKey(k) { const p = String(k).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); },
    addDays(k, n) { const d = U.fromKey(k); d.setDate(d.getDate() + n); return U.keyOf(d); },
    diffDays(a, b) { return Math.round((U.fromKey(b) - U.fromKey(a)) / DAY); },
    todayKey() { return U.keyOf(Date.now()); },
    weekStartKey(k) { const d = U.fromKey(k); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return U.keyOf(d); },
    isValidKey(k) { return /^\d{4}-\d{2}-\d{2}$/.test(k || '') && !isNaN(U.fromKey(k)); },
    /** ms timestamp for a day key + "HH:MM" (local) */
    timeOn(k, hhmm) { const d = U.fromKey(k); const p = String(hhmm || '12:00').split(':').map(Number); d.setHours(p[0] || 0, p[1] || 0, 0, 0); return d.getTime(); },
    hhmm(t) { const d = new Date(t); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); },
    fmtDate(k, o) { return U.fromKey(k).toLocaleDateString('en-US', o || { month: 'short', day: 'numeric' }); },
    fmtDateY(k) { const same = U.fromKey(k).getFullYear() === new Date().getFullYear(); return U.fmtDate(k, same ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' }); },
    fmtDateLong(k) { return U.fmtDate(k, { weekday: 'long', month: 'long', day: 'numeric' }); },
    fmtTime(t) { return new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); },
    relDay(k) { const t = U.todayKey(); if (k === t) return 'Today'; if (k === U.addDays(t, -1)) return 'Yesterday'; if (k === U.addDays(t, 1)) return 'Tomorrow'; return U.fmtDate(k, { weekday: 'short', month: 'short', day: 'numeric' }); },
    uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); },
    esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
    clamp(v, a, b) { return Math.max(a, Math.min(b, v)); },
    mean(a) { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN; },
    sum(a) { return a.reduce((s, v) => s + (isFinite(v) ? v : 0), 0); },
    parseNum(s) {
      if (typeof s === 'number') return isFinite(s) ? s : NaN;
      let t = String(s == null ? '' : s).trim();
      t = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
      const v = parseFloat(t); return isFinite(v) ? v : NaN;
    },
    plural(n, w, ws) { return n + ' ' + (n === 1 ? w : (ws || w + 's')); },
    /** 1420 -> "1,420" ; never NaN (returns "–") */
    int(n) { return isFinite(n) ? Math.round(n).toLocaleString('en-US') : '–'; },
    fixed(n, d) { return isFinite(n) ? Number(n).toFixed(d == null ? 1 : d) : '–'; },
    signedInt(n) { if (!isFinite(n)) return '–'; const r = Math.round(n); return (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r).toLocaleString('en-US'); },
    kcal(n) { return U.int(n) + ' kcal'; },
    pct(x) { return isFinite(x) ? Math.round(x * 100) + '%' : '–'; },
    minutes(m) { if (!isFinite(m)) return '–'; m = Math.round(m); if (m < 60) return m + ' min'; const h = Math.floor(m / 60), r = m % 60; return h + ' h' + (r ? ' ' + r + ' min' : ''); },
    greeting(now) { const h = new Date(now || Date.now()).getHours(); return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; },
    mealForTime(t) { const h = new Date(t).getHours(); return h >= 4 && h < 11 ? 'breakfast' : h >= 11 && h < 15 ? 'lunch' : h >= 17 && h < 22 ? 'dinner' : 'snacks'; },
    debounce(fn, ms) { let t; return function () { const a = arguments, self = this; clearTimeout(t); t = setTimeout(() => fn.apply(self, a), ms); }; },
    reduceMotion() { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } },
    clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  };
  M.MEALS = [
    { id: 'breakfast', label: 'Breakfast' }, { id: 'lunch', label: 'Lunch' },
    { id: 'dinner', label: 'Dinner' }, { id: 'snacks', label: 'Snacks' }
  ];
  M.WEIGH_TAGS = ['Morning', 'After workout', 'Before bed', 'After meal'];

  /* ================= units (canonical: kg, kcal, cm, km) ================= */
  const LB = 0.45359237, KM_MI = 1.609344;
  const units = M.units = {
    LB,
    get unit() { return (M.state.profile && M.state.profile.unit) || 'lb'; },
    /** kg -> display number in current (or given) unit */
    to(kg, unit) { return (unit || units.unit) === 'lb' ? kg / LB : kg; },
    /** display number -> kg */
    from(v, unit) { return (unit || units.unit) === 'lb' ? v * LB : v; },
    /** "193.6" */
    n(kg, d) { return isFinite(kg) ? units.to(kg).toFixed(d == null ? 1 : d) : '–'; },
    /** "193.6 lb" */
    w(kg, d) { return units.n(kg, d) + ' ' + units.unit; },
    /** abs delta "4.6" */
    abs(kgDelta, d) { return isFinite(kgDelta) ? Math.abs(units.to(kgDelta)).toFixed(d == null ? 1 : d) : '–'; },
    /** signed delta with true minus "−4.6" / "+0.4" / "0.0" */
    signed(kgDelta, d) { if (!isFinite(kgDelta)) return '–'; const dd = d == null ? 1 : d; const v = units.to(kgDelta); const r = Math.abs(v) < 0.5 * Math.pow(10, -dd) ? 0 : v; return (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r).toFixed(dd); },
    /** distance: km canonical; shows mi when unit is lb */
    dist(km) { if (!isFinite(km)) return '–'; return units.unit === 'lb' ? (km / KM_MI).toFixed(1) + ' mi' : km.toFixed(1) + ' km'; },
    distUnit() { return units.unit === 'lb' ? 'mi' : 'km'; },
    distTo(km) { return units.unit === 'lb' ? km / KM_MI : km; },
    distFrom(v) { return units.unit === 'lb' ? v * KM_MI : v; },
    cmToFtIn(cm) { const tin = cm / 2.54; let ft = Math.floor(tin / 12), inch = Math.round(tin - ft * 12); if (inch === 12) { ft++; inch = 0; } return { ft, inch }; },
    ftInToCm(ft, inch) { return ((+ft || 0) * 12 + (+inch || 0)) * 2.54; },
    height(cm) { if (!isFinite(cm)) return '–'; if (units.unit === 'lb') { const f = units.cmToFtIn(cm); return f.ft + '′ ' + f.inch + '″'; } return Math.round(cm) + ' cm'; }
  };

  /* ================= event bus ================= */
  const listeners = {};
  M.on = function (ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); return () => M.off(ev, fn); };
  M.off = function (ev, fn) { const l = listeners[ev]; if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } };
  M.emit = function (ev, data) { (listeners[ev] || []).slice().forEach(fn => { try { fn(data); } catch (e) { console.error('[M.emit ' + ev + ']', e); } }); };

  /* ================= state ================= */
  const KEY = 'momentum.v2', KEY_V1 = 'momentum.v1', THEME_KEY = 'momentum.theme';
  M.state = {
    profile: null,       // see CONTRACT.md
    days: {},            // { 'YYYY-MM-DD': DayDoc }
    v: 0,                // bumps on every change (cache key for derived data)
    sync: 'local',       // 'local' | 'connecting' | 'cloud' | 'error'
    syncedDays: [],      // keys known to exist remotely (used to detect remote deletes)
    migratedV1: false
  };
  const S = M.state;

  const KINDS = ['weights', 'foods', 'workouts'];
  const num = (v, lo, hi) => { v = +v; return isFinite(v) && v >= lo && v <= hi ? v : null; };
  const str = (v, n) => String(v == null ? '' : v).slice(0, n || 200);

  function emptyDay(key) { return { date: key, weights: [], foods: [], workouts: [], activity: null, updatedAt: 0 }; }

  function cleanWeight(e) {
    const kg = num(e.kg, 10, 500), t = num(e.t, 0, 1e14);
    if (kg == null || t == null) return null;
    return { id: str(e.id || U.uid(), 40), kg, t, tags: Array.isArray(e.tags) ? e.tags.slice(0, 8).map(x => str(x, 40)) : [], note: str(e.note, 280) };
  }
  function cleanFood(e) {
    const t = num(e.t, 0, 1e14);
    if (t == null) return null;
    const items = Array.isArray(e.items) ? e.items.slice(0, 30).map(it => ({ name: str(it.name, 120), portion: str(it.portion, 80), kcal: num(it.kcal, 0, 20000) || 0 })) : [];
    let kcal = num(e.kcal, 0, 30000);
    if (kcal == null) kcal = items.reduce((s, it) => s + it.kcal, 0);
    const o = {
      id: str(e.id || U.uid(), 40), t, meal: ['breakfast', 'lunch', 'dinner', 'snacks'].includes(e.meal) ? e.meal : U.mealForTime(t),
      name: str(e.name || (items[0] && items[0].name) || 'Food', 160), kcal: Math.round(kcal), items,
      source: ['photo', 'text', 'manual'].includes(e.source) ? e.source : 'manual'
    };
    ['protein', 'carbs', 'fat'].forEach(k => { const v = num(e[k], 0, 3000); if (v != null) o[k] = Math.round(v * 10) / 10; });
    if (typeof e.thumb === 'string' && e.thumb.startsWith('data:image/') && e.thumb.length < 24000) o.thumb = e.thumb;
    if (e.note) o.note = str(e.note, 280);
    return o;
  }
  function cleanWorkout(e) {
    const t = num(e.t, 0, 1e14);
    if (t == null) return null;
    const o = {
      id: str(e.id || U.uid(), 40), t, type: str(e.type || 'other', 40), minutes: num(e.minutes, 0, 1440) || 0,
      kcal: Math.round(num(e.kcal, 0, 10000) || 0), source: ['photo', 'manual', 'samsung-export'].includes(e.source) ? e.source : 'manual',
      countedInSamsung: !!e.countedInSamsung
    };
    if (e.name) o.name = str(e.name, 80);
    const dk = num(e.distanceKm, 0, 1000); if (dk != null) o.distanceKm = dk;
    const hr = num(e.avgHr, 30, 250); if (hr != null) o.avgHr = Math.round(hr);
    if (e.note) o.note = str(e.note, 280);
    if (e.thumb && typeof e.thumb === 'string' && e.thumb.startsWith('data:image/') && e.thumb.length < 24000) o.thumb = e.thumb;
    return o;
  }
  function cleanActivity(a) {
    if (!a || typeof a !== 'object') return null;
    const o = {};
    const steps = num(a.steps, 0, 200000); if (steps != null) o.steps = Math.round(steps);
    const ak = num(a.activeKcal, 0, 15000); if (ak != null) o.activeKcal = Math.round(ak);
    const tk = num(a.totalKcal, 0, 20000); if (tk != null) o.totalKcal = Math.round(tk);
    const am = num(a.activeMinutes, 0, 1440); if (am != null) o.activeMinutes = Math.round(am);
    const dk = num(a.distanceKm, 0, 1000); if (dk != null) o.distanceKm = Math.round(dk * 100) / 100;
    if (!Object.keys(o).length) return null;
    o.source = ['samsung-screenshot', 'samsung-export', 'manual'].includes(a.source) ? a.source : 'manual';
    o.syncedAt = num(a.syncedAt, 0, 1e14) || Date.now();
    return o;
  }
  const CLEAN = { weights: cleanWeight, foods: cleanFood, workouts: cleanWorkout };

  function cleanDay(d, key) {
    if (!d || typeof d !== 'object') return null;
    key = key || d.date;
    if (!U.isValidKey(key)) return null;
    const o = emptyDay(key);
    KINDS.forEach(k => { o[k] = Array.isArray(d[k]) ? d[k].map(CLEAN[k]).filter(Boolean) : []; });
    o.activity = cleanActivity(d.activity);
    o.updatedAt = +d.updatedAt || 0;
    return o;
  }
  const PROFILE_KEYS = ['name', 'sex', 'birthYear', 'heightCm', 'unit', 'theme', 'startKg', 'startDate', 'goalKg', 'targetDate',
    'paceKgPerWeek', 'stepGoal', 'activityBaseline', 'waistCm', 'createdAt', 'updatedAt', 'celebrated', 'migratedV1', 'migratedV1Remote', 'v'];
  function cleanProfile(p) {
    if (!p || typeof p !== 'object') return null;
    const o = {};
    PROFILE_KEYS.forEach(k => { if (p[k] !== undefined && p[k] !== null) o[k] = p[k]; });
    if (o.paceKgPerWeek == null && isFinite(p.paceKg)) o.paceKgPerWeek = +p.paceKg; // v1 field
    if (!Array.isArray(o.celebrated)) o.celebrated = [];
    o.unit = o.unit === 'kg' ? 'kg' : 'lb';
    o.v = 2;
    return o;
  }
  const dayIsEmpty = d => !d || (!d.weights.length && !d.foods.length && !d.workouts.length && !d.activity);

  /* ================= store ================= */
  const store = M.store = {
    remote: null,
    _pendingDays: new Map(),   // key -> timer
    _inflight: new Set(),      // keys being written
    _profileTimer: null,
    _firstDaysSnap: true,
    _resetting: false,

    /* ---- load / persist ---- */
    load() {
      let loaded = false;
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
          const d = JSON.parse(raw);
          if (d && typeof d === 'object') {
            S.profile = cleanProfile(d.profile);
            S.days = {};
            Object.keys(d.days || {}).forEach(k => { const c = cleanDay(d.days[k], k); if (c) S.days[k] = c; });
            S.syncedDays = Array.isArray(d.syncedDays) ? d.syncedDays : [];
            S.migratedV1 = !!d.migratedV1;
            loaded = true;
          }
        }
      } catch (e) { console.warn('load failed', e); }
      if (!S.migratedV1) {
        try {
          const raw1 = localStorage.getItem(KEY_V1);
          if (raw1) {
            const d1 = JSON.parse(raw1);
            if (d1 && typeof d1 === 'object') {
              if (!S.profile && d1.profile) S.profile = cleanProfile(Object.assign({}, d1.profile));
              const n = store._foldV1Entries(Array.isArray(d1.entries) ? d1.entries : []);
              if (n || d1.profile) loaded = true;
            }
          }
        } catch (e) { console.warn('v1 migrate failed', e); }
        S.migratedV1 = true;
        if (S.profile) S.profile.migratedV1 = true;
        store.saveLocal();
      }
      S.v++;
      return loaded;
    },
    /** fold v1 {id,kg,t,tags,note} entries into day docs (dedupe by id). Returns count added. */
    _foldV1Entries(entries) {
      let n = 0; const touched = new Set();
      entries.forEach(e => {
        const w = cleanWeight(e || {}); if (!w) return;
        const k = U.keyOf(w.t);
        const d = S.days[k] || (S.days[k] = emptyDay(k));
        if (d.weights.some(x => x.id === w.id)) return;
        d.weights.push(w); touched.add(k); n++;
      });
      touched.forEach(k => { S.days[k].weights.sort((a, b) => a.t - b.t); S.days[k].updatedAt = Date.now(); });
      return n ? Array.from(touched) : 0;
    },
    saveLocal() {
      try { localStorage.setItem(KEY, JSON.stringify({ v: 2, profile: S.profile, days: S.days, syncedDays: S.syncedDays, migratedV1: S.migratedV1 })); }
      catch (e) { if (!store._warnedLocal) { store._warnedLocal = true; M.emit('storage-error', e); } }
    },
    _changed(keys) { S.v++; store.saveLocal(); M.emit('change', { keys: keys || [], v: S.v }); },

    /* ---- profile ---- */
    getProfile() { return S.profile; },
    /** true when onboarding has collected everything BMR + plan need */
    profileComplete(p) {
      p = p || S.profile;
      return !!(p && (p.sex === 'male' || p.sex === 'female') && isFinite(p.birthYear) && isFinite(p.heightCm) && isFinite(p.startKg) && isFinite(p.goalKg));
    },
    /** shallow-merge patch into profile; creates it if missing */
    setProfile(patch) {
      const now = Date.now();
      const base = S.profile || { createdAt: now, celebrated: [], unit: 'lb', theme: 'system', stepGoal: 8000 };
      S.profile = cleanProfile(Object.assign({}, base, patch, { updatedAt: now }));
      if (patch && patch.theme) store.applyTheme(patch.theme);
      store._changed(['profile']);
      store._queueProfile();
      return S.profile;
    },

    /* ---- days ---- */
    /** Day doc for key (a frozen-ish empty template if none). Never mutate the result; use updateDay. */
    getDay(key) { return S.days[key] || emptyDay(key); },
    hasDay(key) { return !!S.days[key]; },
    /** sorted ascending list of keys that have any data */
    dayKeys() { return Object.keys(S.days).filter(k => !dayIsEmpty(S.days[k])).sort(); },
    /** mutate a day atomically: fn(dayClone) -> may return nothing. Writes through. */
    updateDay(key, fn) {
      const d = U.clone(S.days[key] || emptyDay(key));
      fn(d);
      d.date = key; d.updatedAt = Date.now();
      S.days[key] = cleanDay(d, key) || emptyDay(key);
      S.days[key].updatedAt = d.updatedAt;
      store._changed([key]);
      store._queueDay(key);
      return S.days[key];
    },

    /* ---- items (weights | foods | workouts) ---- */
    /** add a new item; day is derived from item.t. Returns the stored item. */
    addItem(kind, item) {
      const c = CLEAN[kind](Object.assign({}, item, { id: item.id || U.uid() }));
      if (!c) throw new Error('Invalid ' + kind + ' item');
      const k = U.keyOf(c.t);
      store.updateDay(k, d => { d[kind].push(c); d[kind].sort((a, b) => a.t - b.t); });
      return c;
    },
    /** find an item by id -> {kind, key, item} | null */
    findItem(kind, id) {
      for (const k in S.days) { const it = S.days[k][kind].find(x => x.id === id); if (it) return { kind, key: k, item: it }; }
      return null;
    },
    /** patch an item (moves it to another day if t changes day). Returns the new item. */
    updateItem(kind, id, patch) {
      const f = store.findItem(kind, id);
      if (!f) return store.addItem(kind, Object.assign({ id }, patch));
      const next = CLEAN[kind](Object.assign({}, f.item, patch, { id }));
      if (!next) throw new Error('Invalid ' + kind + ' item');
      const nk = U.keyOf(next.t);
      if (nk === f.key) store.updateDay(nk, d => { const i = d[kind].findIndex(x => x.id === id); d[kind][i] = next; d[kind].sort((a, b) => a.t - b.t); });
      else {
        store.updateDay(f.key, d => { d[kind] = d[kind].filter(x => x.id !== id); });
        store.updateDay(nk, d => { d[kind].push(next); d[kind].sort((a, b) => a.t - b.t); });
      }
      return next;
    },
    /** delete an item. Returns an undo() function (or null if not found). */
    removeItem(kind, id) {
      const f = store.findItem(kind, id);
      if (!f) return null;
      const copy = U.clone(f.item);
      store.updateDay(f.key, d => { d[kind] = d[kind].filter(x => x.id !== id); });
      return () => store.addItem(kind, copy);
    },
    /** merge activity for a day (null clears it). Returns undo(). */
    setActivity(key, activity) {
      const prev = U.clone(store.getDay(key).activity);
      store.updateDay(key, d => { d.activity = activity ? Object.assign({}, activity, { syncedAt: activity.syncedAt || Date.now() }) : null; });
      return () => store.updateDay(key, d => { d.activity = prev; });
    },
    /** bulk import of activity for many days ({key: activity}); one change event. */
    setActivityBulk(map, opts) {
      const keys = Object.keys(map || {}).filter(U.isValidKey);
      const now = Date.now();
      keys.forEach(k => {
        const d = U.clone(S.days[k] || emptyDay(k));
        const merged = opts && opts.merge && d.activity ? Object.assign({}, d.activity, map[k]) : map[k];
        d.activity = cleanActivity(merged); d.updatedAt = now;
        S.days[k] = cleanDay(d, k); S.days[k].updatedAt = now;
      });
      if (keys.length) { store._changed(keys); keys.forEach(k => store._queueDay(k)); }
      return keys.length;
    },
    /** bulk add items (e.g. CSV import, Samsung workouts). Dedupe by id. One change event. */
    addItemsBulk(kind, items) {
      const now = Date.now(), keys = new Set();
      items.forEach(it => {
        const c = CLEAN[kind](Object.assign({}, it, { id: it.id || U.uid() })); if (!c) return;
        const k = U.keyOf(c.t);
        const d = S.days[k] || (S.days[k] = emptyDay(k));
        if (d[kind].some(x => x.id === c.id)) return;
        d[kind].push(c); d[kind].sort((a, b) => a.t - b.t); d.updatedAt = now; keys.add(k);
      });
      const ks = Array.from(keys);
      if (ks.length) { store._changed(ks); ks.forEach(k => store._queueDay(k)); }
      return ks.length;
    },

    /* ---- flattened reads ---- */
    allWeights() { const out = []; Object.keys(S.days).sort().forEach(k => S.days[k].weights.forEach(w => out.push(w))); return out.sort((a, b) => a.t - b.t); },
    allFoods() { const out = []; Object.keys(S.days).sort().forEach(k => S.days[k].foods.forEach(w => out.push(w))); return out.sort((a, b) => a.t - b.t); },
    allWorkouts() { const out = []; Object.keys(S.days).sort().forEach(k => S.days[k].workouts.forEach(w => out.push(w))); return out.sort((a, b) => a.t - b.t); },
    /** distinct recent foods (by lowercased name), newest first */
    recentFoods(limit) {
      const seen = new Set(), out = [];
      store.allFoods().reverse().forEach(f => { const n = f.name.toLowerCase().trim(); if (!seen.has(n)) { seen.add(n); out.push(f); } });
      return out.slice(0, limit || 12);
    },

    /* ---- reset / export ---- */
    async resetAll() {
      const keys = Object.keys(S.days);
      S.profile = null; S.days = {}; S.syncedDays = [];
      store._pendingDays.forEach(t => clearTimeout(t)); store._pendingDays.clear();
      clearTimeout(store._profileTimer);
      store._changed(['profile']);
      if (store.remote) {
        store._resetting = true;
        try {
          const snap = await store.remote.days.get();
          const ids = new Set(keys.concat(snap.docs.map(d => d.id)));
          await Promise.all(Array.from(ids).map(id => store.remote.days.doc(id).delete().catch(() => {})));
          await store.remote.profileRef.delete();
        } catch (e) { store._syncError(e); }
        store._resetting = false;
        S.profile = null; S.days = {}; store._changed(['profile']);
      }
    },
    exportJSON() { return JSON.stringify({ app: 'momentum', v: 2, exportedAt: new Date().toISOString(), profile: S.profile, days: S.days }, null, 1); },

    /* ---- theme ---- */
    theme() { return (S.profile && S.profile.theme) || (function () { try { return localStorage.getItem(THEME_KEY) || 'system'; } catch (e) { return 'system'; } })(); },
    applyTheme(t) {
      t = t || store.theme();
      const root = document.documentElement;
      if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t); else root.removeAttribute('data-theme');
      try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
      const dark = t === 'dark' || (t !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', dark ? '#0E1018' : '#F6F7F9');
    },

    /* ================= cloud sync (db + user capabilities) ================= */
    async connect() {
      try {
        const c = window.claude;
        if (!c || typeof c.use !== 'function') return false;
        S.sync = 'connecting';
        const [db, user] = await Promise.all([c.use('db').catch(() => null), c.use('user').catch(() => null)]);
        if (!db || !user) { S.sync = 'local'; M.emit('sync', S.sync); return false; }
        const id = await user.id().catch(() => null);
        if (!id) { S.sync = 'local'; M.emit('sync', S.sync); return false; }
        const profileRef = db.doc('data/users/' + id + '/profile');
        const days = profileRef.collection('days');
        store.remote = { db, profileRef, days, legacy: profileRef.collection('entries') };
        profileRef.onSnapshot(s => store._onProfileSnap(s), e => store._syncError(e));
        days.onSnapshot(s => store._onDaysSnap(s), e => store._syncError(e));
        S.sync = 'cloud'; M.emit('sync', S.sync);
        return true;
      } catch (e) { store.remote = null; S.sync = 'local'; M.emit('sync', S.sync); return false; }
    },
    _queueProfile() {
      if (!store.remote) return;
      clearTimeout(store._profileTimer);
      store._profileTimer = setTimeout(() => {
        store._profileTimer = null;
        if (S.profile) store.remote.profileRef.set(cleanProfile(S.profile)).catch(e => store._syncError(e));
      }, 400);
    },
    _queueDay(key) {
      if (!store.remote) return;
      clearTimeout(store._pendingDays.get(key));
      store._pendingDays.set(key, setTimeout(() => store._flushDay(key), 600));
    },
    _flushDay(key) {
      store._pendingDays.delete(key);
      if (!store.remote) return;
      const d = S.days[key];
      if (!d) return;
      store._inflight.add(key);
      store.remote.days.doc(key).set(JSON.parse(JSON.stringify(d)))
        .then(() => { if (!S.syncedDays.includes(key)) S.syncedDays.push(key); })
        .catch(e => store._syncError(e))
        .finally(() => store._inflight.delete(key));
    },
    _busy(key) { return store._pendingDays.has(key) || store._inflight.has(key); },
    _onProfileSnap(snap) {
      if (store._resetting) return;
      if (snap.exists) {
        const rp = snap.data() || {};
        const lp = S.profile;
        if (!lp || (+rp.updatedAt || 0) > (+lp.updatedAt || 0)) {
          const merged = cleanProfile(Object.assign({}, lp || {}, rp));
          if (JSON.stringify(merged) !== JSON.stringify(lp)) {
            S.profile = merged; if (merged.theme) store.applyTheme(merged.theme); store._changed(['profile']);
          }
        } else if ((+rp.updatedAt || 0) < (+lp.updatedAt || 0) && !store._profileTimer) {
          store.remote.profileRef.set(cleanProfile(lp)).catch(e => store._syncError(e));
        }
        if (!rp.migratedV1Remote && !(S.profile && S.profile.migratedV1Remote)) store._migrateRemoteV1(rp);
      } else if (S.profile && !snap.metadata.hasPendingWrites && !store._profileTimer) {
        store.remote.profileRef.set(cleanProfile(S.profile)).catch(e => store._syncError(e));
      }
    },
    async _migrateRemoteV1(rp) {
      if (store._migratingV1 || (rp && rp.migratedV1Remote)) return;
      store._migratingV1 = true;
      try {
        const snap = await store.remote.legacy.get();
        const entries = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
        const touched = entries.length ? store._foldV1Entries(entries) : 0;
        if (touched && touched.length) { store._changed(touched); touched.forEach(k => store._queueDay(k)); }
        if (S.profile) { S.profile.migratedV1Remote = true; S.profile.updatedAt = Date.now(); store.saveLocal(); store.remote.profileRef.set(cleanProfile(S.profile)).catch(() => {}); }
      } catch (e) { /* legacy collection unreadable: nothing to migrate */ }
    },
    _onDaysSnap(snap) {
      if (store._resetting) return;
      const remote = new Map();
      snap.docs.forEach(doc => { const c = cleanDay(doc.data(), doc.id); if (c) remote.set(doc.id, c); });
      const changed = [];
      const synced = new Set(S.syncedDays);
      // remote -> local
      remote.forEach((rd, k) => {
        if (store._busy(k)) return;
        const ld = S.days[k];
        if (!ld || rd.updatedAt > ld.updatedAt) { if (JSON.stringify(rd) !== JSON.stringify(ld)) { S.days[k] = rd; changed.push(k); } }
        else if (ld.updatedAt > rd.updatedAt) store._queueDay(k);
      });
      // local days not on the server
      Object.keys(S.days).forEach(k => {
        if (remote.has(k) || store._busy(k)) return;
        if (store._firstDaysSnap && !synced.has(k)) store._queueDay(k);          // never uploaded: push
        else if (synced.has(k)) { delete S.days[k]; changed.push(k); }            // deleted elsewhere
      });
      store._firstDaysSnap = false;
      S.syncedDays = Array.from(new Set(Array.from(remote.keys()).concat(Array.from(store._pendingDays.keys()))));
      if (changed.length) store._changed(changed); else store.saveLocal();
    },
    _syncError(e) {
      const code = e && e.code;
      if (code === 'quota_exceeded' || code === 'resource_exhausted') M.emit('sync-error', { code, message: 'Cloud storage is full. Your entries are still saved on this device.' });
      else if (!store._syncWarned) { store._syncWarned = true; M.emit('sync-error', { code, message: 'Sync paused. Your entries are saved on this device.' }); }
      if (code === 'revoked') { store.remote = null; S.sync = 'local'; M.emit('sync', S.sync); }
    }
  };

  // expose cleaners for feature code that wants to validate before saving
  M.clean = { weight: cleanWeight, food: cleanFood, workout: cleanWorkout, activity: cleanActivity, day: cleanDay, profile: cleanProfile, emptyDay };
})();
