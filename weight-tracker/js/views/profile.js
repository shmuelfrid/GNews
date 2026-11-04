/* Momentum v2 — PROFILE view (#profile). Owner: today builder.
   Body stats (editable, resting burn recomputes live) · goal summary -> #plan · Samsung Health import ·
   preferences (units, theme, step goal) · data (CSV export / import, reset). */
(function () {
  'use strict';
  const M = window.M, U = M.util, ui = M.ui, C = M.calc;
  const esc = U.esc;
  const YEAR = () => new Date().getFullYear();

  let editing = false, edraft = null, wasShown = false;

  /* ================= CSV ================= */
  const COLS = ['type', 'date', 'time', 'name', 'meal', 'kcal', 'weight_kg', 'bmi', 'minutes', 'steps', 'active_kcal', 'total_kcal', 'active_minutes', 'distance_km', 'avg_hr', 'protein', 'carbs', 'fat', 'tags', 'note', 'source', 'counted_in_samsung', 'id'];
  const cell = v => { if (v == null || (typeof v === 'number' && !isFinite(v))) return ''; const s = String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  function buildCSV() {
    const rows = [COLS.join(',')];
    const put = o => rows.push(COLS.map(c => cell(o[c])).join(','));
    const S = M.state;
    Object.keys(S.days).sort().forEach(k => {
      const d = S.days[k];
      d.weights.forEach(w => put({ type: 'weight', date: k, time: U.hhmm(w.t), weight_kg: Math.round(w.kg * 1000) / 1000, bmi: C.bmi && S.profile && C.bmi(w.kg, +S.profile.heightCm) != null ? Math.round(C.bmi(w.kg, +S.profile.heightCm) * 10) / 10 : '', tags: (w.tags || []).join('; '), note: w.note, id: w.id }));
      d.foods.forEach(f => put({ type: 'food', date: k, time: U.hhmm(f.t), name: f.name, meal: f.meal, kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat, note: f.note, source: f.source, id: f.id }));
      d.workouts.forEach(w => put({ type: 'workout', date: k, time: U.hhmm(w.t), name: w.name || (C.workoutType(w.type) || {}).label, meal: '', kcal: w.kcal, minutes: w.minutes, distance_km: w.distanceKm, avg_hr: w.avgHr, note: w.note, source: w.source, counted_in_samsung: w.countedInSamsung ? 'yes' : 'no', id: w.id, tags: w.type }));
      if (d.activity) { const a = d.activity; put({ type: 'activity', date: k, time: a.syncedAt ? U.hhmm(a.syncedAt) : '', steps: a.steps, active_kcal: a.activeKcal, total_kcal: a.totalKcal, active_minutes: a.activeMinutes, distance_km: a.distanceKm, source: a.source }); }
    });
    return rows.join('\r\n') + '\r\n';
  }
  function parseCSV(text) {
    const out = []; let row = [], f = '', q = false;
    text = String(text || '').replace(/^﻿/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); out.push(row); row = []; f = ''; }
      else f += c;
    }
    if (f !== '' || row.length) { row.push(f); out.push(row); }
    return out.filter(r => r.some(x => String(x).trim() !== ''));
  }
  function importCSV(text) {
    const rows = parseCSV(text);
    if (rows.length < 2) return { error: 'That file has no rows to import.' };
    const head = rows[0].map(h => h.trim().toLowerCase().replace(/[\s-]+/g, '_'));
    const ix = n => head.indexOf(n);
    const get = (r, n) => { const i = ix(n); return i >= 0 ? String(r[i] == null ? '' : r[i]).trim() : ''; };
    const nm = (r, n) => { const v = U.parseNum(get(r, n)); return isFinite(v) ? v : undefined; };
    const unit = M.units.unit;
    const out = { weights: [], foods: [], workouts: [], activity: {} };
    const typed = ix('type') >= 0;
    // simple "date, weight" files (e.g. from another app) — weight in the current unit unless the header says kg/lb
    const wCol = ['weight_kg', 'weight_lb', 'weight', 'kg', 'lb'].find(c => ix(c) >= 0);
    rows.slice(1).forEach((r, n) => {
      let date = get(r, 'date');
      if (!U.isValidKey(date)) { const d = new Date(date); date = isNaN(d) ? '' : U.keyOf(d.getTime()); }
      if (!U.isValidKey(date)) return;
      const time = /^\d{1,2}:\d{2}/.test(get(r, 'time')) ? get(r, 'time').slice(0, 5) : '12:00';
      const t = U.timeOn(date, time);
      const type = typed ? get(r, 'type').toLowerCase() : 'weight';
      const id = get(r, 'id') || ('csv-' + type + '-' + date + '-' + time + '-' + n);
      if (type === 'weight') {
        let kg = nm(r, 'weight_kg');
        if (kg == null && wCol) { const v = nm(r, wCol); if (v != null) kg = /lb/.test(wCol) ? v * M.units.LB : /kg/.test(wCol) ? v : M.units.from(v, unit); }
        if (kg != null) out.weights.push({ id, t, kg, tags: get(r, 'tags') ? get(r, 'tags').split(/;\s*/) : [], note: get(r, 'note') });
      } else if (type === 'food') {
        const kcal = nm(r, 'kcal'); if (kcal == null) return;
        out.foods.push({ id, t, name: get(r, 'name') || 'Food', meal: get(r, 'meal') || undefined, kcal, protein: nm(r, 'protein'), carbs: nm(r, 'carbs'), fat: nm(r, 'fat'), note: get(r, 'note'), source: get(r, 'source') || 'manual', items: [] });
      } else if (type === 'workout') {
        out.workouts.push({ id, t, type: C.workoutType(get(r, 'tags') || get(r, 'name')).id, name: get(r, 'name'), minutes: nm(r, 'minutes') || 0, kcal: nm(r, 'kcal') || 0, distanceKm: nm(r, 'distance_km'), avgHr: nm(r, 'avg_hr'), note: get(r, 'note'), source: get(r, 'source') || 'manual', countedInSamsung: /^(yes|true|1)$/i.test(get(r, 'counted_in_samsung')) });
      } else if (type === 'activity') {
        const a = { steps: nm(r, 'steps'), activeKcal: nm(r, 'active_kcal'), totalKcal: nm(r, 'total_kcal'), activeMinutes: nm(r, 'active_minutes'), distanceKm: nm(r, 'distance_km'), source: get(r, 'source') || 'manual', syncedAt: t };
        Object.keys(a).forEach(k => a[k] === undefined && delete a[k]);
        out.activity[date] = a;
      }
    });
    const n = { weights: 0, foods: 0, workouts: 0, activity: Object.keys(out.activity).length };
    ['weights', 'foods', 'workouts'].forEach(k => {
      if (!out[k].length) return;
      const before = k === 'weights' ? M.store.allWeights().length : k === 'foods' ? M.store.allFoods().length : M.store.allWorkouts().length;
      M.store.addItemsBulk(k, out[k]);
      const after = k === 'weights' ? M.store.allWeights().length : k === 'foods' ? M.store.allFoods().length : M.store.allWorkouts().length;
      n[k] = after - before;
    });
    if (n.activity) M.store.setActivityBulk(out.activity, { merge: true });
    return n;
  }
  function download(name, text, type) {
    try {
      const blob = new Blob([text], { type: type || 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = ui.h('a', { href: url, download: name, style: { display: 'none' } });
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
      return true;
    } catch (e) { console.error(e); return false; }
  }

  /* ================= helpers ================= */
  function heightFromDraft(d) {
    if (M.units.unit === 'lb') { const f = U.parseNum(d.ft), i = U.parseNum(d.inch); return isFinite(f) ? M.units.ftInToCm(f, isFinite(i) ? i : 0) : NaN; }
    return U.parseNum(d.cm);
  }
  function draftFromProfile(p) {
    const fi = M.units.cmToFtIn(p.heightCm || 170);
    return { name: p.name || '', sex: p.sex || 'male', age: String(C.age(p.birthYear) || ''), ft: String(fi.ft), inch: String(fi.inch), cm: String(Math.round(p.heightCm || 170)) };
  }
  function draftBmr(d) {
    const p = M.state.profile || {};
    const age = U.parseNum(d.age), h = heightFromDraft(d);
    if (!(age >= 13 && age <= 100 && h >= 120 && h <= 230)) return null;
    return C.bmr(d.sex, M.data.currentKg(), h, age);
  }
  function lastImport() {
    const keys = M.store.dayKeys().slice().reverse();
    for (const k of keys) { const a = M.store.getDay(k).activity; if (a) return { key: k, a }; }
    return null;
  }

  /* ================= sections ================= */
  /** BMI line in body stats -> #bmi (BMI builder) */
  function bmiRow(p, kg) {
    const b = C.bmi ? C.bmi(kg, +p.heightCm) : null, c = b != null && C.bmiCategory ? C.bmiCategory(Math.round(b * 10) / 10) : null;   // classify the shown value
    if (!(isFinite(b) && c)) return '';
    return '<a class="bmi-profile-link" href="#bmi" aria-label="BMI ' + b.toFixed(1) + ', ' + esc(c.label) + '. See BMI details"><span class="bmi-pl-main"><span class="bmi-pl-l">BMI</span>' +
      '<span class="bmi-pl-v">' + b.toFixed(1) + '</span><span class="bmi-pill bmi-c-' + c.key + '"><span class="bmi-pill-dot" aria-hidden="true"></span>' + esc(c.label) + '</span></span>' + M.icon('chevron', 'row-chev') + '</a>';
  }
  function bodyCard(p) {
    const kg = M.data.currentKg(), bmr = M.data.bmr();
    const head = '<div class="card-head"><div class="ch-text"><h2 class="card-title" id="pf-body-t">Body stats</h2>' +
      '<p class="card-sub">Used to work out your resting burn</p></div>' +
      (editing ? '' : '<div class="ch-action profile-edit-action"><button type="button" class="btn btn-secondary btn-sm" data-pf="edit">' + M.icon('edit', 'sm') + '<span class="btn-label">Edit</span></button></div>') + '</div>';
    const burnBox = (val, live) => '<div class="profile-bmr" ' + (live ? 'aria-live="polite"' : '') + '><div class="profile-bmr-top"><span class="profile-bmr-l">Resting burn</span>' +
      '<span class="profile-bmr-v"><span class="profile-bmr-n" data-slot="bmr">' + (val != null ? U.int(val) : '–') + '</span><span class="today-u">kcal/day</span></span></div>' +
      '<p class="profile-bmr-p">Calories your body burns at rest, calculated from your height, weight, age and sex. It’s added to your burn through the day.</p></div>';
    if (!editing) {
      const tiles = [
        ['Sex', p.sex === 'female' ? 'Female' : 'Male', ''],
        ['Age', String(C.age(p.birthYear) || '–'), 'years'],
        ['Height', M.units.height(p.heightCm).replace(' ', ''), ''],
        ['Current weight', M.units.n(kg), M.units.unit]
      ];
      return '<section class="card profile-card" aria-labelledby="pf-body-t">' + head +
        '<dl class="profile-tiles">' + tiles.map(t => '<div class="profile-tile"><dt>' + esc(t[0]) + '</dt><dd><span class="profile-tile-n">' + esc(t[1]) + '</span>' + (t[2] ? '<span class="today-u">' + esc(t[2]) + '</span>' : '') + '</dd></div>').join('') + '</dl>' +
        bmiRow(p, kg) + burnBox(bmr) + '</section>';
    }
    const d = edraft;
    const height = M.units.unit === 'lb'
      ? '<div class="field"><span class="label" id="pf-h-l">Height</span><div class="ob-pair" role="group" aria-labelledby="pf-h-l">' +
        '<div class="input-wrap"><input class="input num-input" id="pf-ft" inputmode="numeric" aria-label="Feet" value="' + esc(d.ft) + '"><span class="suffix">ft</span></div>' +
        '<div class="input-wrap"><input class="input num-input" id="pf-in" inputmode="numeric" aria-label="Inches" value="' + esc(d.inch) + '"><span class="suffix">in</span></div></div><p class="error-text" id="pf-ft-err" hidden></p></div>'
      : ui.field({ id: 'pf-cm', label: 'Height', input: '<div class="input-wrap"><input class="input num-input" id="pf-cm" inputmode="numeric" value="' + esc(d.cm) + '"><span class="suffix">cm</span></div>' });
    return '<section class="card profile-card" aria-labelledby="pf-body-t">' + head +
      '<form class="form" id="pf-form" novalidate>' +
      ui.field({ id: 'pf-name', label: 'Name', optional: true, input: '<input class="input" id="pf-name" maxlength="40" autocomplete="given-name" value="' + esc(d.name) + '">' }) +
      '<div class="field"><span class="label">Sex</span><div data-slot="sex"></div></div>' +
      '<div class="ob-narrow">' + ui.field({ id: 'pf-age', label: 'Age', input: '<div class="input-wrap"><input class="input num-input" id="pf-age" inputmode="numeric" value="' + esc(d.age) + '"><span class="suffix">years</span></div>' }) + '</div>' +
      height + burnBox(draftBmr(d), true) +
      '<div class="profile-form-actions"><button type="button" class="btn btn-secondary" data-pf="cancel">Cancel</button><button type="submit" class="btn btn-primary">Save changes</button></div>' +
      '</form></section>';
  }
  function goalCard(p) {
    const pl = M.data.plan(), u = M.units.unit;
    const title = 'Goal: ' + M.units.n(p.goalKg, u === 'lb' ? 0 : 1) + ' ' + u + (pl.targetDate && !pl.goalReached ? ' by ' + U.fmtDateY(pl.targetDate) : '');
    const sub = pl.goalReached ? 'Goal reached. Set your next target.' : M.units.abs(pl.kgPerWeek) + ' ' + u + ' a week · ' + U.int(pl.kcalPerDay) + ' kcal daily ' + (pl.dir < 0 ? 'deficit' : 'surplus');
    return '<a class="card interactive profile-link" href="#plan"><span class="ic-bubble brand today-round">' + M.icon('target') + '</span>' +
      '<span class="today-pl-main"><span class="today-pl-title">' + esc(title) + '</span><span class="today-pl-sub">' + esc(sub) + '</span></span>' + M.icon('chevron', 'row-chev') + '</a>';
  }
  function samsungCard() {
    const li = lastImport();
    let last;
    if (li) {
      const a = li.a, bits = [];
      if (isFinite(a.steps)) bits.push(U.int(a.steps) + ' steps');
      if (isFinite(a.activeKcal)) bits.push(U.int(a.activeKcal) + ' active kcal');
      const src = a.source === 'samsung-export' ? 'data export' : a.source === 'samsung-screenshot' ? 'screenshot' : 'entered by hand';
      last = '<p class="profile-last">' + M.icon('check', 'sm') + '<span><b>Last update: ' + esc(U.relDay(li.key)) + (a.syncedAt && U.keyOf(a.syncedAt) === li.key ? ' ' + esc(U.fmtTime(a.syncedAt)) : '') + '</b> · ' + esc(src) + '<br>' + esc(bits.join(' · ') || 'Activity saved') + '</span></p>';
    } else last = '<p class="profile-last none">' + M.icon('info', 'sm') + '<span>No steps imported yet. Your resting burn still counts every day.</span></p>';
    const opt = (mode, icon, tone, t, s) => '<button type="button" class="profile-opt" data-sh="' + mode + '"><span class="ic-bubble ' + tone + '">' + M.icon(icon) + '</span>' +
      '<span class="profile-opt-main"><span class="profile-opt-t">' + t + '</span><span class="profile-opt-s">' + s + '</span></span>' + M.icon('chevron', 'row-chev') + '</button>';
    return '<section class="card profile-card" aria-labelledby="pf-sh-t"><div class="ch-text"><h2 class="card-title" id="pf-sh-t">Samsung Health</h2>' +
      '<p class="profile-lead">Samsung Health can’t connect directly to web apps, so bring your steps and calories in one of these ways.</p></div>' +
      '<div class="profile-opts">' +
      opt('screenshot', 'image', 'brand', 'Import a screenshot', 'AI reads your steps &amp; calories') +
      opt('export', 'upload', 'teal', 'Import your data export', 'CSV files from “Download personal data”') +
      opt('manual', 'form', '', 'Type in today’s numbers', 'Steps and active calories') +
      '</div>' + last + '</section>';
  }
  function prefsCard(p) {
    const goal = p.stepGoal || 8000;
    return '<section class="profile-group" aria-labelledby="pf-pref-t"><h2 class="profile-over" id="pf-pref-t">Preferences</h2>' +
      '<div class="card profile-list">' +
      '<div class="profile-row"><span class="profile-row-l">Units</span><div data-slot="units"></div></div>' +
      '<div class="profile-row profile-theme"><span class="profile-row-l">Theme</span><div data-slot="theme"></div></div>' +
      '<div class="profile-row"><span class="profile-row-l"><span>Daily step goal</span><span class="profile-row-s">≈ ' + U.int(goal * C.stepKcal(M.data.currentKg())) + ' active kcal</span></span>' +
      '<div class="profile-stepper" role="group" aria-label="Daily step goal"><button type="button" class="btn-icon filled" data-step="-1" aria-label="500 fewer steps"' + (goal <= 2000 ? ' disabled' : '') + '>' + M.icon('minus') + '</button>' +
      '<span class="profile-step-v" aria-live="polite">' + U.int(goal) + '</span>' +
      '<button type="button" class="btn-icon filled" data-step="1" aria-label="500 more steps"' + (goal >= 30000 ? ' disabled' : '') + '>' + M.icon('plus') + '</button></div></div>' +
      '</div></section>';
  }
  function dataCard() {
    const n = M.store.allWeights().length + M.store.allFoods().length + M.store.allWorkouts().length;
    const sync = M.state.sync === 'cloud' ? 'Synced to your account' : M.state.sync === 'connecting' ? 'Connecting to your account…' : 'Saved on this device';
    return '<section class="profile-group" aria-labelledby="pf-data-t"><h2 class="profile-over" id="pf-data-t">Your data</h2>' +
      '<div class="card profile-list">' +
      '<button type="button" class="profile-row profile-act" data-pf="export"' + (n ? '' : ' disabled') + '>' + M.icon('download') + '<span class="profile-row-l"><span>Export CSV</span><span class="profile-row-s">' + (n ? U.plural(n, 'entry', 'entries') + ' · weights, food, workouts, activity' : 'Nothing to export yet') + '</span></span></button>' +
      '<button type="button" class="profile-row profile-act" data-pf="import">' + M.icon('upload') + '<span class="profile-row-l"><span>Import CSV</span><span class="profile-row-s">From a Momentum export, or a simple date + weight file</span></span></button>' +
      '<button type="button" class="profile-row profile-act danger" data-pf="reset">' + M.icon('trash') + '<span class="profile-row-l"><span>Reset all data</span><span class="profile-row-s">Deletes everything and starts over</span></span></button>' +
      '</div><p class="profile-sync">' + M.icon(M.state.sync === 'cloud' ? 'cloud' : 'phone', 'sm') + '<span>' + esc(sync) + '</span></p></section>';
  }

  /** switch units without re-celebrating milestones: their ids are unit-specific ("dec-lb-190" vs "dec-kg-90") */
  function setUnit(v) {
    const p = M.state.profile || {};
    let celebrated = (p.celebrated || []).slice();
    try {
      const next = Object.assign({}, p, { unit: v });
      const a = C.weightAnalysis(next, M.state.days, Date.now());
      C.newlyCrossed(a.milestones, celebrated).forEach(m => celebrated.push(m.id));
    } catch (e) { console.error(e); }
    M.store.setProfile({ unit: v, celebrated });
  }

  /* ================= view ================= */
  M.views.profile = {
    title: 'Profile',
    narrow: false,
    render(el) {
      const p = M.state.profile || {};
      if (editing && !edraft) edraft = draftFromProfile(p);
      const a = M.data.analysis();
      const name = (p.name || '').trim();
      const since = U.isValidKey(p.startDate) ? 'Since\u00a0' + U.fmtDateY(p.startDate).replace(' ', '\u00a0') : '';
      const streak = a.streak >= 2 ? a.streak + '-day logging streak' : '';
      el.innerHTML = '<div class="view profile-view' + (wasShown ? ' profile-still' : '') + '">' +
        '<header class="profile-head"><a class="btn-icon filled profile-back" href="#today" aria-label="Back to Today">' + M.icon('back') + '</a>' +
        '<span class="profile-avatar" aria-hidden="true">' + esc((name[0] || 'M').toUpperCase()) + '</span>' +
        '<div class="profile-id"><h1>' + esc(name || 'Your profile') + '</h1><p class="ph-sub">' + esc([streak, since].filter(Boolean).join(' · ') || 'Body stats, goal and settings') + '</p></div></header>' +
        '<div class="profile-grid"><div class="profile-col">' + '<div class="profile-o1">' + bodyCard(p) + '</div><div class="profile-o2">' + goalCard(p) + '</div><div class="profile-o4">' + prefsCard(p) + '</div></div>' +
        '<div class="profile-col"><div class="profile-o3">' + samsungCard() + '</div><div class="profile-o5">' + dataCard() + '</div></div></div></div>';
      wasShown = true;
      const root = el.firstElementChild;
      const slot = n => root.querySelector('[data-slot="' + n + '"]');

      slot('units').appendChild(ui.segmented({ options: [{ value: 'lb', label: 'lb' }, { value: 'kg', label: 'kg' }], value: M.units.unit, ariaLabel: 'Units', onChange: v => { if (editing && edraft) { const h = heightFromDraft(edraft); edraft = Object.assign(edraft, draftFromProfile(Object.assign({}, p, { heightCm: isFinite(h) ? h : p.heightCm }))); } setUnit(v); } }));
      slot('theme').appendChild(ui.segmented({ options: [{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }], value: p.theme || 'system', ariaLabel: 'Theme', onChange: v => M.store.setProfile({ theme: v }) }));

      if (editing) {
        slot('sex').appendChild(ui.segmented({ options: [{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }], value: edraft.sex, block: true, size: 'lg', ariaLabel: 'Sex', onChange: v => { edraft.sex = v; liveBmr(); } }));
        const form = root.querySelector('#pf-form');
        const liveBmr = () => { const b = draftBmr(edraft); const s = root.querySelector('[data-slot="bmr"]'); if (s) s.textContent = b != null ? U.int(b) : '–'; };
        form.addEventListener('input', e => {
          const map = { 'pf-name': 'name', 'pf-age': 'age', 'pf-ft': 'ft', 'pf-in': 'inch', 'pf-cm': 'cm' };
          const k = map[e.target.id]; if (!k) return;
          edraft[k] = e.target.value; ui.fieldError(e.target.id === 'pf-in' ? root.querySelector('#pf-ft') : e.target, ''); liveBmr();
        });
        form.addEventListener('submit', e => {
          e.preventDefault();
          const age = U.parseNum(edraft.age), h = heightFromDraft(edraft);
          let bad = null;
          if (!(age >= 13 && age <= 100)) { ui.fieldError(root.querySelector('#pf-age'), 'Enter an age between 13 and 100.'); bad = bad || '#pf-age'; }
          if (!(h >= 120 && h <= 230)) { const f = root.querySelector('#pf-ft') || root.querySelector('#pf-cm'); ui.fieldError(f, 'Enter a height between 120 and 230 cm (3′11″–7′6″).'); bad = bad || '#' + f.id; }
          if (bad) { root.querySelector(bad).focus(); return; }
          const d = edraft;
          editing = false; edraft = null;
          M.store.setProfile({ name: String(d.name || '').trim(), sex: d.sex === 'female' ? 'female' : 'male', birthYear: YEAR() - Math.round(age), heightCm: Math.round(h * 10) / 10 });
          ui.toast('Body stats saved. Resting burn is now ' + U.int(M.data.bmr()) + ' kcal a day.');
        });
      }

      root.addEventListener('click', async e => {
        const st = e.target.closest('[data-step]');
        if (st) { const g = U.clamp((p.stepGoal || 8000) + 500 * +st.dataset.step, 2000, 30000); M.store.setProfile({ stepGoal: g }); return; }
        const sh = e.target.closest('[data-sh]');
        if (sh) {
          const mode = sh.dataset.sh;
          const s = (M.sheets.samsungImport && typeof M.sheets.samsungImport.open === 'function') ? M.sheets.samsungImport : M.sheets.activity;
          if (s && typeof s.open === 'function') s.open({ mode, date: U.todayKey() });
          else M.openSheet('activity', { mode });
          return;
        }
        const b = e.target.closest('[data-pf]'); if (!b) return;
        const act = b.dataset.pf;
        if (act === 'edit') { editing = true; edraft = draftFromProfile(p); M.render(); setTimeout(() => { const f = document.getElementById('pf-name'); if (f) f.focus(); }, 30); }
        else if (act === 'cancel') { editing = false; edraft = null; M.render(); }
        else if (act === 'export') {
          const ok = download('momentum-' + U.todayKey() + '.csv', buildCSV());
          ui.toast(ok ? 'Export ready: momentum-' + U.todayKey() + '.csv' : 'Your browser blocked the download.');
        } else if (act === 'import') {
          const files = await ui.pickFiles({ accept: '.csv,text/csv' });
          if (!files.length) return;
          try {
            const text = await files[0].text();
            const r = importCSV(text);
            if (r.error) { ui.toast(r.error); return; }
            const parts = [];
            if (r.weights) parts.push(U.plural(r.weights, 'weigh-in'));
            if (r.foods) parts.push(U.plural(r.foods, 'food'));
            if (r.workouts) parts.push(U.plural(r.workouts, 'workout'));
            if (r.activity) parts.push(U.plural(r.activity, 'day') + ' of activity');
            ui.toast(parts.length ? 'Imported ' + parts.join(', ') + '.' : 'Nothing new to import — those entries are already here.');
          } catch (err) { console.error(err); ui.toast('That file couldn’t be read as CSV.'); }
        } else if (act === 'reset') {
          const ok = await ui.confirm({ title: 'Reset all data?', body: 'This permanently deletes your profile, weigh-ins, food, workouts and activity' + (M.state.sync === 'cloud' ? ' on every device' : '') + '. Export a CSV first if you want a copy.', ok: 'Delete everything', cancel: 'Keep my data', danger: true });
          if (!ok) return;
          editing = false; edraft = null;
          await M.store.resetAll();
          location.hash = '#today';
          M.render();
          ui.toast('All data deleted. Let’s start fresh.');
        }
      });
    },
    destroy() { wasShown = false; editing = false; edraft = null; }
  };
})();
