/* Momentum v2 — app: boot, derived-data cache, router, shell, quick-add, weigh-in sheet, onboarding gate,
   celebrations. Owner: foundation. Views register on M.views; sheets on M.sheets (see CONTRACT.md). */
(function () {
  'use strict';
  const M = window.M, U = M.util, ui = M.ui, S = M.state, store = M.store, C = M.calc;
  const esc = U.esc;

  /* ================= derived data (memoized per state version + minute) ================= */
  let memo = {}, memoV = -1, memoMin = -1;
  const cached = (k, fn) => {
    const min = Math.floor(Date.now() / 60000);
    if (memoV !== S.v || memoMin !== min) { memo = {}; memoV = S.v; memoMin = min; }
    if (!(k in memo)) memo[k] = fn();
    return memo[k];
  };
  M.data = {
    /** current trend weight (kg) or start weight */
    currentKg: () => cached('kg', () => C.currentKg(S.profile, S.days)),
    /** energy balance for a day key (default today) — see calc.balance */
    balance: key => cached('bal:' + (key || U.todayKey()), () => C.balance(S.profile, S.days, key || U.todayKey(), Date.now())),
    /** today's plan (calc.plan) using today's typical burn */
    plan: () => cached('plan', () => M.data.balance().plan),
    /** weight analysis (calc.weightAnalysis) */
    analysis: () => cached('wa', () => C.weightAnalysis(S.profile, S.days, Date.now())),
    /** last n days deficit analysis (calc.deficitAnalysis) */
    deficits: n => cached('da:' + (n || 7), () => C.deficitAnalysis(S.profile, S.days, Date.now(), n || 7)),
    /** headline sentences [{text, html}] */
    headlines: () => cached('hl', () => C.headlines(S.profile, S.days, Date.now())),
    /** "what it takes today" (calc.todayActions) */
    todayActions: () => cached('ta', () => C.todayActions(M.data.balance())),
    /** BMR (kcal/day) at the current trend weight */
    bmr: () => cached('bmr', () => C.bmrFor(S.profile, M.data.currentKg(), Date.now()))
  };

  /* ================= navigation model ================= */
  const NAV = [
    { id: 'today', label: 'Today', icon: 'today' },
    { id: 'food', label: 'Food', icon: 'food' },
    { id: 'activity', label: 'Activity', icon: 'activity' },
    { id: 'progress', label: 'Progress', icon: 'progress' },
    { id: 'plan', label: 'Plan', icon: 'plan' },
    { id: 'profile', label: 'Profile', icon: 'profile' }
  ];
  const ROUTES = NAV.map(n => n.id);
  function parseHash() {
    const h = (location.hash || '').replace(/^#\/?/, '');
    const [path, q] = h.split('?');
    const route = ROUTES.includes(path) ? path : 'today';
    const params = {};
    if (q) q.split('&').forEach(kv => { const [k, v] = kv.split('='); if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || ''); });
    return { route, params };
  }
  /** M.go('food', {date:'2026-11-02'}) */
  M.go = function (route, params) {
    const q = params ? Object.keys(params).filter(k => params[k] != null).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&') : '';
    const h = '#' + route + (q ? '?' + q : '');
    if (location.hash === h) render(); else location.hash = h;
  };

  function renderNav(active) {
    const tabs = ['today', 'food', '+', 'activity', 'progress'];
    document.getElementById('tabbar').innerHTML = tabs.map(id => {
      if (id === '+') return '<button type="button" class="tab-add" data-action="quick-add" aria-label="Add a weigh-in, food or workout">' + M.icon('plus') + '</button>';
      const n = NAV.find(x => x.id === id);
      return '<a class="tab" href="#' + id + '"' + (active === id ? ' aria-current="page"' : '') + '><span class="tab-pill">' + M.icon(n.icon) + '</span><span class="tab-label">' + n.label + '</span></a>';
    }).join('');
    document.getElementById('side-nav').innerHTML = NAV.map(n =>
      '<a class="side-link" href="#' + n.id + '"' + (active === n.id ? ' aria-current="page"' : '') + ' title="' + n.label + '">' + M.icon(n.icon) + '<span class="side-label">' + n.label + '</span></a>').join('');
    const name = (S.profile && S.profile.name) || '';
    const av = document.getElementById('topbar-avatar');
    av.textContent = (name.trim()[0] || 'M').toUpperCase();
    av.setAttribute('aria-current', active === 'profile' ? 'page' : 'false');
    const sync = S.sync === 'cloud' ? 'Synced to your account' : 'Saved on this device';
    document.getElementById('side-foot').innerHTML = '<p class="t-cap muted side-label" style="padding:0 12px">' + esc(sync) + '</p>';
  }

  /* ================= rendering ================= */
  const viewEl = () => document.getElementById('view');
  let current = null, currentName = null, renderQueued = false, lastRoute = null;
  function render() {
    renderQueued = false;
    const root = viewEl();
    const app = document.getElementById('app');
    if (!store.profileComplete()) {
      app.classList.add('is-onboarding');
      teardown();
      root.className = 'container narrow';
      const ob = M.views.onboarding;
      try { if (ob && typeof ob.render === 'function') { currentName = 'onboarding'; current = ob; ob.render(root, { route: 'onboarding', params: {}, profile: S.profile }); } else { currentName = 'onboarding-fallback'; fallbackOnboarding(root); } }
      catch (e) { console.error(e); fallbackOnboarding(root); }
      return;
    }
    app.classList.remove('is-onboarding');
    const { route, params } = parseHash();
    renderNav(route);
    const v = M.views[route];
    const routeChanged = route !== lastRoute;
    if (currentName !== route) teardown();
    current = v; currentName = route; lastRoute = route;
    const y = window.scrollY;
    root.className = 'container' + (v && v.narrow ? ' narrow' : '');
    document.title = (v && v.title ? v.title + ' · ' : '') + 'Momentum';
    try {
      if (v && typeof v.render === 'function') v.render(root, { route, params });
      else root.innerHTML = '<div class="view">' + ui.pageHead({ title: (NAV.find(n => n.id === route) || {}).label || 'Momentum' }) + '<div class="card">' + ui.empty({ icon: 'sparkle', title: 'This screen is on its way', body: 'Use the + button to log a weigh-in in the meantime.' }) + '</div></div>';
    } catch (e) {
      console.error('[view ' + route + ']', e);
      root.innerHTML = '<div class="view"><div class="card">' + ui.empty({ icon: 'alert', title: 'Something went wrong on this screen', body: 'Your data is safe. Try another tab or reload.' }) + '</div></div>';
    }
    if (routeChanged) { window.scrollTo(0, 0); } else if (Math.abs(window.scrollY - y) > 2) window.scrollTo(0, y);
  }
  function teardown() { if (current && typeof current.destroy === 'function') { try { current.destroy(); } catch (e) { console.error(e); } } current = null; currentName = null; }
  /** schedule a re-render of the current view (coalesced per frame) */
  M.render = function () { if (renderQueued) return; renderQueued = true; requestAnimationFrame(render); };

  /* ================= quick add ================= */
  M.sheets.quickAdd = {
    open() {
      const tiles = [
        { id: 'weighIn', label: 'Weigh-in', icon: 'scale', tone: 'brand' },
        { id: 'food', label: 'Food', icon: 'food', tone: 'brand' },
        { id: 'workout', label: 'Workout', icon: 'dumbbell', tone: 'teal' }
      ];
      const body = '<div class="quick-grid">' + tiles.map(t => '<button type="button" class="quick-tile" data-open="' + t.id + '"><span class="ic-bubble ' + t.tone + '">' + M.icon(t.icon, 'lg') + '</span><span>' + t.label + '</span></button>').join('') + '</div>' +
        '<button type="button" class="row" data-open="activity" style="border-radius:16px;padding:10px 12px"><span class="ic-bubble teal sm">' + M.icon('steps') + '</span><span class="row-main"><span class="row-title">Steps &amp; active calories</span><span class="row-sub">Import from Samsung Health or enter them</span></span>' + M.icon('chevron', 'row-chev') + '</button>';
      const sh = ui.sheet({ title: 'Add', body });
      sh.body.addEventListener('click', e => {
        const b = e.target.closest('[data-open]'); if (!b) return;
        const id = b.dataset.open;
        sh.close();
        setTimeout(() => M.openSheet(id), 60);
      });
    }
  };
  /** open a registered sheet by name, falling back to the owning route */
  M.openSheet = function (name, opts) {
    const s = M.sheets[name];
    if (s && typeof s.open === 'function') return s.open(opts || {});
    const fallback = { food: 'food', workout: 'activity', activity: 'activity' }[name];
    if (fallback) { M.go(fallback); ui.toast('Open the ' + fallback + ' tab to add this.'); }
  };
  document.addEventListener('click', e => {
    const qa = e.target.closest('[data-action="quick-add"]');
    if (qa) { e.preventDefault(); M.sheets.quickAdd.open(); return; }
    const os = e.target.closest('[data-open-sheet]');
    if (os) { e.preventDefault(); let opts = {}; try { opts = os.dataset.sheetOpts ? JSON.parse(os.dataset.sheetOpts) : {}; } catch (er) {} M.openSheet(os.dataset.openSheet, opts); }
  });

  /* ================= weigh-in sheet (shared) ================= */
  M.sheets.weighIn = {
    /** open({id?: weightId to edit, date?: key, kg?}) */
    open(o) {
      o = o || {};
      const unit = M.units.unit;
      const found = o.id ? store.findItem('weights', o.id) : null;
      const editing = found ? found.item : null;
      const last = store.allWeights().slice(-1)[0];
      const initKg = editing ? editing.kg : (isFinite(o.kg) ? o.kg : last ? last.kg : (S.profile && S.profile.startKg) || 80);
      const now = Date.now();
      let dateKey = editing ? U.keyOf(editing.t) : (o.date && U.isValidKey(o.date) ? o.date : U.todayKey());
      const time = editing ? U.hhmm(editing.t) : U.hhmm(now);
      const tags = editing ? (editing.tags || []).slice() : (new Date().getHours() < 11 && !editing ? ['Morning'] : []);
      const step = unit === 'lb' ? 0.2 : 0.1;
      const body = ui.h('div', { class: 'form' });
      body.innerHTML =
        '<div class="stack-md" style="align-items:center;padding-top:8px">' +
        '<div class="stepper"><button type="button" class="btn-icon filled" data-step="-1" aria-label="Decrease by ' + step + ' ' + unit + '">' + M.icon('minus') + '</button>' +
        '<label class="big-input"><span class="sr-only">Weight in ' + unit + '</span><input id="wi-kg" type="text" inputmode="decimal" autocomplete="off" value="' + M.units.n(initKg) + '"><span class="suffix">' + unit + '</span></label>' +
        '<button type="button" class="btn-icon filled" data-step="1" aria-label="Increase by ' + step + ' ' + unit + '">' + M.icon('plus') + '</button></div>' +
        '<p class="hint" id="wi-delta" style="min-height:1.45em;text-align:center"></p><p class="error-text" id="wi-kg-err" hidden></p></div>' +
        '<div class="field-row">' +
        ui.field({ id: 'wi-date', label: 'Date', input: '<input class="input" id="wi-date" type="date" value="' + dateKey + '" max="' + U.todayKey() + '">' }) +
        ui.field({ id: 'wi-time', label: 'Time', input: '<input class="input" id="wi-time" type="time" value="' + time + '">' }) +
        '</div><div class="field"><span class="label" id="wi-tags-l">Tags <span class="opt">(optional)</span></span><div id="wi-tags"></div></div>' +
        ui.field({ id: 'wi-note', label: 'Note', optional: true, input: '<input class="input" id="wi-note" type="text" maxlength="280" placeholder="e.g. after a long run" value="' + esc(editing ? editing.note : '') + '">' });
      const chips = ui.chips({ options: M.WEIGH_TAGS, value: tags, multi: true, ariaLabel: 'Tags' });
      body.querySelector('#wi-tags').appendChild(chips);
      const foot = document.createDocumentFragment();
      if (editing) foot.appendChild(ui.h('button', { type: 'button', class: 'btn btn-danger', 'data-del': '1', html: M.icon('trash') + '<span class="btn-label">Delete</span>' }));
      foot.appendChild(ui.h('button', { type: 'button', class: 'btn btn-primary', 'data-save': '1' }, editing ? 'Save changes' : 'Save weigh-in'));
      const sh = ui.sheet({ title: editing ? 'Edit weigh-in' : 'Log weight', sub: editing ? U.relDay(dateKey) + ' at ' + U.fmtTime(editing.t) : 'Weigh in as often as you like. Your trend smooths it out.', body, foot, initialFocus: '#wi-kg' });
      const inp = body.querySelector('#wi-kg');
      const delta = body.querySelector('#wi-delta');
      const refDelta = () => {
        const v = M.util.parseNum(inp.value);
        const trend = M.data.currentKg();
        if (!isFinite(v) || !isFinite(trend) || !store.allWeights().length) { delta.textContent = ''; return; }
        const d = M.units.from(v) - trend;
        delta.textContent = Math.abs(M.units.to(d)) < 0.05 ? 'Right on your trend' : M.units.signed(d) + ' ' + unit + ' vs your trend (' + M.units.n(trend) + ')';
      };
      refDelta();
      inp.addEventListener('input', refDelta);
      inp.addEventListener('focus', () => setTimeout(() => inp.select(), 0));
      body.addEventListener('click', e => {
        const b = e.target.closest('[data-step]'); if (!b) return;
        const v = M.util.parseNum(inp.value);
        inp.value = (Math.round(((isFinite(v) ? v : M.units.to(initKg)) + step * +b.dataset.step) * 10) / 10).toFixed(1);
        refDelta();
      });
      const save = () => {
        const v = M.util.parseNum(inp.value);
        const kg = M.units.from(v);
        if (!isFinite(v) || kg < 20 || kg > 400) { ui.fieldError(inp, 'Enter a weight between ' + Math.ceil(M.units.to(20)) + ' and ' + Math.floor(M.units.to(400)) + ' ' + unit + '.'); inp.focus(); return; }
        const dk = body.querySelector('#wi-date').value;
        if (!U.isValidKey(dk)) { ui.fieldError(body.querySelector('#wi-date'), 'Choose a date.'); return; }
        const t = U.timeOn(dk, body.querySelector('#wi-time').value || U.hhmm(now));
        const item = { kg, t, tags: chips.value, note: body.querySelector('#wi-note').value.trim() };
        if (editing) { store.updateItem('weights', editing.id, item); ui.toast('Weigh-in updated'); }
        else { store.addItem('weights', item); ui.toast('Logged ' + M.units.n(kg) + ' ' + unit); }
        sh.close();
      };
      sh.foot.addEventListener('click', async e => {
        if (e.target.closest('[data-save]')) save();
        else if (e.target.closest('[data-del]')) {
          const undo = store.removeItem('weights', editing.id);
          sh.close();
          ui.toast('Weigh-in deleted', { action: { label: 'Undo', fn: () => undo && undo() } });
        }
      });
      body.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); save(); } });
      return sh;
    }
  };

  /* ================= fallback onboarding (used only if views/onboarding.js does not register) ================= */
  function fallbackOnboarding(root) {
    const p = S.profile || {};
    const unit = p.unit || 'lb';
    root.innerHTML = '<div class="view" style="padding-top:24px">' +
      ui.pageHead({ over: 'Welcome to Momentum', title: 'Let’s set up your plan', sub: 'A few details let us estimate the calories you burn at rest and build a daily target.' }) +
      '<form class="card form" id="ob-form" novalidate>' +
      ui.field({ id: 'ob-name', label: 'First name', input: '<input class="input" id="ob-name" autocomplete="given-name" value="' + esc(p.name || '') + '">' }) +
      '<div class="field"><span class="label">Sex <span class="opt">(used for resting burn)</span></span><div id="ob-sex"></div></div>' +
      '<div class="field"><span class="label">Units</span><div id="ob-unit"></div></div>' +
      '<div class="field-row">' + ui.field({ id: 'ob-age', label: 'Age', input: '<input class="input" id="ob-age" inputmode="numeric" value="' + (p.birthYear ? new Date().getFullYear() - p.birthYear : '') + '">' }) +
      ui.field({ id: 'ob-height', label: 'Height', hint: 'cm, or feet and inches like 5\'10', input: '<input class="input" id="ob-height" value="' + (p.heightCm ? (unit === 'lb' ? (() => { const f = M.units.cmToFtIn(p.heightCm); return f.ft + "'" + f.inch; })() : Math.round(p.heightCm)) : '') + '">' }) + '</div>' +
      '<div class="field-row">' + ui.field({ id: 'ob-weight', label: 'Current weight', input: '<input class="input" id="ob-weight" inputmode="decimal" value="' + (p.startKg ? M.units.n(M.data.currentKg() || p.startKg) : '') + '">' }) +
      ui.field({ id: 'ob-goal', label: 'Goal weight', input: '<input class="input" id="ob-goal" inputmode="decimal" value="' + (p.goalKg ? M.units.n(p.goalKg) : '') + '">' }) + '</div>' +
      ui.field({ id: 'ob-date', label: 'Reach it by', optional: true, input: '<input class="input" id="ob-date" type="date" min="' + U.addDays(U.todayKey(), 14) + '" value="' + (p.targetDate || '') + '">' }) +
      '<p class="notice brand" id="ob-preview">' + M.icon('sparkle') + '<span>Fill in your details to see your daily target.</span></p>' +
      '<button class="btn btn-primary btn-block" type="submit">Start tracking</button></form></div>';
    const form = root.querySelector('#ob-form');
    const sex = ui.segmented({ options: [{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }], value: p.sex || 'male', block: true, size: 'lg', ariaLabel: 'Sex' });
    const un = ui.segmented({ options: [{ value: 'lb', label: 'lb, ft/in' }, { value: 'kg', label: 'kg, cm' }], value: unit, block: true, size: 'lg', ariaLabel: 'Units' });
    root.querySelector('#ob-sex').appendChild(sex); root.querySelector('#ob-unit').appendChild(un);
    const read = () => {
      const u = un.value;
      const toKg = v => u === 'lb' ? v * M.units.LB : v;
      const hRaw = root.querySelector('#ob-height').value.trim();
      let hCm = NaN;
      const m = hRaw.match(/^(\d)\s*['′ft. ]+\s*(\d{1,2})?/);
      if (m) hCm = M.units.ftInToCm(+m[1], +(m[2] || 0)); else { const v = U.parseNum(hRaw); hCm = v > 0 && v < 3 ? v * 100 : v; }
      const age = U.parseNum(root.querySelector('#ob-age').value);
      return { name: root.querySelector('#ob-name').value.trim(), sex: sex.value, unit: u, heightCm: hCm, age, kg: toKg(U.parseNum(root.querySelector('#ob-weight').value)), goal: toKg(U.parseNum(root.querySelector('#ob-goal').value)), date: root.querySelector('#ob-date').value };
    };
    const preview = () => {
      if (!form.isConnected) return;
      const r = read();
      const out = root.querySelector('#ob-preview span');
      if (!(r.kg > 20 && r.goal > 20 && r.heightCm > 100 && r.age > 10)) { out.textContent = 'Fill in your details to see your daily target.'; return; }
      const prof = { sex: r.sex, birthYear: new Date().getFullYear() - r.age, heightCm: r.heightCm, startKg: r.kg, goalKg: r.goal, targetDate: r.date || null, unit: r.unit };
      const b = C.bmrFor(prof, r.kg);
      const pl = C.plan(prof, { currentKg: r.kg, typicalBurn: b + 250 });
      const perWeek = (r.unit === 'lb' ? pl.kgPerWeek / M.units.LB : pl.kgPerWeek).toFixed(1);
      out.textContent = 'Resting burn about ' + U.int(b) + ' kcal/day. ' + (pl.dir < 0 ? 'Lose ' : 'Gain ') + perWeek + ' ' + r.unit + '/week → about ' + U.int(pl.kcalPerDay) + ' kcal/day ' + (pl.dir < 0 ? 'deficit' : 'surplus') + (pl.tooFast ? '. That pace is faster than 1% of body weight a week; consider a later date.' : '.');
    };
    form.addEventListener('input', preview);
    form.addEventListener('click', () => setTimeout(preview, 0));
    preview();
    form.addEventListener('submit', e => {
      e.preventDefault();
      const r = read();
      const bad = [];
      if (!(r.age >= 13 && r.age <= 100)) bad.push(['#ob-age', 'Enter an age between 13 and 100.']);
      if (!(r.heightCm >= 120 && r.heightCm <= 230)) bad.push(['#ob-height', 'Enter your height, e.g. 178 or 5\'10.']);
      if (!(r.kg >= 30 && r.kg <= 350)) bad.push(['#ob-weight', 'Enter your current weight.']);
      if (!(r.goal >= 30 && r.goal <= 350)) bad.push(['#ob-goal', 'Enter a goal weight.']);
      ['#ob-age', '#ob-height', '#ob-weight', '#ob-goal'].forEach(s => ui.fieldError(root.querySelector(s), ''));
      bad.forEach(([s, msg]) => ui.fieldError(root.querySelector(s), msg));
      if (bad.length) { root.querySelector(bad[0][0]).focus(); return; }
      const today = U.todayKey();
      const hadWeights = store.allWeights().length > 0;
      store.setProfile({ name: r.name, sex: r.sex, unit: r.unit, birthYear: new Date().getFullYear() - Math.round(r.age), heightCm: Math.round(r.heightCm * 10) / 10, startKg: p.startKg || r.kg, startDate: p.startDate || today, goalKg: r.goal, targetDate: U.isValidKey(r.date) ? r.date : null, stepGoal: p.stepGoal || 8000 });
      if (!hadWeights) store.addItem('weights', { kg: r.kg, t: Date.now(), tags: [], note: '' });
      location.hash = '#today';
      M.render();
    });
  }

  /* ================= celebrations ================= */
  let celebrating = false;
  function checkMilestones(silent) {
    if (!store.profileComplete() || celebrating) return;
    const a = M.data.analysis();
    const fresh = C.newlyCrossed(a.milestones, S.profile.celebrated);
    if (!fresh.length) return;
    const ids = (S.profile.celebrated || []).concat(fresh.map(m => m.id));
    if (silent) { store.setProfile({ celebrated: ids }); return; }
    const top = fresh.find(m => m.isGoal) || fresh[0];
    store.setProfile({ celebrated: ids });
    celebrating = true;
    const sub = top.kind === 's' ? top.sub : top.isGoal ? 'You reached your goal weight. Take a moment to enjoy it.' : top.sub + '. Your trend is ' + M.units.n(a.current) + ' ' + M.units.unit + '.';
    ui.celebrate({ title: top.title, sub, kind: top.isGoal ? 'goal' : top.kind }).then(() => { celebrating = false; });
  }

  /* ================= boot ================= */
  function boot() {
    store.load();
    store.applyTheme();
    try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => store.applyTheme()); } catch (e) {}
    // First run on existing data: mark already-earned milestones silently
    if (store.profileComplete() && (!S.profile.celebrated || !S.profile.celebrated.length)) checkMilestones(true);
    window.addEventListener('hashchange', () => { ui.closeAll({ keepHistory: true }); render(); });
    M.on('change', () => { M.render(); setTimeout(() => checkMilestones(false), 400); });
    M.on('sync', () => M.render());
    M.on('ai-ready', () => M.render());
    M.on('ai-unavailable', () => M.render());
    M.on('sync-error', e => ui.toast(e.message));
    M.on('storage-error', () => ui.toast('This browser blocked saving. Your entries may not persist.'));
    // re-render at day rollover / when tab regains focus (dates & "so far" numbers move)
    let lastDay = U.todayKey();
    const tick = () => { if (U.todayKey() !== lastDay) { lastDay = U.todayKey(); M.render(); } };
    setInterval(tick, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); M.render(); } });
    const tb = document.getElementById('topbar');
    window.addEventListener('scroll', () => tb.classList.toggle('scrolled', window.scrollY > 4), { passive: true });
    render();
    store.connect();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
