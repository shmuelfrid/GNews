/* Momentum v2 — ONBOARDING (shown while M.store.profileComplete() is false). Owner: today builder.
   Three calm steps: 1 About you · 2 Your weight · 3 Your plan (live preview from M.calc, with safety check).
   Finishes with M.store.setProfile(...) + the first weigh-in, then #today. */
(function () {
  'use strict';
  const M = window.M, U = M.util, ui = M.ui, C = M.calc;
  const esc = U.esc;
  const LB = 0.45359237;
  const YEAR = () => new Date().getFullYear();

  let draft = null;        // survives re-renders while onboarding
  let wasShown = false;
  // optional typical activity on top of resting burn, used only for the preview / first-day budget
  const BASELINES = [
    { value: 'low', label: 'Mostly sitting', kcal: 200 },
    { value: 'some', label: 'On my feet some', kcal: 350 },
    { value: 'high', label: 'Very active', kcal: 550 }
  ];

  const num = v => U.parseNum(v);
  const fmt1 = v => (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, '');

  function initDraft(p) {
    p = p || {};
    const unit = p.unit === 'kg' ? 'kg' : 'lb';
    const toU = kg => unit === 'lb' ? kg / LB : kg;
    let cur = null;
    try { if (M.store.allWeights().length) cur = M.data.currentKg(); } catch (e) {}
    if (!Number.isFinite(cur)) cur = Number.isFinite(p.startKg) ? p.startKg : null;
    const fi = Number.isFinite(p.heightCm) ? M.units.cmToFtIn(p.heightCm) : null;
    return {
      step: 1, unit, name: p.name || '', sex: p.sex === 'female' || p.sex === 'male' ? p.sex : '',
      age: Number.isFinite(p.birthYear) ? String(YEAR() - p.birthYear) : '',
      ft: fi ? String(fi.ft) : '', inch: fi ? String(fi.inch) : '', cm: Number.isFinite(p.heightCm) ? String(Math.round(p.heightCm)) : '',
      weight: Number.isFinite(cur) ? fmt1(toU(cur)) : '', goal: Number.isFinite(p.goalKg) ? fmt1(toU(p.goalKg)) : '',
      weightEdited: false,
      mode: U.isValidKey(p.targetDate) && p.targetDate > U.todayKey() ? 'date' : 'pace',
      date: U.isValidKey(p.targetDate) && p.targetDate > U.todayKey() ? p.targetDate : '',
      pace: 'steady', baseline: p.activityBaseline || 'some'
    };
  }

  /* ---------- reading the draft ---------- */
  function heightCm(d) {
    if (d.unit === 'kg') { const v = num(d.cm); return v > 0 && v < 3 ? v * 100 : v; }
    const f = num(d.ft), i = num(d.inch);
    if (!isFinite(f)) return NaN;
    return M.units.ftInToCm(f, isFinite(i) ? i : 0);
  }
  const toKg = (d, v) => d.unit === 'lb' ? v * LB : v;
  function profileFrom(d) {
    const kg = toKg(d, num(d.weight)), goalKg = toKg(d, num(d.goal));
    const age = num(d.age);
    const p = { sex: d.sex || 'male', birthYear: YEAR() - Math.round(age), heightCm: heightCm(d), unit: d.unit, startKg: kg, goalKg };
    if (d.mode === 'date' && U.isValidKey(d.date)) p.targetDate = d.date;
    else {
      const scen = C.plan(Object.assign({}, p, { targetDate: null }), { currentKg: kg }).scenarios.find(s => s.id === d.pace);
      p.targetDate = null; p.paceKgPerWeek = scen ? scen.kgPerWeek : (d.unit === 'kg' ? 0.5 : LB);
    }
    return p;
  }
  function preview(d) {
    const p = profileFrom(d);
    if (!(p.startKg > 25 && p.goalKg > 25 && p.heightCm > 100 && p.birthYear > 1900)) return null;
    const bmr = C.bmrFor(p, p.startKg);
    const base = (BASELINES.find(b => b.value === d.baseline) || BASELINES[1]).kcal;
    const typical = bmr + base;
    const pl = C.plan(p, { currentKg: p.startKg, typicalBurn: typical });
    return { p, bmr, typical, pl };
  }

  /* ---------- markup per step ---------- */
  const unitLabel = d => d.unit;
  function stepAbout(d) {
    const height = d.unit === 'lb'
      ? '<div class="field"><span class="label" id="ob-h-l">Height</span><div class="ob-pair" role="group" aria-labelledby="ob-h-l">' +
        '<div class="input-wrap"><input class="input num-input" id="ob-ft" inputmode="numeric" autocomplete="off" aria-label="Feet" placeholder="5" value="' + esc(d.ft) + '"><span class="suffix">ft</span></div>' +
        '<div class="input-wrap"><input class="input num-input" id="ob-in" inputmode="numeric" autocomplete="off" aria-label="Inches" placeholder="10" value="' + esc(d.inch) + '"><span class="suffix">in</span></div>' +
        '</div><p class="error-text" id="ob-ft-err" hidden></p></div>'
      : ui.field({ id: 'ob-cm', label: 'Height', input: '<div class="input-wrap"><input class="input num-input" id="ob-cm" inputmode="numeric" autocomplete="off" placeholder="178" value="' + esc(d.cm) + '"><span class="suffix">cm</span></div>' });
    return ui.field({ id: 'ob-name', label: 'What should we call you?', optional: true, input: '<input class="input" id="ob-name" autocomplete="given-name" maxlength="40" placeholder="First name" value="' + esc(d.name) + '">' }) +
      '<div class="field"><span class="label">Units</span><div data-slot="unit"></div></div>' +
      '<div class="field"><span class="label" id="ob-sex-l">Sex</span><div data-slot="sex"></div>' +
      '<p class="hint">Men and women burn slightly different calories at rest, so this keeps your numbers accurate.</p><p class="error-text" id="ob-sex-err" hidden></p></div>' +
      '<div class="ob-narrow">' +
      ui.field({ id: 'ob-age', label: 'Age', input: '<div class="input-wrap"><input class="input num-input" id="ob-age" inputmode="numeric" autocomplete="off" placeholder="34" value="' + esc(d.age) + '"><span class="suffix">years</span></div>' }) +
      '</div>' + height;
  }
  function stepWeight(d) {
    const u = unitLabel(d);
    return '<div class="ob-pair">' +
      ui.field({ id: 'ob-weight', label: 'Your weight now', input: '<div class="input-wrap"><input class="input num-input ob-bignum" id="ob-weight" inputmode="decimal" autocomplete="off" placeholder="' + (u === 'lb' ? '193.6' : '87.8') + '" value="' + esc(d.weight) + '"><span class="suffix">' + u + '</span></div>' }) +
      ui.field({ id: 'ob-goal', label: 'Goal weight', input: '<div class="input-wrap"><input class="input num-input ob-bignum" id="ob-goal" inputmode="decimal" autocomplete="off" placeholder="' + (u === 'lb' ? '180' : '82') + '" value="' + esc(d.goal) + '"><span class="suffix">' + u + '</span></div>' }) +
      '</div><div data-slot="wsummary" aria-live="polite"></div>';
  }
  function stepPlan(d) {
    const minDate = U.addDays(U.todayKey(), 14);
    return '<div class="field"><span class="label">How do you want to set your pace?</span><div data-slot="mode"></div></div>' +
      (d.mode === 'date'
        ? ui.field({ id: 'ob-date', label: 'Reach my goal by', input: '<input class="input" id="ob-date" type="date" min="' + minDate + '" value="' + esc(d.date) + '">' }) +
          '<div data-slot="quickdates"></div>'
        : '<div class="field"><span class="label" id="ob-pace-l">Pick a pace</span><div class="ob-paces" data-slot="paces" role="radiogroup" aria-labelledby="ob-pace-l"></div></div>') +
      '<div class="field"><span class="label">How active is a normal day? <span class="opt">(optional)</span></span><div data-slot="baseline"></div>' +
      '<p class="hint">Just a starting guess. Once you import steps from Samsung Health, your real numbers take over.</p></div>' +
      '<div data-slot="preview" aria-live="polite"></div>';
  }

  const STEPS = [
    { title: 'Let’s set up your plan', sub: 'A few details so we can work out the calories your body burns at rest.', body: stepAbout },
    { title: 'Where you are, where you’re going', sub: 'Your starting point and the weight you’d like to reach.', body: stepWeight },
    { title: 'Choose your pace', sub: 'We’ll turn it into a simple daily target: what to eat and what to burn.', body: stepPlan }
  ];

  /* ---------- live pieces ---------- */
  function paintWeightSummary(root, d) {
    const slot = root.querySelector('[data-slot="wsummary"]'); if (!slot) return;
    const w = num(d.weight), g = num(d.goal), u = d.unit;
    if (!(w > 0 && g > 0)) { slot.innerHTML = ''; return; }
    const diff = g - w;
    let html = '';
    if (Math.abs(diff) >= 0.5) {
      html += '<p class="notice brand">' + M.icon('flag') + '<span>That’s <b>' + fmt1(Math.abs(diff)) + ' ' + u + '</b> to ' + (diff < 0 ? 'lose' : 'gain') + '. We’ll celebrate every 5 ' + u + ' along the way.</span></p>';
    }
    const h = heightCm(d);
    if (h > 120 && h < 230) {
      const bmi = toKg(d, g) / Math.pow(h / 100, 2);
      if (bmi < 18.5) {
        const healthy = 18.5 * Math.pow(h / 100, 2);
        html += '<p class="notice warn">' + M.icon('alert') + '<span>That goal is below a healthy weight for your height. Consider aiming for about <b>' + fmt1(d.unit === 'lb' ? healthy / LB : healthy) + ' ' + u + '</b> or more.</span></p>';
      }
    }
    slot.innerHTML = html;
  }
  function paintPreview(root, d) {
    const slot = root.querySelector('[data-slot="preview"]'); if (!slot) return;
    const pv = preview(d);
    if (!pv) { slot.innerHTML = ''; return; }
    const { pl, bmr } = pv, u = d.unit;
    const perWeek = fmt1(M.units.to(pl.kgPerWeek, u));
    const lose = pl.dir < 0;
    if (pl.goalReached) { slot.innerHTML = '<p class="notice good">' + M.icon('check') + '<span>You’re already at your goal weight. We’ll help you hold steady.</span></p>'; return; }
    const date = pl.targetDate ? U.fmtDateY(pl.targetDate) : '';
    let html = '<section class="ob-preview" aria-label="Your plan preview">' +
      '<p class="t-over">Your plan</p>' +
      '<p class="ob-pv-head"><span class="ob-pv-n">' + perWeek + '</span><span class="ob-pv-u">' + u + ' a week</span></p>' +
      '<p class="ob-pv-sub">' + (lose ? 'Lose ' : 'Gain ') + fmt1(M.units.to(pl.remainingKg, u)) + ' ' + u + (date ? ' by <b>' + esc(date) + '</b>' : '') + '</p>' +
      '<dl class="ob-pv-grid">' +
      '<div><dt>Daily ' + (lose ? 'deficit' : 'surplus') + '</dt><dd>' + U.int(pl.kcalPerDay) + '<span>kcal</span></dd></div>' +
      '<div><dt>Eat about</dt><dd>' + U.int(pl.lowBudget ? pl.minKcal : pl.budget) + '<span>' + (pl.lowBudget ? 'kcal a day, the safe minimum' : 'kcal a day') + '</span></dd></div>' +
      '<div><dt>Resting burn</dt><dd>' + U.int(bmr) + '<span>kcal a day</span></dd></div>' +
      '<div><dt>Weeks to go</dt><dd>' + (pl.weeksLeft != null ? Math.max(1, Math.round(pl.weeksLeft)) : '–') + '<span>weeks</span></dd></div>' +
      '</dl></section>';
    if (pl.tooFast || pl.lowBudget) {
      const why = (pl.tooFast ? 'That’s faster than 1% of your body weight a week, which is hard to sustain and costs muscle. ' : '') +
        (pl.lowBudget ? (pl.tooFast ? 'It would also put' : 'That would put') + ' your daily budget under ' + U.int(pl.minKcal) + ' kcal, which is too little to eat.' : '');
      html += '<div class="notice warn ob-safety">' + M.icon('alert') + '<div><p>' + why + '</p>' +
        (pl.safeDate ? '<button type="button" class="btn btn-sm btn-outline ob-safe-btn" data-safe="' + pl.safeDate + '">Use a safer date: ' + esc(U.fmtDateY(pl.safeDate)) + '</button>' : '') + '</div></div>';
    }
    slot.innerHTML = html;
  }

  /* ---------- validation ---------- */
  function validate(root, d) {
    const errs = [];
    const set = (id, msg) => { const el = root.querySelector('#' + id); if (el) ui.fieldError(el, msg); if (msg) errs.push(id); };
    if (d.step === 1) {
      const sexErr = root.querySelector('#ob-sex-err');
      if (sexErr) { sexErr.hidden = !!d.sex; sexErr.textContent = d.sex ? '' : 'Choose one so we can estimate your resting burn.'; if (!d.sex) errs.push('ob-sex'); }
      const age = num(d.age);
      set('ob-age', age >= 13 && age <= 100 ? '' : 'Enter an age between 13 and 100.');
      const h = heightCm(d);
      if (d.unit === 'lb') set('ob-ft', h >= 120 && h <= 230 && num(d.inch || 0) < 12 ? '' : 'Enter feet and inches, for example 5 ft 10 in.');
      else set('ob-cm', h >= 120 && h <= 230 ? '' : 'Enter your height in cm, for example 178.');
    } else if (d.step === 2) {
      const lo = d.unit === 'lb' ? 66 : 30, hi = d.unit === 'lb' ? 770 : 350;
      const w = num(d.weight), g = num(d.goal);
      set('ob-weight', w >= lo && w <= hi ? '' : 'Enter your weight in ' + d.unit + '.');
      set('ob-goal', !(g >= lo && g <= hi) ? 'Enter a goal weight in ' + d.unit + '.' : Math.abs(g - w) < 0.5 ? 'Pick a goal at least 0.5 ' + d.unit + ' away from today.' : '');
    } else if (d.step === 3 && d.mode === 'date') {
      const ok = U.isValidKey(d.date) && U.diffDays(U.todayKey(), d.date) >= 7;
      set('ob-date', ok ? '' : 'Choose a date at least a week from today.');
    }
    return errs;
  }

  function finish() {
    const d = draft;
    const pv = preview(d);
    if (!pv) return;
    const p0 = M.state.profile || {};
    const today = U.todayKey();
    const hadWeights = M.store.allWeights().length > 0;
    const kg = toKg(d, num(d.weight));
    const patch = Object.assign({}, pv.p, {
      name: d.name.trim(), unit: d.unit, heightCm: Math.round(pv.p.heightCm * 10) / 10,
      startKg: hadWeights && isFinite(p0.startKg) ? p0.startKg : kg,
      startDate: hadWeights && U.isValidKey(p0.startDate) ? p0.startDate : today,
      stepGoal: p0.stepGoal || 8000, activityBaseline: d.baseline
    });
    if (d.mode === 'date') patch.paceKgPerWeek = null;
    M.store.setProfile(patch);
    if (!hadWeights || d.weightEdited) M.store.addItem('weights', { kg, t: Date.now(), tags: new Date().getHours() < 11 ? ['Morning'] : [], note: '' });
    draft = null; wasShown = false;
    location.hash = '#today';
    M.render();
    setTimeout(() => ui.toast('You’re all set' + (patch.name ? ', ' + patch.name : '') + '. Here’s your day.'), 300);
  }

  /* ================= view ================= */
  M.views.onboarding = {
    title: 'Welcome',
    narrow: true,
    render(el, ctx) {
      if (!draft) draft = initDraft((ctx && ctx.profile) || M.state.profile);
      const d = draft;
      const st = STEPS[d.step - 1];
      el.innerHTML = '<div class="view ob-view' + (wasShown ? ' ob-still' : '') + '">' +
        '<div class="ob-brand"><span class="ob-logo">' + M.icon('logo') + '</span><span>Momentum</span></div>' +
        '<div class="ob-steps" aria-hidden="true">' + [1, 2, 3].map(i => '<span class="' + (i <= d.step ? 'on' : '') + '"></span>').join('') + '</div>' +
        '<header class="page-head ob-head"><div class="ph-text"><p class="ph-over">Step ' + d.step + ' of 3</p><h1 tabindex="-1" id="ob-h1">' + esc(st.title) + '</h1><p class="ph-sub">' + esc(st.sub) + '</p></div></header>' +
        '<form class="card ob-card" id="ob-wizard" novalidate><div class="form">' + st.body(d) + '</div>' +
        '<div class="ob-actions">' + (d.step > 1 ? '<button type="button" class="btn btn-secondary" data-back>' + M.icon('back') + '<span class="btn-label">Back</span></button>' : '<span></span>') +
        '<button type="submit" class="btn btn-primary ob-next"><span class="btn-label">' + (d.step < 3 ? 'Continue' : 'Start my plan') + '</span>' + M.icon(d.step < 3 ? 'chevron' : 'check') + '</button></div>' +
        '</form>' +
        (d.step === 1 ? '<p class="ob-privacy">' + M.icon('info', 'sm') + '<span>Your details stay in your account and are only used to calculate your numbers.</span></p>' : '') +
        '</div>';
      wasShown = true;
      const root = el.firstElementChild;
      const form = root.querySelector('#ob-wizard');
      const slot = n => root.querySelector('[data-slot="' + n + '"]');

      if (d.step === 1) {
        slot('unit').appendChild(ui.segmented({
          options: [{ value: 'lb', label: 'lb · ft/in' }, { value: 'kg', label: 'kg · cm' }], value: d.unit, block: true, size: 'lg', ariaLabel: 'Units',
          onChange: v => {
            if (v === d.unit) return;
            const h = heightCm(d);
            const conv = s => { const x = num(s); return isFinite(x) ? fmt1(v === 'kg' ? x * LB : x / LB) : s; };
            d.weight = conv(d.weight); d.goal = conv(d.goal);
            if (isFinite(h) && h > 0) { const fi = M.units.cmToFtIn(h); d.ft = String(fi.ft); d.inch = String(fi.inch); d.cm = String(Math.round(h)); }
            d.unit = v; M.render();
          }
        }));
        slot('sex').appendChild(ui.segmented({ options: [{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }], value: d.sex, block: true, size: 'lg', ariaLabel: 'Sex', onChange: v => { d.sex = v; const e = root.querySelector('#ob-sex-err'); if (e) e.hidden = true; } }));
      }
      if (d.step === 2) paintWeightSummary(root, d);
      if (d.step === 3) {
        slot('mode').appendChild(ui.segmented({ options: [{ value: 'pace', label: 'Steady pace' }, { value: 'date', label: 'By a date' }], value: d.mode, block: true, size: 'lg', ariaLabel: 'Plan type', onChange: v => { d.mode = v; M.render(); } }));
        if (d.mode === 'date') {
          const quick = [['In 3 months', 91], ['In 6 months', 182], ['In a year', 365]];
          slot('quickdates').appendChild(ui.chips({
            options: quick.map(q => ({ value: U.addDays(U.todayKey(), q[1]), label: q[0] })), value: d.date, ariaLabel: 'Quick dates',
            onChange: v => { d.date = v; root.querySelector('#ob-date').value = v; ui.fieldError(root.querySelector('#ob-date'), ''); paintPreview(root, d); }
          }));
        } else {
          const pv0 = preview(Object.assign({}, d, { mode: 'pace' }));
          const scen = pv0 ? pv0.pl.scenarios : [];
          const labels = { relaxed: 'Gentle and easy to keep up', steady: 'The sweet spot for most people', ambitious: 'Faster, needs more discipline' };
          slot('paces').innerHTML = scen.map(s =>
            '<button type="button" role="radio" class="ob-pace" aria-checked="' + (s.id === d.pace) + '" data-pace="' + s.id + '">' +
            '<span class="ob-pace-main"><span class="ob-pace-t">' + esc(s.label) + ' <span class="ob-pace-r">· ' + fmt1(M.units.to(s.kgPerWeek, d.unit)) + ' ' + d.unit + '/week</span></span>' +
            '<span class="ob-pace-s">' + esc(labels[s.id]) + '</span></span>' +
            '<span class="ob-pace-end"><span class="ob-pace-d">' + esc(U.fmtDateY(s.date)) + '</span>' + (s.safe ? '' : '<span class="badge warn">Too fast</span>') + '</span></button>').join('') ||
            '<p class="hint">Enter your weights first.</p>';
          slot('paces').addEventListener('click', e => {
            const b = e.target.closest('[data-pace]'); if (!b) return;
            d.pace = b.dataset.pace;
            slot('paces').querySelectorAll('[data-pace]').forEach(x => x.setAttribute('aria-checked', String(x === b)));
            paintPreview(root, d);
          });
        }
        slot('baseline').appendChild(ui.chips({ options: BASELINES.map(b => ({ value: b.value, label: b.label })), value: d.baseline, ariaLabel: 'Activity level', onChange: v => { d.baseline = v; paintPreview(root, d); } }));
        paintPreview(root, d);
      }

      // inputs -> draft
      form.addEventListener('input', e => {
        const t = e.target, map = { 'ob-name': 'name', 'ob-age': 'age', 'ob-ft': 'ft', 'ob-in': 'inch', 'ob-cm': 'cm', 'ob-weight': 'weight', 'ob-goal': 'goal', 'ob-date': 'date' };
        const k = map[t.id]; if (!k) return;
        d[k] = t.value;
        if (k === 'weight') d.weightEdited = true;
        if (t.getAttribute('aria-invalid') === 'true') ui.fieldError(t.id === 'ob-in' ? root.querySelector('#ob-ft') : t, '');
        if (d.step === 2) paintWeightSummary(root, d);
        if (d.step === 3) paintPreview(root, d);
      });
      form.addEventListener('click', e => {
        if (e.target.closest('[data-back]')) { d.step = Math.max(1, d.step - 1); M.render(); focusTop(); return; }
        const safe = e.target.closest('[data-safe]');
        if (safe) { d.mode = 'date'; d.date = safe.dataset.safe; M.render(); }
      });
      form.addEventListener('submit', e => {
        e.preventDefault();
        const errs = validate(root, d);
        if (errs.length) { const f = root.querySelector('#' + errs[0]); if (f && f.focus) f.focus(); else { const s = root.querySelector('[data-slot="sex"] .seg-btn'); if (s) s.focus(); } return; }
        if (d.step < 3) { d.step++; M.render(); focusTop(); return; }
        finish();
      });
    },
    destroy() {}
  };
  function focusTop() {
    requestAnimationFrame(() => { window.scrollTo(0, 0); const h = document.getElementById('ob-h1'); if (h) h.focus({ preventScroll: true }); });
  }
})();
