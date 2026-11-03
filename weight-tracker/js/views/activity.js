/* Momentum v2 — ACTIVITY view (#activity) + Add/Edit workout sheet + Samsung Health import sheet.
   Owner: activity builder. Registers M.views.activity, M.sheets.workout (alias addWorkout),
   M.sheets.activity (alias samsungImport). Samsung export parser exposed as M.samsung (parse helpers).
   Styles: css/activity.css (every class prefixed .act-). */
(function () {
  'use strict';
  const M = window.M, U = M.util, ui = M.ui, C = M.calc;
  const esc = U.esc;
  const fin = v => typeof v === 'number' && isFinite(v);
  const today = () => U.todayKey();
  const validPast = k => (U.isValidKey(k) && k <= today()) ? k : today();
  const bodyKg = () => { const k = M.data.currentKg(); return fin(k) ? k : ((M.state.profile && M.state.profile.startKg) || 80); };
  const isLb = () => M.units.unit === 'lb';
  const round1 = v => Math.round(v * 10) / 10;
  const numOrNull = s => { const v = U.parseNum(s); return fin(v) ? v : null; };
  const dayWord = k => k === today() ? 'today' : k === U.addDays(today(), -1) ? 'yesterday' : 'on ' + U.fmtDate(k, { weekday: 'short', month: 'short', day: 'numeric' });

  /* ---------- shared bits ---------- */
  function kv(n, unit, cls) {
    return '<span class="act-kv' + (cls ? ' ' + cls : '') + '"><span class="act-kv-n">' + esc(typeof n === 'string' ? n : U.int(n)) + '</span>' + (unit ? '<span class="act-kv-u">' + esc(unit) + '</span>' : '') + '</span>';
  }
  const TYPE_ICON = { treadmill_walk: 'activity', treadmill_run: 'activity', walk: 'steps', run: 'activity', cycling: 'route', strength: 'dumbbell', swim: 'activity', hiit: 'bolt', yoga: 'heart', other: 'flame' };
  const typeLabel = id => C.workoutType(id).label;
  const isTreadmill = id => id === 'treadmill_walk' || id === 'treadmill_run';
  const SOURCE_LABEL = { 'samsung-screenshot': 'via screenshot', 'samsung-export': 'from data export', manual: 'entered by hand' };

  /** treadmill details live in the note ("3.5 mph · 5% incline · user note") because the store keeps no extra fields */
  const TM_RE = /^(\d+(?:\.\d+)?) (mph|km\/h) · (\d+(?:\.\d+)?)% incline(?: · ([\s\S]*))?$/;
  function splitNote(note) {
    const m = TM_RE.exec(String(note || ''));
    if (!m) return { speed: null, unit: null, incline: null, note: note || '' };
    return { speed: +m[1], unit: m[2], incline: +m[3], note: m[4] || '' };
  }
  function joinNote(type, speed, incline, note) {
    const parts = [];
    if (isTreadmill(type) && fin(speed) && speed > 0) parts.push(round1(speed) + ' ' + (isLb() ? 'mph' : 'km/h') + ' · ' + round1(fin(incline) ? incline : 0) + '% incline');
    if (note && String(note).trim()) parts.push(String(note).trim());
    return parts.join(' · ');
  }

  /** ACSM treadmill equations (walk / run) -> kcal per minute; other types use M.calc METs × intensity */
  const INTENSITY = { easy: 0.8, moderate: 1, hard: 1.2 };
  function kcalPerMinFor(s, kg) {
    if (isTreadmill(s.type) && fin(s.speed) && s.speed > 0) {
      const mph = isLb() ? s.speed : s.speed / 1.609344;
      const m = mph * 26.8224, g = (fin(s.incline) ? s.incline : 0) / 100;
      const run = s.type === 'treadmill_run' || mph >= 4.6;
      const vo2 = run ? 0.2 * m + 0.9 * m * g + 3.5 : 0.1 * m + 1.8 * m * g + 3.5;
      return vo2 * kg / 1000 * 5;
    }
    return C.kcalPerMin(C.workoutType(s.type).met * (INTENSITY[s.intensity] || 1), kg);
  }

  /* =====================================================================
     VIEW
     ===================================================================== */
  let chart = null;

  function dayActiveTotal(key, kg) {
    const d = M.store.getDay(key);
    const a = C.activeFor(d, kg), w = C.workoutsFor(d);
    return { active: a.kcal, workouts: w.kcal, total: a.kcal + w.kcal, has: C.hasActivity(d) || (d.workouts || []).length > 0, steps: a.steps, estimated: a.estimated };
  }

  function headHTML(key) {
    const t = today();
    const prev = U.addDays(key, -1), next = U.addDays(key, 1);
    const label = key === t ? 'Today' : key === U.addDays(t, -1) ? 'Yesterday' : U.fmtDate(key, { weekday: 'short', month: 'short', day: 'numeric' });
    const stepper = '<div class="act-date" role="group" aria-label="Choose day">' +
      '<button type="button" class="btn-icon" data-act-go="' + prev + '" aria-label="Previous day">' + M.icon('back') + '</button>' +
      '<span class="act-date-chip" aria-live="polite">' + esc(label) + '</span>' +
      '<button type="button" class="btn-icon" data-act-go="' + next + '" aria-label="Next day"' + (key >= t ? ' disabled' : '') + '>' + M.icon('chevron') + '</button></div>';
    return '<header class="page-head act-head"><div class="ph-text"><h1>Activity</h1></div><div class="ph-actions">' + stepper + '</div></header>';
  }

  function burnCard(b, key) {
    const isToday = key === today();
    const total = isToday ? b.burnSoFar : b.burnExpected;
    const restVal = isToday ? b.resting : b.bmr;
    const segs = [
      { id: 'rest', label: 'Resting', v: restVal, cls: 'rest' },
      { id: 'active', label: b.steps != null ? (b.activeEstimated ? 'Active (steps, est.)' : 'Active (steps)') : 'Active', v: b.active, cls: 'active' },
      { id: 'workout', label: 'Workouts', v: b.workouts, cls: 'workout' }
    ];
    const sum = segs.reduce((s, x) => s + Math.max(0, x.v || 0), 0) || 1;
    const bar = '<div class="act-bar" role="img" aria-label="' + esc(U.int(total) + ' kcal burned: ' + segs.map(s => s.label + ' ' + U.int(s.v || 0)).join(', ')) + '">' +
      segs.filter(s => s.v > 0).map(s => '<span class="act-bar-seg ' + s.cls + '" style="flex:' + Math.max(0, s.v).toFixed(0) + ' 1 0"></span>').join('') +
      (sum <= 1 ? '<span class="act-bar-seg empty"></span>' : '') + '</div>';
    const rows = segs.map(s => {
      const none = !(s.v > 0);
      let hint = '';
      if (none && s.id === 'active') hint = 'No steps yet';
      if (none && s.id === 'workout') hint = 'None yet';
      return '<li class="act-leg' + (none ? ' none' : '') + '"><span class="dot ' + s.cls + '" aria-hidden="true"></span><span class="act-leg-l">' + esc(s.label) + '</span>' +
        (none ? '<span class="act-leg-none">' + hint + '</span>' : kv(s.v, 'kcal', 'sm')) + '</li>';
    }).join('');
    const excluded = b.workoutsExcluded > 0 ? '<p class="act-fine">' + M.icon('info', 'xs') + '<span>' + U.int(b.workoutsExcluded) + ' kcal of workouts are already inside your Samsung Health active calories, so they aren’t added twice.</span></p>' : '';
    let outlook = '';
    if (isToday && b.burnExpected > b.burnSoFar) outlook = '<p class="act-outlook">On track for about <b>' + U.int(b.burnExpected) + ' kcal</b> by the end of today.</p>';
    // motivation: extra burn needed to hit today's target deficit
    let push = '';
    if (isToday && b.hasFood) {
      const ta = M.data.todayActions();
      const ex = ta && ta.extraBurnForTarget;
      if (ex && ex.kcal >= 20) push = '<div class="act-push"><span class="ic-bubble teal sm">' + M.icon('flame') + '</span><div class="act-push-t"><p class="act-push-h">Burn ' + U.int(ex.kcal) + ' more kcal to hit today’s target</p><p class="act-push-s">≈ ' + ex.treadmillMin + ' min on the treadmill (3.5 mph, 5%) or ≈ ' + U.int(ex.steps) + ' extra steps</p></div></div>';
    }
    return '<section class="card hero act-burn" aria-labelledby="act-burn-t">' +
      '<p class="t-over act-over" id="act-burn-t">' + (isToday ? 'Burned so far today' : 'Burned ' + esc(dayWord(key))) + '</p>' +
      '<p class="act-hero">' + kv(total, 'kcal', 'xl') + '</p>' +
      bar + '<ul class="act-legend">' + rows + '</ul>' + excluded + push +
      '<div class="act-burn-foot">' + outlook + '<p>Resting burn is what your body uses at rest, from your height, age, sex and weight: <b class="nowrap">' + U.int(b.bmr) + ' kcal a day</b>' + (isToday ? ', added as the day goes on.' : '.') + '</p></div>' +
      '</section>';
  }

  function stepsCard(b, key, day) {
    const goal = (M.state.profile && M.state.profile.stepGoal) || 8000;
    const a = day.activity;
    const steps = b.steps;
    const sheetOpts = esc(JSON.stringify({ date: key }));
    if (steps == null) {
      const hasKcal = a && fin(a.activeKcal);
      return '<section class="card act-steps" aria-labelledby="act-steps-t">' +
        '<div class="act-steps-top">' + M.charts.ring({ size: 96, stroke: 10, value: 0, max: 1, color: 'var(--d-active)', track: 'var(--teal-tint)', center: { value: '0%', size: 17 }, ariaLabel: 'No steps yet' }) +
        '<div class="act-steps-txt"><h2 class="t-over" id="act-steps-t">Steps</h2>' +
        '<p class="act-steps-n">' + (hasKcal ? kv(a.activeKcal, 'active kcal', 'lg') : '<span class="act-steps-empty">No steps yet</span>') + '</p>' +
        '<p class="act-steps-s">Goal ' + U.int(goal) + ' steps. Import them from Samsung Health or type them in.</p></div></div>' +
        '<div class="act-steps-actions"><button type="button" class="btn btn-tonal" data-open-sheet="activity" data-sheet-opts=\'' + esc(JSON.stringify({ date: key, mode: 'screenshot' })) + '\'>' + M.icon('upload', 'sm') + '<span class="btn-label">Import steps</span></button>' +
        '<button type="button" class="btn btn-ghost" data-open-sheet="activity" data-sheet-opts=\'' + esc(JSON.stringify({ date: key, mode: 'manual' })) + '\'><span class="btn-label">Type them in</span></button></div>' +
        '</section>';
    }
    const f = steps / goal, pctTxt = Math.round(f * 100) + '%';
    const distKm = a && fin(a.distanceKm) ? a.distanceKm : steps * 0.00075;
    const distTxt = (a && fin(a.distanceKm) ? '' : '≈ ') + M.units.dist(distKm);
    const togo = Math.max(0, goal - steps);
    const line2 = togo > 0 ? U.int(togo) + ' to go, about ' + Math.max(1, Math.round(togo / 105)) + ' min walking' : 'Goal reached. Nice work.';
    const src = a ? (/samsung/.test(a.source) ? 'Samsung Health' : 'Entered by hand') : 'Steps';
    const when = a && fin(a.syncedAt) ? (U.keyOf(a.syncedAt) === today() ? 'Updated ' + U.fmtTime(a.syncedAt) : 'Updated ' + U.relDay(U.keyOf(a.syncedAt))) : '';
    const how = a && /samsung/.test(a.source) ? SOURCE_LABEL[a.source] : '';
    return '<section class="card act-steps" aria-labelledby="act-steps-t">' +
      '<div class="act-steps-top">' + M.charts.ring({ size: 96, stroke: 10, value: Math.min(1, f), max: 1, color: 'var(--d-active)', track: 'var(--teal-tint)', center: { value: esc(pctTxt), size: 17 }, ariaLabel: U.int(steps) + ' of ' + U.int(goal) + ' steps, ' + pctTxt }) +
      '<div class="act-steps-txt"><h2 class="t-over" id="act-steps-t">Steps</h2>' +
      '<p class="act-steps-n"><span class="act-steps-big">' + U.int(steps) + '</span><span class="act-steps-goal">/ ' + U.int(goal) + '</span></p>' +
      '<p class="act-steps-m">' + esc(distTxt) + ' · ' + U.int(b.active) + ' kcal' + (b.activeEstimated ? ' (est.)' : '') + '</p>' +
      '<p class="act-steps-s">' + esc(line2) + '</p></div></div>' +
      '<div class="act-src"><span class="ic-bubble act-round">' + M.icon('phone') + '</span><div class="act-src-t"><p class="act-src-h">' + esc(src) + '</p><p class="act-src-s">' + esc([when, how].filter(Boolean).join(' · ') || 'Saved') + '</p></div>' +
      '<button type="button" class="btn btn-outline btn-sm act-src-btn" data-open-sheet="activity" data-sheet-opts=\'' + sheetOpts + '\'>' + M.icon('sync', 'sm') + '<span class="btn-label">Update</span></button></div>' +
      '</section>';
  }

  function addCard(key) {
    return '<button type="button" class="card interactive act-add" data-open-sheet="workout" data-sheet-opts=\'' + esc(JSON.stringify({ date: key })) + '\'>' +
      '<span class="act-add-ic" aria-hidden="true">' + M.icon('plus', 'lg') + '</span>' +
      '<span class="act-add-t"><span class="act-add-h">Add a workout</span><span class="act-add-s">Photo of your summary, or a quick form</span></span>' +
      M.icon('chevron', 'act-add-chev') + '</button>';
  }

  function workoutRow(w) {
    const sp = splitNote(w.note);
    const sub = [U.fmtTime(w.t), w.minutes ? U.minutes(w.minutes) : '', fin(w.distanceKm) ? M.units.dist(w.distanceKm) : '', fin(w.avgHr) ? w.avgHr + ' bpm' : ''].filter(Boolean).join(' · ');
    const detail = [sp.speed != null ? sp.speed + ' ' + sp.unit + ' · ' + sp.incline + '% incline' : '', sp.note].filter(Boolean).join(' · ');
    const tag = w.countedInSamsung ? '<span class="act-tag sam">' + M.icon('phone', 'xs') + '<span>Counted in Samsung Health, not added again</span></span>'
      : '<span class="act-tag">' + (w.source === 'photo' ? 'From photo' : w.source === 'samsung-export' ? 'Samsung export' : 'Added manually') + '</span>';
    return '<button type="button" class="act-wo" data-act-edit="' + esc(w.id) + '" aria-label="' + esc('Edit ' + (w.name || typeLabel(w.type)) + ', ' + U.int(w.kcal) + ' kcal') + '">' +
      '<span class="act-wo-ic" aria-hidden="true">' + M.icon(TYPE_ICON[C.workoutType(w.type).id] || 'flame') + '</span>' +
      '<span class="act-wo-main"><span class="act-wo-t">' + esc(w.name || typeLabel(w.type)) + '</span><span class="act-wo-s">' + esc(sub) + '</span>' +
      (detail ? '<span class="act-wo-d">' + esc(detail) + '</span>' : '') + tag + '</span>' +
      '<span class="act-wo-end">' + kv(w.kcal, 'kcal', w.countedInSamsung ? 'md muted-kv' : 'md') + M.icon('edit', 'sm act-wo-edit') + '</span></button>';
  }

  function workoutsCard(day, key) {
    const list = (day.workouts || []).slice().sort((a, b) => a.t - b.t);
    const title = key === today() ? 'Workouts today' : 'Workouts ' + dayWord(key);
    const added = list.filter(w => !w.countedInSamsung).reduce((s, w) => s + (w.kcal || 0), 0);
    const meta = list.length ? U.plural(list.length, 'workout') + (added ? ' · ' + U.int(added) + ' kcal' : '') : '';
    const body = list.length ? '<div class="act-wo-list">' + list.map(workoutRow).join('') + '</div>'
      : ui.empty({ icon: 'dumbbell', compact: true, title: 'No workouts ' + (key === today() ? 'yet today' : dayWord(key)), body: 'Logged a session your watch didn’t catch? Add it and its calories count toward your burn.' });
    return '<section class="card act-wos" aria-labelledby="act-wo-t"><div class="card-head"><div class="ch-text"><h2 class="card-title" id="act-wo-t">' + esc(title) + '</h2></div>' +
      (meta ? '<div class="ch-action"><span class="act-meta">' + esc(meta) + '</span></div>' : '') + '</div>' + body + '</section>';
  }

  function weekData(key, kg) {
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const k = U.addDays(key, -i);
      const d = dayActiveTotal(k, kg);
      out.push(Object.assign({ key: k }, d));
    }
    return out;
  }

  function weekCard(key, kg) {
    const wk = weekData(key, kg);
    const t = today();
    const anyData = wk.some(d => d.has);
    if (!anyData) {
      return '<section class="card act-week" aria-labelledby="act-wk-t"><h2 class="card-title" id="act-wk-t">Your week of activity</h2>' +
        ui.empty({ icon: 'progress', compact: true, title: 'Nothing to chart yet', body: 'Import steps from Samsung Health or add a workout. Each day becomes a bar here, so you can see your most active days.' }) + '</section>';
    }
    const inProgress = d => d.key === t;
    const done = wk.filter(d => d.has && !inProgress(d));
    const avg = done.length ? Math.round(U.mean(done.map(d => d.total))) : null;
    const best = done.length ? done.reduce((a, b2) => b2.total > a.total ? b2 : a) : null;
    const cur = wk[wk.length - 1];
    let title;
    const wd = k => k === t ? 'Today' : k === U.addDays(t, -1) ? 'Yesterday' : U.fmtDate(k, { weekday: 'long' });
    if (!best) title = (cur.key === t ? 'Today so far: ' : wd(cur.key) + ': ') + U.int(cur.total) + ' active kcal';
    else if (cur.has && cur.total > best.total) title = (cur.key === t ? 'Today is' : wd(cur.key) + ' was') + ' your most active day this week';
    else title = 'Most active: ' + wd(best.key) + ', ' + U.int(best.total) + ' kcal';
    let takeaway = '';
    if (avg != null && cur.has) {
      const diff = cur.total - avg;
      const who = cur.key === t ? 'Today you’re' : wd(cur.key) + ' was';
      if (Math.abs(diff) < 25) takeaway = who + ' right on your ' + done.length + '-day average.';
      else takeaway = who + ' <b>' + U.int(Math.abs(diff)) + ' kcal ' + (diff > 0 ? 'above' : 'below') + '</b> your ' + done.length + '-day average' + (cur.key === t && diff < 0 ? ' so far.' : '.');
    } else if (avg != null) takeaway = 'No activity logged ' + dayWord(cur.key) + ' yet. Your ' + done.length + '-day average is <b>' + U.int(avg) + ' kcal</b>.';
    const sub = '<p class="act-week-sub"><span>Active calories, last 7 days</span>' + (avg != null ? '<span class="act-dash" aria-hidden="true"></span><span class="nowrap">avg ' + U.int(avg) + '</span>' : '') + '</p>';
    return '<section class="card act-week" aria-labelledby="act-wk-t"><div class="act-week-head"><h2 class="card-title balance" id="act-wk-t">' + esc(title) + '</h2>' + sub + '</div>' +
      '<div class="act-chart" id="act-chart"></div>' + (takeaway ? '<p class="act-week-take">' + takeaway + '</p>' : '') + '</section>';
  }

  function drawChart(el, key, kg) {
    const host = el.querySelector('#act-chart'); if (!host) return;
    const wk = weekData(key, kg), t = today();
    const done = wk.filter(d => d.has && d.key !== t);
    const avg = done.length ? Math.round(U.mean(done.map(d => d.total))) : null;
    let bestKey = null;
    if (done.length) bestKey = done.reduce((a, b) => b.total > a.total ? b : a).key;
    const cur = wk[wk.length - 1];
    if (cur.has && (!bestKey || cur.total > (wk.find(d => d.key === bestKey) || {}).total)) bestKey = cur.key;
    const bars = wk.map(d => ({
      key: d.key, label: d.key === t ? 'Today' : U.fmtDate(d.key, { weekday: 'short' }), value: d.total,
      highlight: d.key === bestKey, muted: d.key === t && d.key !== bestKey,
      color: d.key === bestKey ? 'var(--d-workout)' : 'var(--d-active)', _d: d
    }));
    const opts = {
      bars, height: 168, valueFmt: U.int, labels: 'auto',
      ref: avg != null ? { value: avg, label: 'avg ' + U.int(avg) } : null,
      ariaLabel: 'Active calories per day: ' + bars.map(b => b.label + ' ' + U.int(b.value)).join(', ') + (avg != null ? '. Average ' + U.int(avg) + '.' : ''),
      tip: b => {
        const d = b._d;
        if (!d.has) return { title: U.relDay(d.key), rows: [['Activity', 'Nothing logged']] };
        const rows = [['Steps & activity', U.int(d.active) + ' kcal']];
        if (d.workouts) rows.push(['Workouts', U.int(d.workouts) + ' kcal']);
        if (d.steps != null) rows.push(['Steps', U.int(d.steps)]);
        return { title: U.relDay(d.key) + (d.key === t ? ' (so far)' : ''), rows };
      }
    };
    if (chart && chart._host === host) chart.update(opts);
    else { if (chart) try { chart.destroy(); } catch (e) {} chart = M.charts.barChart(host, opts); chart._host = host; }
  }

  function samsungCard(key) {
    const o = m => esc(JSON.stringify({ date: key, mode: m }));
    return '<section class="card act-sam" aria-labelledby="act-sam-t"><div class="act-sam-head"><span class="ic-bubble act-round">' + M.icon('phone') + '</span><h2 class="card-title" id="act-sam-t">Import from Samsung Health</h2></div>' +
      '<p class="act-sam-p">Samsung Health can’t connect directly to web apps. Import a screenshot or your data export and we’ll read your steps and calories.</p>' +
      '<div class="act-sam-btns"><button type="button" class="btn btn-outline" data-open-sheet="activity" data-sheet-opts=\'' + o('screenshot') + '\'>' + M.icon('camera', 'sm') + '<span class="btn-label">Screenshot</span></button>' +
      '<button type="button" class="btn btn-outline" data-open-sheet="activity" data-sheet-opts=\'' + o('export') + '\'>' + M.icon('upload', 'sm') + '<span class="btn-label">Data export</span></button></div>' +
      '<button type="button" class="link-btn act-sam-manual" data-open-sheet="activity" data-sheet-opts=\'' + o('manual') + '\'>Or type in steps and active calories' + M.icon('chevron', 'sm') + '</button>' +
      '</section>';
  }

  M.views.activity = {
    title: 'Activity',
    narrow: false,
    render(el, ctx) {
      const key = validPast(ctx && ctx.params && ctx.params.date);
      const b = M.data.balance(key);
      const day = M.store.getDay(key);
      const kg = bodyKg();
      const html = '<div class="view act-view">' + headHTML(key) +
        '<div class="act-grid">' +
        '<div class="act-col act-col-a">' +
        '<div class="act-o1">' + burnCard(b, key) + '</div>' +
        '<div class="act-o5">' + weekCard(key, kg) + '</div>' +
        '</div>' +
        '<div class="act-col act-col-b">' +
        '<div class="act-o3">' + addCard(key) + '</div>' +
        '<div class="act-o2">' + stepsCard(b, key, day) + '</div>' +
        '<div class="act-o4">' + workoutsCard(day, key) + '</div>' +
        '<div class="act-o6">' + samsungCard(key) + '</div>' +
        '</div></div></div>';
      if (chart) { try { chart.destroy(); } catch (e) {} chart = null; }
      el.innerHTML = html;
      drawChart(el, key, kg);
      if (!el._actBound) {
        el._actBound = true;
        el.addEventListener('click', e => {
          const go = e.target.closest('[data-act-go]');
          if (go && !go.disabled) { const k = go.dataset.actGo; M.go('activity', k >= today() ? {} : { date: k }); return; }
          const ed = e.target.closest('[data-act-edit]');
          if (ed) { workoutSheet.open({ id: ed.dataset.actEdit }); }
        });
      }
    },
    destroy() { if (chart) { try { chart.destroy(); } catch (e) {} chart = null; } }
  };

  /* =====================================================================
     WORKOUT SHEET  (photo → review, or form; add or edit)
     ===================================================================== */
  const FORM_TYPES = ['treadmill_walk', 'treadmill_run', 'walk', 'run', 'cycling', 'strength', 'swim', 'hiit', 'yoga', 'other'];
  const TM_DEFAULT = { treadmill_walk: { lb: [3.5, 5], kg: [5.6, 5] }, treadmill_run: { lb: [6, 1], kg: [9.7, 1] } };

  function impactHTML(s, kcal) {
    const b = M.data.balance(s.date);
    let prev = 0;
    if (s.id) { const f = M.store.findItem('workouts', s.id); if (f && !f.item.countedInSamsung && f.key === s.date) prev = f.item.kcal || 0; }
    const add = (s.counted ? 0 : (fin(kcal) ? kcal : 0)) - prev;
    const isT = s.date === today();
    const burn = isT ? b.burnSoFar : b.burnExpected, def = isT ? b.deficitSoFar : b.deficitExpected;
    const arrow = (a, d) => d === 0 ? '<b>' + U.int(a) + '</b>' : U.int(a) + ' <span aria-hidden="true">→</span><span class="sr-only">to</span> <b>' + U.int(a + d) + '</b>';
    return '<div class="act-impact" aria-live="polite"><div><span>' + (isT ? 'Today’s burn' : 'Burn ' + esc(dayWord(s.date))) + '</span><span class="act-impact-v">' + arrow(burn, add) + ' <small>kcal</small></span></div>' +
      '<div><span>' + (def >= 0 ? 'Deficit' : 'Surplus') + (isT ? ' so far' : '') + '</span><span class="act-impact-v">' + arrow(def, add) + ' <small>kcal</small></span></div></div>';
  }
  function countedHelp(s, kcal) {
    return s.counted ? 'We’ll list this workout but won’t add its ' + (fin(kcal) ? U.int(kcal) + ' ' : '') + 'kcal again, because Samsung Health already counted it in your active calories.'
      : 'Turn this on if your watch already synced this workout to Samsung Health, so it isn’t counted twice.';
  }

  const workoutSheet = {
    open(opts) {
      opts = opts || {};
      const prof = M.state.profile || {};
      let existing = null;
      if (opts.id) { const f = M.store.findItem('workouts', opts.id); if (f) existing = f.item; }
      const now = Date.now();
      const s = {
        id: existing ? existing.id : null,
        mode: existing ? 'form' : (opts.mode === 'manual' || opts.mode === 'form' ? 'form' : opts.mode === 'photo' ? 'photo' : (M.ai.state.images === false || M.ai.state.available === false ? 'form' : 'photo')),
        stage: 'pick', file: null, preview: '', thumb: null, ctl: null, aiNote: '', confidence: null,
        type: 'treadmill_walk', name: '', date: validPast(opts.date), time: '', minutes: 30, speed: null, incline: null,
        intensity: 'moderate', kcal: null, estimated: true, distance: null, hr: null, note: '', counted: false, more: false, source: 'manual'
      };
      s.time = s.date === today() ? U.hhmm(now) : '18:00';
      const u = isLb() ? 'lb' : 'kg';
      if (existing) {
        const sp = splitNote(existing.note);
        Object.assign(s, {
          type: C.workoutType(existing.type).id, name: existing.name || '', date: U.keyOf(existing.t), time: U.hhmm(existing.t), minutes: existing.minutes || null,
          kcal: existing.kcal, estimated: false, distance: fin(existing.distanceKm) ? round1(M.units.distTo(existing.distanceKm)) : null, hr: existing.avgHr || null,
          note: sp.note, counted: !!existing.countedInSamsung, source: existing.source || 'manual', thumb: existing.thumb || null
        });
        if (sp.speed != null) { s.speed = sp.speed; s.incline = sp.incline; }
        s.more = !!(s.distance || s.hr || s.note || s.counted);
      }
      if (s.speed == null && isTreadmill(s.type)) { s.speed = TM_DEFAULT[s.type][u][0]; s.incline = TM_DEFAULT[s.type][u][1]; }

      const sheet = ui.sheet({
        title: existing ? 'Edit workout' : 'Add a workout',
        body: '', foot: '',
        onClose() { if (s.ctl) try { s.ctl.abort(); } catch (e) {} if (s.preview) try { URL.revokeObjectURL(s.preview); } catch (e) {} }
      });
      sheet.el.classList.add('act-sheet');

      const est = () => Math.round(kcalPerMinFor(s, bodyKg()) * (+s.minutes || 0));
      const curKcal = () => s.estimated ? (s.minutes > 0 ? est() : null) : s.kcal;

      function aiBlockedNotice() {
        if (M.ai.state.available === false) return '<div class="notice brand">' + M.icon('info') + '<div>' + esc(M.ai.UNAVAILABLE_TEXT) + ' Use the form instead.</div></div>';
        if (M.ai.state.images === false) return '<div class="notice brand">' + M.icon('info') + '<div>Photos can’t be read here. Use the form instead.</div></div>';
        return '';
      }

      function typeOptions(sel) { return FORM_TYPES.map(id => '<option value="' + id + '"' + (id === sel ? ' selected' : '') + '>' + esc(typeLabel(id)) + '</option>').join(''); }

      function photoPick() {
        const blocked = aiBlockedNotice();
        if (blocked) return blocked + '<button type="button" class="btn btn-tonal" data-w="to-form">' + M.icon('form', 'sm') + '<span class="btn-label">Fill in the form</span></button>';
        return '<button type="button" class="dropzone act-drop" data-w="pick">' + '<span class="ic-bubble brand act-drop-ic">' + M.icon('camera', 'lg') + '</span>' +
          '<span class="act-drop-h">Take or choose a photo</span><span class="act-drop-s">Your watch, phone app or treadmill summary. We’ll read the calories, time and other stats.</span></button>' +
          '<p class="hint act-center">Only a tiny thumbnail is kept. The photo itself isn’t stored.</p>';
      }
      function photoThinking() {
        return '<div class="act-photo-row">' + (s.preview ? '<img class="act-photo" src="' + esc(s.preview) + '" alt="Your workout photo">' : '') +
          '<div class="act-photo-t"><div class="thinking" role="status"><span class="spinner" aria-hidden="true"></span><span>Reading your photo…</span></div>' +
          '<p class="hint">This usually takes 5 to 30 seconds.</p><button type="button" class="btn btn-secondary btn-sm" data-w="cancel">Cancel</button></div></div>';
      }
      function field(id, label, input, suffix) {
        return '<div class="act-f"><label class="act-f-l" for="' + id + '">' + esc(label) + '</label><div class="act-f-in">' + input + (suffix ? '<span class="act-f-u" aria-hidden="true">' + esc(suffix) + '</span>' : '') + '</div></div>';
      }
      const numIn = (id, v, dec, ph) => '<input class="act-f-input num" id="' + id + '" inputmode="' + (dec ? 'decimal' : 'numeric') + '" autocomplete="off" value="' + (fin(v) ? esc(String(v)) : '') + '" placeholder="' + esc(ph || '–') + '">';
      function photoReview() {
        const conf = s.confidence === 'low' ? '<div class="notice warn">' + M.icon('alert') + '<div>Some numbers were hard to read. Please double-check them.</div></div>' : '';
        return '<div class="act-photo-row">' + (s.preview || s.thumb ? '<img class="act-photo" src="' + esc(s.preview || s.thumb) + '" alt="Your workout photo">' : '') +
          '<div class="act-photo-t"><h3 class="act-photo-h">Read from your photo</h3><p class="hint">Check each value. Tap any field to fix it.</p>' +
          '<button type="button" class="link-btn" data-w="pick">' + M.icon('image', 'sm') + 'Replace photo</button></div></div>' + conf +
          '<div class="act-fields">' +
          field('wp-type', 'Type', '<select class="act-f-input act-f-select" id="wp-type">' + typeOptions(s.type) + '</select>') +
          field('wp-date', 'Date', '<input class="act-f-input" type="date" id="wp-date" max="' + today() + '" value="' + esc(s.date) + '">') +
          field('wp-time', 'Time', '<input class="act-f-input" type="time" id="wp-time" value="' + esc(s.time) + '">') +
          field('wp-min', 'Duration', numIn('wp-min', s.minutes, false), 'min') +
          field('wp-dist', 'Distance', numIn('wp-dist', s.distance, true), M.units.distUnit()) +
          field('wp-kcal', 'Calories', numIn('wp-kcal', curKcal(), false), 'kcal') +
          field('wp-hr', 'Avg heart rate', numIn('wp-hr', s.hr, false), 'bpm') +
          '</div>' + countedToggle() + '<div data-slot="impact">' + impactHTML(s, curKcal()) + '</div>';
      }
      function countedToggle() {
        return '<div class="act-counted"><label class="toggle"><span class="act-counted-l">Already counted in Samsung Health</span><input type="checkbox" id="w-counted"' + (s.counted ? ' checked' : '') + '><span class="track"></span></label>' +
          '<p class="hint" data-slot="counted-help">' + esc(countedHelp(s, curKcal())) + '</p></div>';
      }
      function kcalHelp() {
        const k = curKcal();
        if (s.estimated && s.minutes > 0) return '≈ ' + round1(kcalPerMinFor(s, bodyKg())) + ' kcal/min × ' + U.int(s.minutes) + ' min, from your weight' + (isTreadmill(s.type) ? ', speed and incline' : ' and effort') + '.';
        if (fin(k)) return 'From your machine or watch. Tap “Estimate for me” to calculate it instead.';
        return 'Copy it from your machine or watch, or tap “Estimate for me”.';
      }
      function formBody() {
        const chips = '<fieldset class="act-fs"><legend class="label">Workout type</legend><div class="chips act-types" role="group" aria-label="Workout type">' +
          FORM_TYPES.map(id => '<button type="button" class="chip" data-type="' + id + '" aria-pressed="' + (id === s.type) + '">' + esc(typeLabel(id)) + '</button>').join('') + '</div></fieldset>';
        const when = '<div class="field-row act-row3">' +
          ui.field({ id: 'wf-min', label: 'Duration', input: '<div class="input-wrap">' + '<input class="input num-input" id="wf-min" inputmode="numeric" autocomplete="off" value="' + (fin(s.minutes) ? s.minutes : '') + '" placeholder="30"><span class="suffix">min</span></div>' }) +
          ui.field({ id: 'wf-date', label: 'Date', input: '<input class="input" type="date" id="wf-date" max="' + today() + '" value="' + esc(s.date) + '">' }) +
          ui.field({ id: 'wf-time', label: 'Time', input: '<input class="input" type="time" id="wf-time" value="' + esc(s.time) + '">' }) + '</div>';
        const intensity = isTreadmill(s.type) ? '<div class="field-row">' +
          ui.field({ id: 'wf-speed', label: 'Speed', input: '<div class="input-wrap"><input class="input num-input" id="wf-speed" inputmode="decimal" autocomplete="off" value="' + (fin(s.speed) ? s.speed : '') + '"><span class="suffix">' + (isLb() ? 'mph' : 'km/h') + '</span></div>' }) +
          ui.field({ id: 'wf-incline', label: 'Incline', input: '<div class="input-wrap"><input class="input num-input" id="wf-incline" inputmode="decimal" autocomplete="off" value="' + (fin(s.incline) ? s.incline : '') + '"><span class="suffix">%</span></div>' }) + '</div>'
          : '<div class="field"><p class="label" id="wf-int-l">Effort</p><div class="seg block" role="group" aria-labelledby="wf-int-l">' +
          [['easy', 'Easy'], ['moderate', 'Moderate'], ['hard', 'Hard']].map(x => '<button type="button" class="seg-btn" data-int="' + x[0] + '" aria-pressed="' + (s.intensity === x[0]) + '">' + x[1] + '</button>').join('') + '</div></div>';
        const k = curKcal();
        const kcalF = '<div class="field"><div class="act-kcal-head"><label class="label" for="wf-kcal">Calories burned</label><button type="button" class="link-btn" data-w="estimate"' + (s.estimated ? ' aria-pressed="true"' : '') + '>' + M.icon('sparkle', 'sm') + 'Estimate for me</button></div>' +
          '<div class="input-wrap"><input class="input num-input act-kcal-in" id="wf-kcal" inputmode="numeric" autocomplete="off" placeholder="0" value="' + (fin(k) ? k : '') + '" aria-describedby="wf-kcal-help"><span class="suffix">kcal</span></div>' +
          '<p class="hint" id="wf-kcal-help" data-slot="kcal-help">' + esc(kcalHelp()) + '</p><p class="error-text" id="wf-kcal-err" hidden></p></div>';
        const more = '<button type="button" class="act-more" data-w="more" aria-expanded="' + s.more + '"><span>More details <span class="muted">(optional)</span></span>' + M.icon('down', 'sm act-more-ic') + '</button>' +
          (s.more ? '<div class="act-more-body">' +
            '<div class="field-row">' +
            ui.field({ id: 'wf-dist', label: 'Distance', input: '<div class="input-wrap"><input class="input num-input" id="wf-dist" inputmode="decimal" autocomplete="off" placeholder="0.0" value="' + (fin(s.distance) ? s.distance : '') + '"><span class="suffix">' + M.units.distUnit() + '</span></div>' }) +
            ui.field({ id: 'wf-hr', label: 'Avg heart rate', input: '<div class="input-wrap"><input class="input num-input" id="wf-hr" inputmode="numeric" autocomplete="off" placeholder="0" value="' + (fin(s.hr) ? s.hr : '') + '"><span class="suffix">bpm</span></div>' }) + '</div>' +
            ui.field({ id: 'wf-note', label: 'Note', input: '<input class="input" id="wf-note" maxlength="200" placeholder="e.g. Evening walk, felt easy" value="' + esc(s.note) + '">' }) +
            countedToggle() + '</div>' : '');
        return '<div class="form act-form">' + chips + when + intensity + kcalF + more + '<div data-slot="impact">' + impactHTML(s, curKcal()) + '</div></div>';
      }

      function ctaLabel() {
        const k = curKcal();
        if (s.id) return 'Save changes';
        if (s.counted || !(k > 0)) return 'Save workout';
        return 'Add ' + U.int(k) + ' kcal workout';
      }
      function paint(focusSel) {
        const showSeg = !s.id;
        const seg = showSeg ? '<div class="seg block lg act-mode" role="group" aria-label="How to add"><button type="button" class="seg-btn" data-mode="photo" aria-pressed="' + (s.mode === 'photo') + '">' + 'Photo</button><button type="button" class="seg-btn" data-mode="form" aria-pressed="' + (s.mode === 'form') + '">Form</button></div>' : '';
        let body;
        if (s.mode === 'photo') body = s.stage === 'thinking' ? photoThinking() : s.stage === 'review' ? photoReview() : photoPick();
        else body = formBody();
        sheet.setBody(seg + body);
        // footer
        const showCta = s.mode === 'form' || s.stage === 'review';
        if (showCta) {
          const f = document.createDocumentFragment();
          if (s.id) f.appendChild(ui.h('button', { type: 'button', class: 'btn btn-ghost act-del', 'data-w': 'delete', html: M.icon('trash', 'sm') + '<span class="btn-label">Delete</span>' }));
          f.appendChild(ui.h('button', { type: 'button', class: 'btn btn-primary', 'data-w': 'save', html: '<span class="btn-label" data-slot="cta">' + esc(ctaLabel()) + '</span>' }));
          sheet.setFoot(f);
        } else sheet.setFoot(null);
        if (focusSel) { const x = sheet.el.querySelector(focusSel); if (x) try { x.focus({ preventScroll: true }); } catch (e) {} }
      }
      function refreshDerived() {
        const k = curKcal();
        const q = sel => sheet.el.querySelector(sel);
        if (s.estimated) { const ki = q('#wf-kcal') || q('#wp-kcal'); if (ki && document.activeElement !== ki) ki.value = fin(k) ? k : ''; }
        const kh = q('[data-slot="kcal-help"]'); if (kh) kh.textContent = kcalHelp();
        const ch = q('[data-slot="counted-help"]'); if (ch) ch.textContent = countedHelp(s, k);
        const im = q('[data-slot="impact"]'); if (im) im.innerHTML = impactHTML(s, k);
        const cta = q('[data-slot="cta"]'); if (cta) cta.textContent = ctaLabel();
        const eb = q('[data-w="estimate"]'); if (eb) { if (s.estimated) eb.setAttribute('aria-pressed', 'true'); else eb.removeAttribute('aria-pressed'); }
      }

      async function pickPhoto(fileArg) {
        let file = fileArg;
        if (!file) {
          const files = await ui.pickFiles({ accept: 'image/*' });
          file = files[0];
        }
        if (!file) return;
        if (s.ctl) try { s.ctl.abort(); } catch (e) {}
        if (s.preview) try { URL.revokeObjectURL(s.preview); } catch (e) {}
        s.file = file; s.preview = ui.previewURL(file); s.stage = 'thinking'; s.thumb = null;
        paint('[data-w="cancel"]');
        ui.thumb(file).then(t => { s.thumb = t; }, () => {});
        const ctl = s.ctl = new AbortController();
        try {
          const r = await M.ai.analyzeWorkoutPhoto(file, { signal: ctl.signal });
          if (ctl !== s.ctl || sheet.closed) return;
          s.ctl = null;
          s.type = r.type || 'other'; s.name = r.name || '';
          if (fin(r.minutes)) s.minutes = Math.round(r.minutes);
          if (fin(r.kcal)) { s.kcal = r.kcal; s.estimated = false; } else s.estimated = true;
          s.distance = fin(r.distanceKm) ? round1(M.units.distTo(r.distanceKm)) : null;
          s.hr = fin(r.avgHr) ? Math.round(r.avgHr) : null;
          if (r.date && r.date <= today()) s.date = r.date;
          if (r.time) s.time = r.time.length === 4 ? '0' + r.time : r.time;
          s.note = r.note || ''; s.confidence = r.confidence; s.source = 'photo';
          if (isTreadmill(s.type) && s.speed == null) { s.speed = TM_DEFAULT[s.type][u][0]; s.incline = TM_DEFAULT[s.type][u][1]; }
          if (!fin(s.kcal) && !(s.minutes > 0)) ui.toast('No calories were visible. Add them, or switch to the form to estimate.');
          s.stage = 'review';
          paint();
        } catch (e) {
          if (ctl !== s.ctl || sheet.closed) return;
          s.ctl = null;
          if (e && e.code === 'cancelled') { s.stage = 'pick'; paint(); return; }
          if (e && M.ai.isFatal(e.code)) { s.mode = 'form'; s.stage = 'pick'; paint(); ui.toast(e.message || M.ai.UNAVAILABLE_TEXT); return; }
          s.stage = 'pick'; paint();
          ui.toast((e && e.message) || 'That photo couldn’t be read. Try another one.');
        }
      }

      function readInputs() {
        const q = sel => sheet.el.querySelector(sel);
        const pre = s.mode === 'photo' ? 'wp-' : 'wf-';
        const v = id => { const x = q('#' + pre + id); return x ? x.value : null; };
        if (v('min') != null) s.minutes = numOrNull(v('min'));
        if (v('date') != null && U.isValidKey(v('date'))) s.date = v('date');
        if (v('time') != null && /^\d{2}:\d{2}$/.test(v('time'))) s.time = v('time');
        if (v('dist') != null) s.distance = numOrNull(v('dist'));
        if (v('hr') != null) s.hr = numOrNull(v('hr'));
        if (v('note') != null) s.note = v('note');
        if (v('speed') != null) s.speed = numOrNull(v('speed'));
        if (v('incline') != null) s.incline = numOrNull(v('incline'));
        if (!s.estimated && v('kcal') != null) s.kcal = numOrNull(v('kcal'));
        const t = q('#wp-type'); if (t) s.type = t.value;
      }

      async function save() {
        readInputs();
        const kIn = sheet.el.querySelector('#wf-kcal') || sheet.el.querySelector('#wp-kcal');
        const k = curKcal();
        if (!fin(k) || k < 0 || k > 5000) {
          if (kIn) { if (kIn.id === 'wf-kcal') ui.fieldError(kIn, 'Enter the calories burned, or tap Estimate for me.'); else ui.toast('Enter the calories burned.'); kIn.focus(); }
          return;
        }
        if (s.date > today()) { ui.toast('Workouts can’t be in the future.'); return; }
        let t = U.timeOn(s.date, s.time || '12:00');
        if (t > Date.now()) t = Date.now();
        const item = {
          type: s.type, name: s.source === 'photo' && s.name ? s.name : typeLabel(s.type), minutes: fin(s.minutes) ? Math.max(0, Math.round(s.minutes)) : 0,
          kcal: Math.round(k), t, distanceKm: fin(s.distance) && s.distance > 0 ? M.units.distFrom(s.distance) : null,
          avgHr: fin(s.hr) ? s.hr : null, note: joinNote(s.type, s.speed, s.incline, s.note), source: s.source, countedInSamsung: !!s.counted
        };
        if (s.thumb) item.thumb = s.thumb;
        if (s.id) {
          M.store.updateItem('workouts', s.id, item);
          sheet.close();
          ui.toast('Workout updated');
        } else {
          const saved = M.store.addItem('workouts', item);
          sheet.close();
          ui.toast(s.counted ? 'Workout saved. Its calories were already counted.' : 'Workout added: +' + U.int(k) + ' kcal burned', saved ? { action: { label: 'Undo', fn: () => M.store.removeItem('workouts', saved.id) } } : {});
          if (s.date !== today() && location.hash.indexOf('#activity') === 0) M.go('activity', { date: s.date });
        }
      }
      async function del() {
        const ok = await ui.confirm({ title: 'Delete this workout?', body: 'Its calories come off your burn for that day.', ok: 'Delete', danger: true });
        if (!ok) return;
        const undo = M.store.removeItem('workouts', s.id);
        sheet.close();
        ui.toast('Workout deleted', { action: { label: 'Undo', fn: undo } });
      }

      sheet.el.addEventListener('click', e => {
        const m = e.target.closest('[data-mode]');
        if (m) { readInputs(); if (s.mode !== m.dataset.mode) { s.mode = m.dataset.mode; if (s.mode === 'form' && s.ctl) { try { s.ctl.abort(); } catch (er) {} s.ctl = null; s.stage = 'pick'; } paint(); } return; }
        const ty = e.target.closest('[data-type]');
        if (ty) {
          readInputs();
          s.type = ty.dataset.type;
          if (isTreadmill(s.type)) { s.speed = TM_DEFAULT[s.type][u][0]; s.incline = TM_DEFAULT[s.type][u][1]; }
          paint('[data-type="' + s.type + '"]'); return;
        }
        const it = e.target.closest('[data-int]');
        if (it) { readInputs(); s.intensity = it.dataset.int; sheet.el.querySelectorAll('[data-int]').forEach(b => b.setAttribute('aria-pressed', String(b === it))); refreshDerived(); return; }
        const w = e.target.closest('[data-w]'); if (!w) return;
        const act = w.dataset.w;
        if (act === 'pick') pickPhoto();
        else if (act === 'cancel') { if (s.ctl) try { s.ctl.abort(); } catch (er) {} s.ctl = null; s.stage = 'pick'; paint(); }
        else if (act === 'to-form') { s.mode = 'form'; paint(); }
        else if (act === 'estimate') { readInputs(); s.estimated = true; const ki = sheet.el.querySelector('#wf-kcal'); if (ki) { ui.fieldError(ki, ''); ki.value = fin(curKcal()) ? curKcal() : ''; } refreshDerived(); }
        else if (act === 'more') { readInputs(); s.more = !s.more; paint('[data-w="more"]'); }
        else if (act === 'save') save();
        else if (act === 'delete') del();
      });
      sheet.el.addEventListener('input', e => {
        const id = e.target.id;
        if (id === 'wf-kcal' || id === 'wp-kcal') { s.estimated = false; s.kcal = numOrNull(e.target.value); if (id === 'wf-kcal') ui.fieldError(e.target, ''); }
        else if (id === 'w-counted') s.counted = e.target.checked;
        else readInputs();
        refreshDerived();
      });
      sheet.el.addEventListener('change', e => {
        if (e.target.id === 'w-counted') { s.counted = e.target.checked; refreshDerived(); }
        if (e.target.id === 'wp-type') { s.type = e.target.value; refreshDerived(); }
        if (e.target.id === 'wf-date' || e.target.id === 'wp-date') { readInputs(); refreshDerived(); }
      });
      // drag & drop a photo onto the drop zone (desktop)
      sheet.el.addEventListener('dragover', e => { const z = e.target.closest('.act-drop'); if (z) { e.preventDefault(); z.classList.add('over'); } });
      sheet.el.addEventListener('dragleave', e => { const z = e.target.closest('.act-drop'); if (z) z.classList.remove('over'); });
      sheet.el.addEventListener('drop', e => { const z = e.target.closest('.act-drop'); if (!z) return; e.preventDefault(); const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f && /^image\//.test(f.type)) pickPhoto(f); });
      sheet.el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input.input, input.act-f-input') && (s.mode === 'form' || s.stage === 'review')) { e.preventDefault(); save(); } });

      paint();
      return sheet;
    }
  };
  M.sheets.workout = workoutSheet;
  M.sheets.addWorkout = workoutSheet;

  /* =====================================================================
     SAMSUNG HEALTH: export CSV parsing (pure, tolerant)
     ===================================================================== */
  /** split CSV text into rows of fields (handles quotes, CRLF, embedded commas/newlines) */
  function csvRows(text) {
    const rows = []; let row = [], f = '', q = false;
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
  const normCol = c => String(c || '').trim().toLowerCase().split('.').pop();
  /** find the header row: the first of the first 3 rows that has ≥ 3 identifier-like columns incl. a known one */
  function table(text) {
    const rows = csvRows(text);
    let hi = -1;
    for (let i = 0; i < Math.min(3, rows.length); i++) {
      const cols = rows[i].map(normCol);
      if (cols.some(c => /^(day_time|start_time|count|step_count|duration|calorie|create_time|update_time)$/.test(c)) && cols.filter(c => /^[a-z_][a-z0-9_]*$/.test(c)).length >= 3) { hi = i; break; }
    }
    if (hi < 0) return null;
    const cols = rows[hi].map(normCol);
    const idx = {}; cols.forEach((c, i) => { if (c && !(c in idx)) idx[c] = i; });
    return { idx, cols, rows: rows.slice(hi + 1) };
  }
  const cell = (r, idx, ...names) => { for (const n of names) if (n in idx) { const v = r[idx[n]]; if (v != null && String(v).trim() !== '') return String(v).trim(); } return null; };
  const cnum = (r, idx, ...names) => { const v = cell(r, idx, ...names); if (v == null) return null; const n = parseFloat(v); return isFinite(n) ? n : null; };
  /** Samsung timestamps: epoch ms (or s) numbers, or "YYYY-MM-DD HH:MM:SS.sss" in UTC */
  function parseTs(v) {
    if (v == null) return null;
    const s = String(v).trim();
    if (/^\d{9,14}(\.\d+)?$/.test(s)) { const n = +s; return n < 1e11 ? n * 1000 : n; }
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/.exec(s);
    if (!m) return null;
    let t = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0), m[7] ? +String(m[7]).slice(0, 3).padEnd(3, '0') : 0);
    if (m[8] && m[8] !== 'Z') { const sg = m[8][0] === '-' ? -1 : 1; const hh = +m[8].slice(1, 3), mm = +m[8].replace(':', '').slice(3, 5); t -= sg * (hh * 60 + mm) * 60000; }
    return t;
  }
  /** day_time is the user's calendar day stored as UTC midnight -> key from its UTC date */
  function dayKeyOf(v) {
    if (v == null) return null;
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const t = parseTs(s); if (t == null) return null;
    const d = new Date(t);
    return d.getUTCFullYear() + '-' + U.pad2(d.getUTCMonth() + 1) + '-' + U.pad2(d.getUTCDate());
  }
  const EXERCISE_TYPES = { 1001: 'walk', 1002: 'run', 11007: 'cycling', 13001: 'walk', 14001: 'swim', 14002: 'swim', 9002: 'yoga', 15005: 'treadmill_walk', 15006: 'cycling', 15003: 'other', 10007: 'strength', 0: 'other' };
  function exerciseType(code, title) {
    const n = parseInt(code, 10);
    if (isFinite(n) && EXERCISE_TYPES[n]) return EXERCISE_TYPES[n];
    if (isFinite(n) && n >= 10001 && n <= 10026) return 'strength';
    return C.workoutType(title || '').id;
  }
  function kindOf(name, t) {
    const n = String(name || '').toLowerCase();
    const has = c => c in t.idx;
    if (/day_summary/.test(n) && has('day_time')) return 'summary';
    if (/step_daily_trend/.test(n) || (has('day_time') && (has('count') || has('step_count')) && !has('start_time'))) return 'steps';
    if (/exercise/.test(n) && has('start_time') && !/weather|periodization|recovery|routine|custom_exercise|hr_zone|max_heart/.test(n)) return 'exercise';
    if (has('start_time') && has('duration') && has('exercise_type')) return 'exercise';
    return null;
  }
  /**
   * parseSamsung([{name, text}]) -> {days: {key: {steps, activeKcal, distanceKm, activeMinutes}}, workouts: [...], files: {steps, exercise, summary, skipped:[]}, from, to}
   */
  function parseSamsung(files) {
    const steps = {}, summary = {}, workouts = [], used = { steps: 0, exercise: 0, summary: 0, skipped: [] };
    (files || []).forEach(f => {
      const t = table(f.text);
      const kind = t && kindOf(f.name, t);
      if (!kind) { used.skipped.push(f.name); return; }
      used[kind]++;
      const I = t.idx;
      t.rows.forEach(r => {
        if (kind === 'steps') {
          const key = dayKeyOf(cell(r, I, 'day_time')); if (!U.isValidKey(key)) return;
          const count = cnum(r, I, 'count', 'step_count'); if (count == null || count < 0) return;
          const src = cell(r, I, 'source_type');
          const rec = { count, cal: cnum(r, I, 'calorie'), dist: cnum(r, I, 'distance'), agg: src === '-2' };
          const prev = steps[key];
          if (!prev || (rec.agg && !prev.agg) || (rec.agg === prev.agg && rec.count > prev.count)) steps[key] = rec;
        } else if (kind === 'summary') {
          const key = dayKeyOf(cell(r, I, 'day_time')); if (!U.isValidKey(key)) return;
          const rec = { count: cnum(r, I, 'step_count'), cal: cnum(r, I, 'calorie'), dist: cnum(r, I, 'distance'), activeMs: cnum(r, I, 'active_time') };
          const prev = summary[key];
          if (!prev || (rec.count || 0) >= (prev.count || 0)) summary[key] = rec;
        } else {
          const start = parseTs(cell(r, I, 'start_time')); if (start == null) return;
          const durMs = cnum(r, I, 'duration');
          let minutes = durMs != null ? durMs / 60000 : null;
          if (minutes == null) { const end = parseTs(cell(r, I, 'end_time')); if (end != null) minutes = (end - start) / 60000; }
          const kcal = cnum(r, I, 'calorie', 'total_calorie');
          if (!(minutes > 0) && !(kcal > 0)) return;
          const code = cell(r, I, 'exercise_type');
          const type = exerciseType(code, cell(r, I, 'exercise_custom_type', 'title', 'custom_title'));
          const dist = cnum(r, I, 'distance');
          const hr = cnum(r, I, 'mean_heart_rate', 'heart_rate');
          const uuid = cell(r, I, 'datauuid');
          workouts.push({
            id: 'sh-' + (uuid ? uuid.slice(0, 30) : String(start)), t: start, type, name: typeLabel(type),
            minutes: minutes > 0 ? Math.round(minutes) : 0, kcal: kcal > 0 ? Math.round(kcal) : 0,
            distanceKm: dist > 0 ? Math.round(dist / 10) / 100 : null, avgHr: hr > 30 ? Math.round(hr) : null,
            source: 'samsung-export', countedInSamsung: true
          });
        }
      });
    });
    const days = {};
    const keys = new Set(Object.keys(steps).concat(Object.keys(summary)));
    keys.forEach(k => {
      const st = steps[k], su = summary[k];
      const o = {};
      const sc = st ? st.count : su && su.count; if (fin(sc)) o.steps = Math.round(sc);
      const cal = su && fin(su.cal) ? su.cal : st && fin(st.cal) ? st.cal : null; if (fin(cal)) o.activeKcal = Math.round(cal);
      const dist = st && fin(st.dist) ? st.dist : su && fin(su.dist) ? su.dist : null; if (fin(dist) && dist > 0) o.distanceKm = Math.round(dist / 10) / 100;
      if (su && fin(su.activeMs)) o.activeMinutes = Math.round(su.activeMs / 60000);
      if (Object.keys(o).length) days[k] = o;
    });
    const all = Object.keys(days).concat(workouts.map(w => U.keyOf(w.t))).sort();
    return { days, workouts, files: used, from: all[0] || null, to: all[all.length - 1] || null };
  }
  M.samsung = { parse: parseSamsung, csvRows, parseTs, dayKeyOf };

  /* =====================================================================
     SAMSUNG IMPORT SHEET (screenshot | data export | manual)
     ===================================================================== */
  const RANGES = [{ value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: '365', label: '1 year' }, { value: 'all', label: 'Everything' }];
  const activitySheet = {
    open(opts) {
      opts = opts || {};
      const aiOk = M.ai.state.available !== false && M.ai.state.images !== false;
      let mode = opts.mode === 'export' ? 'export' : opts.mode === 'manual' ? 'manual' : opts.mode === 'screenshot' ? 'screenshot' : (aiOk ? 'screenshot' : 'manual');
      const s = {
        mode, stage: 'pick', file: null, preview: '', ctl: null,
        date: validPast(opts.date), steps: null, activeKcal: null, totalKcal: null, activeMinutes: null, distance: null, workouts: [], addWorkouts: true, confidence: null,
        exp: { result: null, range: '90', busy: false, names: [] }
      };
      function loadManual() {
        const a = M.store.getDay(s.date).activity;
        s.steps = a && fin(a.steps) ? a.steps : null; s.activeKcal = a && fin(a.activeKcal) ? a.activeKcal : null;
        s.distance = a && fin(a.distanceKm) ? round1(M.units.distTo(a.distanceKm)) : null; s.activeMinutes = a && fin(a.activeMinutes) ? a.activeMinutes : null;
        s.totalKcal = a && fin(a.totalKcal) ? a.totalKcal : null;
      }
      if (s.mode === 'manual') loadManual();
      const sheet = ui.sheet({
        title: 'Steps & active calories', sub: 'From Samsung Health or typed in',
        body: '', foot: '',
        onClose() { if (s.ctl) try { s.ctl.abort(); } catch (e) {} if (s.preview) try { URL.revokeObjectURL(s.preview); } catch (e) {} }
      });
      sheet.el.classList.add('act-sheet');
      const q = sel => sheet.el.querySelector(sel);

      const honest = '<div class="notice act-honest">' + M.icon('info') + '<div>Samsung Health can’t connect directly to web apps. Import a screenshot or your data export.</div></div>';
      function numField(id, label, v, suffix, opt, hint) {
        return ui.field({ id, label, optional: opt, hint, input: '<div class="input-wrap"><input class="input num-input" id="' + id + '" inputmode="' + (/dist/.test(id) ? 'decimal' : 'numeric') + '" autocomplete="off" value="' + (fin(v) ? esc(String(v)) : '') + '" placeholder="–"><span class="suffix">' + esc(suffix) + '</span></div>' });
      }
      function estHint() {
        const st = numOrNull(q('#sm-steps') ? q('#sm-steps').value : s.steps);
        return fin(st) && st > 0 ? 'Leave blank and we’ll estimate ≈ ' + U.int(st * C.stepKcal(bodyKg())) + ' kcal from your steps.' : 'Leave blank and we’ll estimate it from your steps.';
      }
      function existingNote() {
        const a = M.store.getDay(s.date).activity;
        if (!a) return '';
        const bits = [fin(a.steps) ? U.int(a.steps) + ' steps' : '', fin(a.activeKcal) ? U.int(a.activeKcal) + ' active kcal' : ''].filter(Boolean).join(' and ');
        return '<p class="hint act-replace">' + M.icon('sync', 'xs') + '<span>This replaces ' + esc(bits || 'the activity') + ' saved for ' + esc(dayWord(s.date).replace(/^on /, '')) + '.</span></p>';
      }
      function screenshotBody() {
        if (!aiOk && s.stage !== 'review') return '<div class="notice brand">' + M.icon('info') + '<div>' + esc(M.ai.UNAVAILABLE_TEXT) + ' You can type the numbers in instead.</div></div>' +
          '<button type="button" class="btn btn-tonal" data-s="mode-manual">' + M.icon('form', 'sm') + '<span class="btn-label">Type numbers in</span></button>';
        if (s.stage === 'pick') return '<button type="button" class="dropzone act-drop" data-s="pick"><span class="ic-bubble teal act-drop-ic">' + M.icon('image', 'lg') + '</span>' +
          '<span class="act-drop-h">Choose a Samsung Health screenshot</span><span class="act-drop-s">The Today or Steps screen works best. We’ll read the date, steps, active calories, total burn, active time and distance.</span></button>' +
          '<ol class="act-howto"><li>Open Samsung Health on your phone.</li><li>Screenshot the Today screen (or Steps).</li><li>Choose it here. Nothing is saved until you confirm.</li></ol>';
        if (s.stage === 'thinking') return '<div class="act-photo-row">' + (s.preview ? '<img class="act-photo tall" src="' + esc(s.preview) + '" alt="Your screenshot">' : '') +
          '<div class="act-photo-t"><div class="thinking" role="status"><span class="spinner" aria-hidden="true"></span><span>Reading your screenshot…</span></div><p class="hint">This usually takes 5 to 30 seconds.</p>' +
          '<button type="button" class="btn btn-secondary btn-sm" data-s="cancel">Cancel</button></div></div>';
        // review
        const conf = s.confidence === 'low' ? '<div class="notice warn">' + M.icon('alert') + '<div>Some numbers were hard to read. Please double-check them.</div></div>' : '';
        const wk = s.workouts.length ? '<div class="act-sam-wos"><label class="toggle"><span>Also list ' + U.plural(s.workouts.length, 'workout') + ' from this screen <span class="muted">(already counted, not added twice)</span></span><input type="checkbox" id="sm-addwo"' + (s.addWorkouts ? ' checked' : '') + '><span class="track"></span></label>' +
          '<ul class="act-mini">' + s.workouts.map(w => '<li><span>' + esc(typeLabel(w.type)) + (w.minutes ? ' · ' + esc(U.minutes(w.minutes)) : '') + '</span>' + (fin(w.kcal) ? kv(w.kcal, 'kcal', 'sm') : '') + '</li>').join('') + '</ul></div>' : '';
        return '<div class="act-photo-row">' + (s.preview ? '<img class="act-photo tall" src="' + esc(s.preview) + '" alt="Your screenshot">' : '') +
          '<div class="act-photo-t"><h3 class="act-photo-h">Read from your screenshot</h3><p class="hint">Check each value before saving.</p><button type="button" class="link-btn" data-s="pick">' + M.icon('image', 'sm') + 'Replace screenshot</button></div></div>' + conf +
          reviewFields() + wk + '<div data-slot="replace">' + existingNote() + '</div>';
      }
      function reviewFields() {
        return '<div class="form act-form">' +
          ui.field({ id: 'sm-date', label: 'Date', input: '<input class="input" type="date" id="sm-date" max="' + today() + '" value="' + esc(s.date) + '">' }) +
          '<div class="field-row">' + numField('sm-steps', 'Steps', s.steps, 'steps') + numField('sm-active', 'Active calories', s.activeKcal, 'kcal') + '</div>' +
          '<div class="field-row">' + numField('sm-total', 'Total burned', s.totalKcal, 'kcal', true) + numField('sm-min', 'Active time', s.activeMinutes, 'min', true) + '</div>' +
          numField('sm-dist', 'Distance', s.distance, M.units.distUnit(), true) +
          '<p class="hint">We use active calories (not the total), because your resting burn is already counted from your profile.</p></div>';
      }
      function exportBody() {
        const r = s.exp.result;
        if (s.exp.busy) return '<div class="thinking" role="status"><span class="spinner" aria-hidden="true"></span><span>Reading your files…</span></div>';
        if (!r) {
          return '<ol class="act-howto"><li>In Samsung Health, open <b>Settings</b>, then <b>Download personal data</b>, and download it.</li><li>On that device, find the folder it saved (it holds CSV files).</li><li>Choose the folder, or the step and exercise CSV files, here.</li></ol>' +
            '<div class="act-exp-btns"><button type="button" class="btn btn-tonal" data-s="files">' + M.icon('upload', 'sm') + '<span class="btn-label">Choose CSV files</span></button>' +
            '<button type="button" class="btn btn-outline" data-s="folder">' + M.icon('download', 'sm') + '<span class="btn-label">Choose folder</span></button></div>' +
            '<p class="hint">We read <b>step_daily_trend</b>, <b>activity.day_summary</b> and <b>exercise</b> files and ignore the rest. Everything stays on this device and your account.</p>';
        }
        const sel = filterResult(r);
        if (!sel.dayCount && !sel.workouts.length) {
          return '<div class="notice warn">' + M.icon('alert') + '<div>No steps or workouts were found in ' + U.plural(s.exp.names.length, 'file') + '. Choose the files named <b>com.samsung.shealth.step_daily_trend…csv</b> or <b>…exercise…csv</b>.</div></div>' +
            '<button type="button" class="btn btn-tonal" data-s="files">' + M.icon('upload', 'sm') + '<span class="btn-label">Choose other files</span></button>';
        }
        const range = sel.from && sel.to ? (sel.from === sel.to ? U.fmtDateY(sel.from) : U.fmtDateY(sel.from) + ' – ' + U.fmtDateY(sel.to)) : '–';
        return '<div class="act-exp-sum"><div class="act-exp-hero">' + kv(String(sel.dayCount), sel.dayCount === 1 ? 'day' : 'days', 'xl') + '<p class="act-exp-range">' + esc(range) + '</p></div>' +
          '<dl class="act-exp-grid">' +
          '<div><dt>Avg steps</dt><dd>' + (sel.avgSteps != null ? U.int(sel.avgSteps) : '–') + '</dd></div>' +
          '<div><dt>Avg active</dt><dd>' + (sel.avgKcal != null ? U.int(sel.avgKcal) + '<small> kcal</small>' : '–') + '</dd></div>' +
          '<div><dt>Workouts</dt><dd>' + U.int(sel.workouts.length) + '</dd></div>' +
          '<div><dt>Files read</dt><dd>' + U.int(r.files.steps + r.files.summary + r.files.exercise) + '<small> of ' + s.exp.names.length + '</small></dd></div></dl></div>' +
          '<div class="field"><p class="label" id="sx-range-l">How far back</p><div data-slot="range"></div></div>' +
          '<p class="hint">Days you already have are updated with these numbers. Workouts are listed as already counted in Samsung Health, so they aren’t added twice.</p>' +
          '<button type="button" class="link-btn" data-s="files">' + M.icon('upload', 'sm') + 'Choose different files</button>';
      }
      function filterResult(r) {
        const cut = s.exp.range === 'all' ? '0000-00-00' : U.addDays(today(), -(+s.exp.range - 1));
        const keys = Object.keys(r.days).filter(k => k >= cut && k <= today()).sort();
        const workouts = r.workouts.filter(w => { const k = U.keyOf(w.t); return k >= cut && k <= today(); });
        const st = keys.map(k => r.days[k].steps).filter(fin), kc = keys.map(k => r.days[k].activeKcal).filter(fin);
        const all = keys.concat(workouts.map(w => U.keyOf(w.t))).sort();
        return { keys, dayCount: keys.length, workouts, avgSteps: st.length ? Math.round(U.mean(st)) : null, avgKcal: kc.length ? Math.round(U.mean(kc)) : null, from: all[0], to: all[all.length - 1] };
      }
      function manualBody() {
        return '<div class="form act-form">' +
          ui.field({ id: 'sm-date', label: 'Date', input: '<input class="input" type="date" id="sm-date" max="' + today() + '" value="' + esc(s.date) + '">' }) +
          '<div class="field-row">' + numField('sm-steps', 'Steps', s.steps, 'steps') + numField('sm-active', 'Active calories', s.activeKcal, 'kcal', true) + '</div>' +
          '<p class="hint" data-slot="est">' + esc(estHint()) + '</p>' +
          '<div class="field-row">' + numField('sm-dist', 'Distance', s.distance, M.units.distUnit(), true) + numField('sm-min', 'Active time', s.activeMinutes, 'min', true) + '</div>' +
          '</div>';
      }
      let rangeCtl = null;
      function paint(focusSel) {
        const seg = '<div class="seg block act-mode" role="group" aria-label="How to import">' +
          [['screenshot', 'Screenshot'], ['export', 'Data export'], ['manual', 'Type in']].map(x => '<button type="button" class="seg-btn" data-smode="' + x[0] + '" aria-pressed="' + (s.mode === x[0]) + '">' + x[1] + '</button>').join('') + '</div>';
        const body = s.mode === 'screenshot' ? screenshotBody() : s.mode === 'export' ? exportBody() : manualBody();
        sheet.setBody(seg + (s.mode !== 'manual' ? honest : '') + body);
        const slot = q('[data-slot="range"]');
        if (slot) {
          rangeCtl = ui.segmented({ options: RANGES, value: s.exp.range, block: true, ariaLabel: 'How far back', onChange: v => { s.exp.range = v; paint(); } });
          slot.appendChild(rangeCtl);
        }
        let cta = null;
        if (s.mode === 'manual' || (s.mode === 'screenshot' && s.stage === 'review')) cta = 'Save ' + (s.date === today() ? 'today’s activity' : 'activity');
        else if (s.mode === 'export' && s.exp.result && !s.exp.busy) { const sel = filterResult(s.exp.result); if (sel.dayCount || sel.workouts.length) cta = 'Import ' + (sel.dayCount ? U.plural(sel.dayCount, 'day') : U.plural(sel.workouts.length, 'workout')); }
        if (cta) {
          const f = document.createDocumentFragment();
          if (s.mode === 'manual' && M.store.getDay(s.date).activity) f.appendChild(ui.h('button', { type: 'button', class: 'btn btn-ghost', 'data-s': 'clear', html: '<span class="btn-label">Clear day</span>' }));
          f.appendChild(ui.h('button', { type: 'button', class: 'btn btn-primary', 'data-s': 'save', html: '<span class="btn-label" data-slot="cta">' + esc(cta) + '</span>' }));
          sheet.setFoot(f);
        } else sheet.setFoot(null);
        if (focusSel) { const x = q(focusSel); if (x) try { x.focus({ preventScroll: true }); } catch (e) {} }
      }
      function readFields() {
        const v = id => q('#' + id) ? q('#' + id).value : undefined;
        if (v('sm-date') !== undefined && U.isValidKey(v('sm-date'))) s.date = v('sm-date') > today() ? today() : v('sm-date');
        if (v('sm-steps') !== undefined) s.steps = numOrNull(v('sm-steps'));
        if (v('sm-active') !== undefined) s.activeKcal = numOrNull(v('sm-active'));
        if (v('sm-total') !== undefined) s.totalKcal = numOrNull(v('sm-total'));
        if (v('sm-min') !== undefined) s.activeMinutes = numOrNull(v('sm-min'));
        if (v('sm-dist') !== undefined) s.distance = numOrNull(v('sm-dist'));
        const aw = q('#sm-addwo'); if (aw) s.addWorkouts = aw.checked;
      }

      async function pickShot(fileArg) {
        let file = fileArg;
        if (!file) { const files = await ui.pickFiles({ accept: 'image/*' }); file = files[0]; }
        if (!file) return;
        if (s.ctl) try { s.ctl.abort(); } catch (e) {}
        if (s.preview) try { URL.revokeObjectURL(s.preview); } catch (e) {}
        s.file = file; s.preview = ui.previewURL(file); s.stage = 'thinking';
        paint('[data-s="cancel"]');
        const ctl = s.ctl = new AbortController();
        try {
          const r = await M.ai.analyzeSamsungScreenshot(file, { signal: ctl.signal });
          if (ctl !== s.ctl || sheet.closed) return;
          s.ctl = null;
          s.date = validPast(r.date); s.steps = r.steps; s.activeKcal = r.activeKcal; s.totalKcal = r.totalKcal;
          s.activeMinutes = fin(r.activeMinutes) ? Math.round(r.activeMinutes) : null; s.distance = fin(r.distanceKm) ? round1(M.units.distTo(r.distanceKm)) : null;
          s.workouts = r.workouts || []; s.confidence = r.confidence;
          if (s.steps == null && s.activeKcal == null) ui.toast('No steps or active calories were visible. Fill them in or try another screenshot.');
          s.stage = 'review'; paint();
        } catch (e) {
          if (ctl !== s.ctl || sheet.closed) return;
          s.ctl = null;
          if (e && e.code === 'cancelled') { s.stage = 'pick'; paint(); return; }
          if (e && M.ai.isFatal(e.code)) { s.mode = 'manual'; loadManual(); paint(); ui.toast(e.message || M.ai.UNAVAILABLE_TEXT); return; }
          s.stage = 'pick'; paint();
          ui.toast((e && e.message) || 'That screenshot couldn’t be read. Try another one.');
        }
      }
      async function pickExport(directory) {
        const files = await ui.pickFiles({ accept: '.csv,text/csv', multiple: true, directory: !!directory });
        if (!files.length) return;
        const csv = files.filter(f => /\.csv$/i.test(f.name) || /csv/.test(f.type));
        // only the useful ones from a whole folder (exports hold dozens of large files)
        const useful = csv.filter(f => /step_daily_trend|day_summary|exercise/i.test(f.name) && !/weather|periodization|recovery|routine|hr_zone|max_heart|custom_exercise/i.test(f.name));
        const pick = useful.length ? useful : csv;
        s.exp.names = pick.map(f => f.name);
        s.exp.busy = true; paint();
        try {
          const texts = await Promise.all(pick.map(f => f.size > 80e6 ? Promise.resolve({ name: f.name, text: '' }) : f.text().then(text => ({ name: f.name, text }))));
          s.exp.result = parseSamsung(texts);
        } catch (e) {
          console.warn('[samsung export]', e);
          s.exp.result = { days: {}, workouts: [], files: { steps: 0, exercise: 0, summary: 0, skipped: s.exp.names }, from: null, to: null };
        }
        s.exp.busy = false;
        if (sheet.closed) return;
        paint();
      }

      function save() {
        if (s.mode === 'export') {
          const r = s.exp.result; if (!r) return;
          const sel = filterResult(r);
          const map = {}, now = Date.now();
          sel.keys.forEach(k => { map[k] = Object.assign({}, r.days[k], { source: 'samsung-export', syncedAt: now }); });
          const n = sel.keys.length ? M.store.setActivityBulk(map, { merge: true }) : 0;
          if (sel.workouts.length) M.store.addItemsBulk('workouts', sel.workouts);
          sheet.close();
          ui.toast('Imported ' + (n ? U.plural(n, 'day') : '') + (n && sel.workouts.length ? ' and ' : '') + (sel.workouts.length ? U.plural(sel.workouts.length, 'workout') : '') + ' from Samsung Health');
          return;
        }
        readFields();
        const stepsIn = q('#sm-steps'), actIn = q('#sm-active');
        const bad = (v, max) => v != null && (v < 0 || v > max);
        if (bad(s.steps, 200000)) { ui.fieldError(stepsIn, 'Enter a step count between 0 and 200,000.'); stepsIn.focus(); return; }
        if (bad(s.activeKcal, 15000)) { ui.fieldError(actIn, 'Enter active calories between 0 and 15,000.'); actIn.focus(); return; }
        if (s.steps == null && s.activeKcal == null) { ui.fieldError(stepsIn, 'Enter your steps, active calories, or both.'); stepsIn.focus(); return; }
        const act = { source: s.mode === 'screenshot' ? 'samsung-screenshot' : 'manual', syncedAt: Date.now() };
        if (s.steps != null) act.steps = Math.round(s.steps);
        if (s.activeKcal != null) act.activeKcal = Math.round(s.activeKcal);
        if (s.totalKcal != null && s.mode === 'screenshot') act.totalKcal = Math.round(s.totalKcal);
        if (s.activeMinutes != null) act.activeMinutes = Math.round(s.activeMinutes);
        if (s.distance != null && s.distance > 0) act.distanceKm = M.units.distFrom(s.distance);
        const undo = M.store.setActivity(s.date, act);
        let woUndo = null;
        if (s.mode === 'screenshot' && s.addWorkouts && s.workouts.length) {
          const base = U.timeOn(s.date, '12:00');
          const items = s.workouts.map((w, i) => ({ id: 'shs-' + s.date + '-' + i, t: base + i * 60000, type: w.type, name: typeLabel(w.type), minutes: w.minutes || 0, kcal: w.kcal || 0, source: 'photo', countedInSamsung: true }));
          M.store.addItemsBulk('workouts', items);
          woUndo = () => items.forEach(it => { if (M.store.findItem('workouts', it.id)) M.store.removeItem('workouts', it.id); });
        }
        const key = s.date;
        sheet.close();
        const kc = act.activeKcal != null ? act.activeKcal : Math.round((act.steps || 0) * C.stepKcal(bodyKg()));
        ui.toast('Saved ' + (act.steps != null ? U.int(act.steps) + ' steps' : U.int(kc) + ' active kcal') + ' for ' + dayWord(key).replace(/^on /, ''), { action: { label: 'Undo', fn: () => { undo(); if (woUndo) woUndo(); } } });
        if (key !== today() && location.hash.indexOf('#activity') === 0) M.go('activity', { date: key });
      }
      async function clearDay() {
        const ok = await ui.confirm({ title: 'Clear this day’s steps?', body: 'Steps and active calories for ' + dayWord(s.date).replace(/^on /, '') + ' will be removed. Workouts stay.', ok: 'Clear', danger: true });
        if (!ok) return;
        const undo = M.store.setActivity(s.date, null);
        sheet.close();
        ui.toast('Activity cleared', { action: { label: 'Undo', fn: undo } });
      }

      sheet.el.addEventListener('click', e => {
        const m = e.target.closest('[data-smode]');
        if (m) { readFields(); const nm = m.dataset.smode; if (nm !== s.mode) { if (s.ctl) { try { s.ctl.abort(); } catch (er) {} s.ctl = null; if (s.stage === 'thinking') s.stage = 'pick'; } s.mode = nm; if (nm === 'manual') loadManual(); paint(); } return; }
        const b = e.target.closest('[data-s]'); if (!b) return;
        const a = b.dataset.s;
        if (a === 'pick') pickShot();
        else if (a === 'cancel') { if (s.ctl) try { s.ctl.abort(); } catch (er) {} s.ctl = null; s.stage = 'pick'; paint(); }
        else if (a === 'mode-manual') { s.mode = 'manual'; loadManual(); paint(); }
        else if (a === 'files') pickExport(false);
        else if (a === 'folder') pickExport(true);
        else if (a === 'save') save();
        else if (a === 'clear') clearDay();
      });
      sheet.el.addEventListener('input', e => {
        if (e.target.matches('.input')) ui.fieldError(e.target, '');
        if (e.target.id === 'sm-steps') { const h = q('[data-slot="est"]'); if (h) h.textContent = estHint(); }
      });
      sheet.el.addEventListener('change', e => {
        if (e.target.id === 'sm-date') {
          readFields();
          if (s.mode === 'manual') { loadManual(); paint('#sm-date'); }
          else { const r = q('[data-slot="replace"]'); if (r) r.innerHTML = existingNote(); }
          const c = q('[data-slot="cta"]'); if (c) c.textContent = 'Save ' + (s.date === today() ? 'today’s activity' : 'activity');
        }
      });
      sheet.el.addEventListener('dragover', e => { const z = e.target.closest('.act-drop'); if (z) { e.preventDefault(); z.classList.add('over'); } });
      sheet.el.addEventListener('dragleave', e => { const z = e.target.closest('.act-drop'); if (z) z.classList.remove('over'); });
      sheet.el.addEventListener('drop', e => { const z = e.target.closest('.act-drop'); if (!z) return; e.preventDefault(); const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f && /^image\//.test(f.type)) pickShot(f); });
      sheet.el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input.input') && (s.mode === 'manual' || s.stage === 'review')) { e.preventDefault(); save(); } });

      paint();
      return sheet;
    }
  };
  M.sheets.activity = activitySheet;
  M.sheets.samsungImport = activitySheet;
})();
