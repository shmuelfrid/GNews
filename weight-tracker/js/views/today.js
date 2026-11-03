/* Momentum v2 — TODAY view (#today). Owner: today builder.
   Focal point: the energy-balance card. Then weight + motivating headline, today's plan checklist,
   7-day deficit chart, plan link, today's meals and recent weigh-ins.
   Desktop (>=1024): 12-col grid per Desktop.dc.html (energy 5 + weight trend 7; plan / deficit / burn; meals / weigh-ins). */
(function () {
  'use strict';
  const M = window.M, U = M.util, ui = M.ui, C = M.calc;
  const esc = U.esc;

  /* ---------- module state (survives re-renders) ---------- */
  let mode = 'sofar';          // energy card: 'sofar' | 'plan'
  let range = '3M';            // desktop weight chart range
  let charts = [];             // live chart instances (destroyed before each render)
  let hlTimer = null, hlIndex = 0, hlList = [];
  let mq = null, mqHandler = null;
  let wasShown = false;           // true after first render: skip the entrance animation on data re-renders

  const isDesk = () => { try { return matchMedia('(min-width: 1024px)').matches; } catch (e) { return false; } };
  const isWide = () => { try { return matchMedia('(min-width: 768px)').matches; } catch (e) { return false; } };   // tablet+: chart weight card
  const fin = v => typeof v === 'number' && isFinite(v);
  const nb = s => String(s).replace(/ /g, ' ');            // keep "1,981 kcal" together
  const unitSpan = u => '<span class="today-u">' + esc(u) + '</span>';

  function killCharts() { charts.forEach(c => { try { c.destroy(); } catch (e) {} }); charts = []; }

  /* ---------- tiny checklist ring (28px) ---------- */
  function miniRing(frac, state, tone) {
    const r = 11, Cc = 2 * Math.PI * r;
    if (state === 'done') {
      return '<span class="today-check is-done" aria-hidden="true">' + M.icon('check', 'sm') + '</span>';
    }
    if (state === 'empty') return '<span class="today-check is-none" aria-hidden="true"></span>';
    const f = U.clamp(fin(frac) ? frac : 0, 0, 1);
    const col = tone === 'amber' ? 'var(--amber-fill)' : tone === 'teal' ? 'var(--teal-fill)' : 'var(--d-eaten)';
    const track = tone === 'amber' ? 'var(--amber-tint)' : tone === 'teal' ? 'var(--teal-tint)' : 'var(--brand-tint)';
    return '<svg class="today-check" width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">' +
      '<circle cx="14" cy="14" r="' + r + '" fill="none" stroke="' + track + '" stroke-width="4"/>' +
      (f > 0 ? '<circle cx="14" cy="14" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="4" stroke-linecap="round" stroke-dasharray="' + (Math.max(0.01, f * Cc)).toFixed(1) + ' ' + Cc.toFixed(1) + '" transform="rotate(-90 14 14)"/>' : '') +
      '</svg>';
  }
  function checkRow(o) {
    const statusCls = o.statusTone ? ' ' + o.statusTone : '';
    const attrs = o.sheet ? ' data-open-sheet="' + esc(o.sheet) + '"' + (o.opts ? " data-sheet-opts='" + esc(JSON.stringify(o.opts)) + "'" : '') : '';
    const tag = o.href ? 'a' : 'button';
    return '<li><' + tag + (o.href ? ' href="' + esc(o.href) + '"' : ' type="button"') + ' class="today-task' + (o.done ? ' is-done' : '') + '"' + attrs + '>' +
      o.ring +
      '<span class="today-task-main"><span class="today-task-title">' + o.title + '</span>' +
      (o.sub ? '<span class="today-task-sub">' + o.sub + '</span>' : '') + '</span>' +
      '<span class="today-task-status' + statusCls + '">' + esc(o.status) + '</span>' +
      '</' + tag + '></li>';
  }

  /* ================= cards ================= */
  function energyCard(b) {
    const plan = mode === 'plan';
    const budget = Math.max(0, b.budget);
    let figs, foot;
    if (!plan) {
      figs = [
        { label: 'Eaten', dot: 'eaten', v: b.eaten },
        { label: 'Burned', dot: 'workout', v: b.burnSoFar },
        b.deficitSoFar >= 0 ? { label: 'Deficit', dot: 'deficit', v: b.deficitSoFar } : { label: 'Surplus', dot: 'surplus', v: -b.deficitSoFar }
      ];
      const parts = ['resting ' + U.int(b.resting)];
      if (b.active > 0) parts.push((b.activeEstimated ? 'steps (est.) ' : b.steps != null ? 'steps ' : 'activity ') + U.int(b.active));
      if (b.workouts > 0) parts.push((b.workoutCount === 1 ? 'workout ' : 'workouts ') + U.int(b.workouts));
      foot = 'Burned so far: ' + parts.join(' + ');
    } else {
      figs = [
        { label: b.gain ? 'Eat at least' : 'Eat under', dot: 'eaten', v: budget },
        { label: 'Full-day burn', dot: 'workout', v: b.burnExpected },
        b.targetDeficit >= 0 ? { label: 'Goal deficit', dot: 'deficit', v: b.targetDeficit } : { label: 'Goal surplus', dot: 'surplus', v: -b.targetDeficit }
      ];
      foot = b.targetDeficit >= 0
        ? 'Budget = ' + U.int(b.burnExpected) + ' expected burn − ' + U.int(b.targetDeficit) + ' goal deficit'
        : 'Budget = ' + U.int(b.burnExpected) + ' expected burn + ' + U.int(-b.targetDeficit) + ' goal surplus';
    }
    // desktop-only sentence: how today compares with the goal deficit
    let goalLine = '';
    if (b.belowFloor) {
      goalLine = '<p class="notice warn today-note">' + M.icon('alert') + '<span>Your budget is under ' + nb(U.int(b.budgetFloor) + ' kcal') + '. Eat at least that much and add a walk instead, or pick a gentler pace in your plan.</span></p>';
    } else if (b.targetDeficit > 0 && !b.hasFood) {
      goalLine = '<p class="today-goalline">' + M.icon('target', 'sm') + '<span>Goal deficit is <b>' + nb(U.int(b.targetDeficit) + ' kcal') + '</b> a day. Log your meals to see how today compares.</span></p>';
    } else if (b.targetDeficit > 0) {
      const diff = b.deficitSoFar - b.targetDeficit;
      goalLine = '<p class="today-goalline">' + M.icon(diff >= 0 ? 'check' : 'target', 'sm') + '<span>Goal deficit is <b>' + nb(U.int(b.targetDeficit) + ' kcal') + '</b> a day. ' +
        (diff >= 0 ? 'You’re already <b>' + nb(U.int(diff) + ' kcal') + '</b> ahead of it.' : '<b>' + nb(U.int(-diff) + ' kcal') + '</b> to go — staying under budget gets you there.') + '</span></p>';
    }
    return wrapEnergy(centerRing(b, plan), figs, foot, goalLine);
  }
  function centerRing(b, plan) {
    const budget = Math.max(0, b.budget);
    let big, unit, sub, aria, inner;
    if (plan) {
      big = U.int(budget); unit = b.gain ? 'kcal target' : 'kcal budget'; sub = b.gain ? 'eat at least this today' : 'eat under this today';
      aria = 'Plan for today: of ' + U.int(b.burnExpected) + ' kcal expected burn, eat ' + U.int(budget) + ' and keep a ' + U.int(Math.abs(b.targetDeficit)) + ' kcal ' + (b.targetDeficit >= 0 ? 'deficit' : 'surplus');
      const segs = b.targetDeficit >= 0
        ? [{ value: budget, color: 'var(--d-eaten)' }, { value: b.targetDeficit, color: 'var(--d-deficit)' }]
        : [{ value: budget, color: 'var(--d-eaten)' }];
      inner = M.charts.ring({ size: 176, stroke: 14, max: Math.max(b.burnExpected, budget, 1), segments: segs, ariaLabel: aria });
    } else {
      const over = b.left < 0;
      big = U.int(over ? b.overBy : b.left); unit = over ? (b.gain ? 'kcal above target' : 'kcal over') : (b.gain ? 'kcal to go' : 'kcal left');
      sub = U.int(b.eaten) + ' of ' + U.int(budget) + ' eaten';
      aria = U.int(b.eaten) + ' of ' + U.int(budget) + ' kcal eaten, ' + big + ' ' + unit;
      inner = M.charts.ring({ size: 176, stroke: 14, value: budget > 0 ? b.eaten / budget : 0, max: 1, color: 'var(--d-eaten)', ariaLabel: aria });
    }
    return '<div class="today-ring">' + inner +
      '<div class="today-ring-center" aria-hidden="true"><span class="today-ring-big' + (!plan && b.left < 0 && !b.gain ? ' warn' : '') + '">' + big + '</span>' +
      '<span class="today-ring-unit">' + esc(unit) + '</span><span class="today-ring-sub">' + esc(sub) + '</span></div></div>';
  }
  function wrapEnergy(ringHtml, figs, foot, goalLine) {
    return '<section class="card hero today-card today-energy" aria-labelledby="today-eb-t">' +
      '<div class="today-eb-head"><h2 class="card-title" id="today-eb-t">Energy balance</h2><div class="today-eb-seg" data-slot="mode"></div></div>' +
      ringHtml +
      '<dl class="today-figs">' + figs.map(f =>
        '<div class="today-fig"><dt><span class="dot ' + f.dot + '"></span><span>' + esc(f.label) + '</span></dt>' +
        '<dd><span class="today-fig-n">' + U.int(f.v) + '</span>' + unitSpan('kcal') + '</dd></div>').join('') + '</dl>' +
      '<p class="today-foot">' + esc(foot) + '</p>' + (goalLine || '') +
      '</section>';
  }

  function weightCard(a, pl, desk) {
    const u = M.units.unit;
    const has = a.series.length > 0;
    const toward = a.toward ? a.toward(a.totalChange) : 0;
    const moved = Math.abs(a.totalChange) >= 0.05 / (u === 'lb' ? 2.2 : 1);
    const badge = has && moved
      ? '<span class="today-wbadge ' + (toward > 0 ? 'good' : 'warn') + '">' + M.icon(a.totalChange < 0 ? 'down' : 'up', 'sm') + '<span>' + M.units.abs(a.totalChange) + ' ' + u + ' since ' + esc(U.fmtDate(a.startK)) + '</span></span>'
      : '<span class="today-wbadge brand">' + M.icon('flag', 'sm') + '<span>Starting point</span></span>';
    const pct = Math.round((a.progress || 0) * 100);
    const meta = a.goalReached
      ? '<span><b>Goal reached</b></span><span class="muted">' + M.units.n(a.goalKg) + ' ' + u + '</span>'
      : '<span><b>' + pct + '%</b> to ' + M.units.n(a.goalKg, u === 'lb' ? 0 : 1) + ' ' + u + '</span><span class="muted">' + M.units.abs(a.remaining) + ' ' + u + ' to go</span>';
    const hl = '<div class="today-hl" data-slot="hl" role="button" tabindex="0" aria-label="Next insight">' +
      '<span class="ic-bubble teal today-hl-ic">' + M.icon('trophy') + '</span>' +
      '<p class="today-hl-text" aria-live="polite">' + (hlList[hlIndex % Math.max(1, hlList.length)] || { html: '' }).html + '</p>' +
'</div>';

    if (!desk) {
      return '<section class="card today-card today-weight" aria-label="Weight">' +
        '<p class="t-over">Weight trend</p>' +
        '<div class="today-wrow"><p class="today-wbig"><span class="today-wn">' + M.units.n(a.current) + '</span>' + unitSpan(u) + '</p>' + badge + '</div>' +
        '<div class="today-wprog"><div class="progress-meta today-wmeta">' + meta + '</div>' + ui.progress(a.progress, 'teal', 'Progress to goal weight') + '</div>' +
        '<div class="divider"></div>' + hl +
        '</section>';
    }
    // desktop: headline title + trend chart + three stats
    let title, subParts = ['Trend <b>' + M.units.n(a.current) + ' ' + u + '</b>'];
    if (a.goalReached) title = 'You reached ' + M.units.n(a.goalKg) + ' ' + u + '. Goal complete.';
    else if (a.projKey) title = 'On pace to reach ' + M.units.n(a.goalKg, u === 'lb' ? 0 : 1) + ' ' + u + ' by ' + U.fmtDateY(a.projKey);
    else if (has && a.series.length < 4) title = 'Your trend line is forming';
    else title = 'Heading to ' + M.units.n(a.goalKg, u === 'lb' ? 0 : 1) + ' ' + u + (pl.targetDate ? ' by ' + U.fmtDateY(pl.targetDate) : '');
    if (moved) subParts.push((a.totalChange < 0 ? 'down ' : 'up ') + M.units.abs(a.totalChange) + ' ' + u + ' since ' + U.fmtDate(a.startK));
    if (a.scheduleDays != null && Math.abs(a.scheduleDays) >= 7) subParts.push(U.plural(Math.round(Math.abs(a.scheduleDays) / 7), 'week') + (a.scheduleDays > 0 ? ' ahead of plan' : ' behind plan'));
    const lw = a.lastWeek, best = lw && a.bestWeek === lw && a.dataWeeks.length >= 3;
    const stats = [
      { label: 'Last week', n: lw ? M.units.signed(lw.change) : '–', u: lw ? u + (best ? ' · best yet' : '') : 'not enough data' },
      { label: 'Last 4 weeks', n: fin(a.pace4) ? M.units.signed(a.pace4) : '–', u: fin(a.pace4) ? u + ' / week' : 'needs 4+ weigh-ins' },
      { label: 'To goal', n: a.goalReached ? '0' : M.units.abs(a.remaining), u: u + ' · ' + pct + '% done' }
    ];
    return '<section class="card today-card today-weight desk" aria-labelledby="today-wt-t">' +
      '<div class="today-wd-head"><div class="ch-text"><h2 class="card-title today-wd-title" id="today-wt-t">' + esc(title).replace(/(\d) (lb|kg)\b/g, '$1\u00a0$2').replace(/([A-Z][a-z]{2}) (\d{1,2}), (\d{4})/g, '$1\u00a0$2,\u00a0$3') + '</h2>' +
      '<p class="card-sub">' + subParts.join(' · ') + '</p></div><div data-slot="range"></div></div>' +
      '<div class="today-wchart" data-slot="wchart"></div>' +
      '<div class="legend today-wlegend"><span class="legend-item"><span class="dot line" style="background:var(--d-trend)"></span><span>Trend</span></span>' +
      (a.projKey ? '<span class="legend-item"><span class="dot dash" style="color:var(--d-proj)"></span><span>At your recent pace</span></span>' : '') +
      '<span class="legend-item"><span class="dot dash" style="color:var(--d-goal)"></span><span>Goal</span></span></div>' +
      '<div class="today-wstats">' + stats.map(s => '<div class="stat inset"><p class="stat-label"><span>' + esc(s.label) + '</span></p>' +
        (s.n === '–' ? '<p class="stat-sub today-wstat-na">' + esc(s.u.charAt(0).toUpperCase() + s.u.slice(1)) + '</p>' : '<p class="stat-value">' + esc(s.n) + '<span class="unit">' + esc(s.u) + '</span></p>') + '</div>').join('') + '</div>' +
      '<div class="divider"></div>' + hl +
      '</section>';
  }

  function planChecklist(b, ta, p) {
    const now = new Date();
    const hour = now.getHours();
    const budget = Math.max(0, b.budget);
    const rows = [];
    // 1. eat under
    const over = b.left < 0 && !b.gain;   // for a gain goal the budget is a minimum: going past it is the aim
    if (b.gain) {
      const hit = b.left <= 0;
      rows.push(checkRow({
        ring: hit ? miniRing(1, 'done') : miniRing(budget ? b.eaten / budget : 0, 'ring', 'brand'), done: hit,
        title: 'Eat at least ' + nb(U.int(budget) + ' kcal'),
        sub: hit ? 'Target reached' : !b.hasFood ? 'Nothing logged yet today' : nb(U.int(b.left) + ' kcal') + ' to go',
        status: hit ? 'Done' : !b.hasFood ? 'Start' : 'To do', statusTone: hit ? 'good' : '', sheet: 'food', opts: {}
      }));
    } else rows.push(checkRow({
      ring: miniRing(budget ? b.eaten / budget : 0, 'ring', over ? 'amber' : 'brand'),
      title: 'Eat under ' + nb(U.int(budget) + ' kcal'),
      sub: over ? nb(U.int(b.overBy) + ' kcal') + ' over budget' : !b.hasFood ? 'Nothing logged yet today' : nb(U.int(b.left) + ' kcal') + ' left' + (hour >= 15 && hour < 21 ? ' for dinner' : ''),
      status: over ? 'Over' : !b.hasFood ? 'Start' : 'On track', statusTone: over ? 'warn' : b.hasFood ? 'good' : '',
      sheet: 'food', opts: {}
    }));
    // 2. burn
    const moved = (b.active || 0) + (b.workouts || 0);
    const target = U.clamp(Math.round(Math.max(250, b.activeAvg7 || 0) / 50) * 50, 250, 800);
    if (over) {
      const eq = ta.burnToFix;
      rows.push(checkRow({
        ring: miniRing(0, 'empty'), title: 'Burn ' + nb(U.int(b.overBy) + ' kcal') + ' to even out',
        sub: '≈ ' + nb(eq.treadmillMin + ' min') + ' treadmill · 3.5 mph, 5%', status: 'To do', statusTone: 'warn', sheet: 'workout', opts: {}
      }));
    } else if (moved < target) {
      const eq = C.equivalents(target - moved, b.kg);
      rows.push(checkRow({
        ring: moved > 0 ? miniRing(moved / target, 'ring', 'teal') : miniRing(0, 'empty'),
        title: 'Burn ' + nb(U.int(target - moved) + ' more kcal'),
        sub: '≈ ' + nb(eq.treadmillMin + ' min') + ' treadmill · 3.5 mph, 5%', status: 'To do', sheet: 'workout', opts: {}
      }));
    } else {
      rows.push(checkRow({ ring: miniRing(1, 'done'), done: true, title: 'Active goal met', sub: nb(U.int(moved) + ' kcal') + ' from steps & workouts', status: 'Done', statusTone: 'good', sheet: 'workout', opts: {} }));
    }
    // 3. weigh-in
    const ws = M.store.getDay(U.todayKey()).weights.slice().sort((x, y) => x.t - y.t);
    const times = ws.map(w => U.fmtTime(w.t));
    const listTimes = times.length <= 2 ? times.join(' and ') : times.slice(0, -1).join(', ') + ' and ' + times[times.length - 1];
    const evening = ws.some(w => new Date(w.t).getHours() >= 17);
    if (!ws.length) {
      rows.push(checkRow({ ring: miniRing(0, 'empty'), title: 'Log a weigh-in', sub: hour < 11 ? 'Best first thing in the morning' : 'Any time works. Your trend smooths it out', status: 'To do', sheet: 'weighIn', opts: {} }));
    } else if (!evening) {
      rows.push(checkRow({ ring: miniRing(0, 'empty'), title: 'Log evening weigh-in', sub: 'Logged ' + listTimes, status: hour >= 17 ? 'Now' : 'Tonight', sheet: 'weighIn', opts: {} }));
    } else {
      rows.push(checkRow({ ring: miniRing(1, 'done'), done: true, title: 'Weighed in today', sub: 'Logged ' + listTimes, status: 'Done', statusTone: 'good', sheet: 'weighIn', opts: {} }));
    }
    // 4. steps
    const goal = (p && p.stepGoal) || 8000;
    if (b.steps == null) {
      rows.push(checkRow({ ring: miniRing(0, 'empty'), title: 'Add today’s steps', sub: 'Import from Samsung Health or type them in', status: 'Add', sheet: 'activity', opts: { mode: 'screenshot' } }));
    } else {
      const f = b.steps / goal, togo = Math.max(0, goal - b.steps);
      rows.push(checkRow({
        ring: f >= 1 ? miniRing(1, 'done') : miniRing(f, 'ring', 'teal'), done: f >= 1,
        title: U.int(b.steps) + ' <span class="today-task-of">/ ' + nb(U.int(goal) + ' steps') + '</span>',
        sub: togo > 0 ? nb(U.int(togo)) + ' to go · about a ' + nb(Math.ceil(togo / 100) + ' min') + ' walk' : 'Step goal reached',
        status: Math.min(999, Math.round(f * 100)) + '%', statusTone: 'good', sheet: 'activity', opts: { mode: 'screenshot' }
      }));
    }
    return '<section class="card today-card today-plan" aria-labelledby="today-plan-t">' +
      '<div class="today-plan-head"><h2 class="card-title" id="today-plan-t">Today’s plan</h2><span class="today-plan-hint">What it takes today</span></div>' +
      '<ul class="today-tasks">' + rows.join('') + '</ul></section>';
  }

  function deficitCard(da, b) {
    const n = da.completedCount;
    let title, sub;
    if (n > 0) {
      const defDays = da.days.filter(d => d.logged && !d.partial && d.deficit > 0).length;
      title = da.gain ? (da.underCount === n && n >= 3 ? 'Hit your calorie target every day this week' : 'Hit your calorie target ' + da.underCount + ' of the last ' + U.plural(n, 'day'))
        : da.underCount === n && n >= 3 ? 'Under budget every day this week'
        : da.underCount === 0 && defDays > 0 ? 'In a deficit ' + defDays + ' of ' + U.plural(n, 'day') + ', just short of your goal'
          : 'Under budget ' + da.underCount + ' of the last ' + U.plural(n, 'day');
      sub = da.total > 0 ? U.int(da.total) + ' kcal saved ≈ ' + M.units.abs(da.expectedKg) + ' ' + M.units.unit + ' of fat'
        : 'Daily deficit' + (b.targetDeficit > 0 ? ' · dashed line = ' + U.int(b.targetDeficit) + ' kcal goal' : '');
    } else {
      title = da.today && da.today.logged ? 'Day one of your deficit chart' : 'Your deficit chart starts today';
      sub = 'Log your meals and each day’s deficit lands here';
    }
    const empty = n === 0 && !(da.today && da.today.logged);
    return '<section class="card today-card today-deficit" aria-labelledby="today-def-t">' +
      '<div class="ch-text"><h2 class="card-title" id="today-def-t">' + esc(title) + '</h2><p class="card-sub">' + esc(sub) + '</p></div>' +
      (empty
        ? '<div class="today-def-empty">' + M.icon('flame') + '<p>Each day you log meals, a bar lands here: teal when you burn more than you eat, amber when you go over.</p></div>'
        : '<div class="today-defchart" data-slot="defchart"></div>' +
          '<div class="legend today-deflegend"><span class="legend-item"><span class="dot sq deficit"></span><span>Deficit</span></span><span class="legend-item"><span class="dot sq surplus"></span><span>Surplus</span></span>' +
          (b.targetDeficit > 0 ? '<span class="legend-item"><span class="dot dash" style="color:var(--ink-2)"></span><span>' + U.int(b.targetDeficit) + ' goal</span></span>' : '') + '</div>') +
      '</section>';
  }

  function burnCard(b) {
    const total = b.burnSoFar;
    const pct = v => total > 0 ? Math.round(v / total * 100) + '%' : '';
    const rows = [
      { dot: 'rest', label: 'Resting burn', v: b.resting },
      { dot: 'active', label: b.steps != null ? 'Steps' + (b.activeSource && /samsung/.test(b.activeSource) ? ' · Samsung Health' : '') + (b.activeEstimated ? ' (est.)' : '') : 'Activity', v: b.active },
      { dot: 'workout', label: b.workoutCount === 1 ? 'Workout' : 'Workouts', v: b.workouts }
    ];
    return '<section class="card today-card today-burn" aria-labelledby="today-burn-t">' +
      '<h2 class="card-title" id="today-burn-t">Where your burn comes from</h2>' +
      '<p class="today-burn-total"><span class="today-burn-n">' + U.int(total) + '</span>' + unitSpan('kcal so far') + '</p>' +
      '<div class="today-segbar" role="img" aria-label="' + esc(rows.filter(r => r.v > 0).map(r => r.label + ' ' + U.int(r.v) + ' kcal').join(', ')) + '">' +
      rows.filter(r => r.v > 0).map(r => '<span class="dot-' + r.dot + '" style="flex:' + r.v + ' 1 0"></span>').join('') + '</div>' +
      '<ul class="today-burn-list">' + rows.map(r =>
        '<li><span class="dot sq ' + r.dot + '"></span><span class="today-burn-l">' + esc(r.label) + '</span><span class="today-burn-v">' + U.int(r.v) + '</span><span class="today-burn-p">' + (r.v > 0 ? pct(r.v) : '–') + '</span></li>').join('') + '</ul>' +
      (b.workoutsExcluded > 0 ? '<p class="card-sub">' + U.int(b.workoutsExcluded) + ' kcal of workouts already counted by Samsung Health.</p>' : '') +
      '<p class="card-sub">Resting burn is calculated from your height, weight, age and sex.</p>' +
      '</section>';
  }

  function planLink(a, pl) {
    const u = M.units.unit;
    let title, sub;
    const perWeek = M.units.abs(pl.kgPerWeek);
    if (a.goalReached || pl.goalReached) { title = 'You reached your goal'; sub = 'Set your next target in your plan'; }
    else if (a.projKey && a.scheduleDays != null) {
      title = 'On track for ' + U.fmtDateY(a.projKey);
      const w = Math.round(Math.abs(a.scheduleDays) / 7);
      sub = a.scheduleDays >= 7 ? U.plural(w, 'week') + ' ahead of your ' + U.fmtDateY(a.target) + ' goal'
        : a.scheduleDays >= 0 ? 'Right on schedule for ' + U.fmtDateY(a.target)
          : (w >= 1 ? U.plural(w, 'week') : 'A few days') + ' behind ' + U.fmtDateY(a.target) + ' · see what it takes';
    } else if (a.projKey) { title = 'On pace for ' + U.fmtDateY(a.projKey); sub = 'Goal ' + M.units.n(pl.goalKg) + ' ' + u + ' · ' + perWeek + ' ' + u + ' a week'; }
    else {
      title = 'Goal: ' + M.units.n(pl.goalKg, u === 'lb' ? 0 : 1) + ' ' + u + (pl.targetDate ? ' by ' + U.fmtDateY(pl.targetDate) : '');
      sub = perWeek + ' ' + u + ' a week · ' + U.int(pl.kcalPerDay) + ' kcal daily ' + (pl.dir < 0 ? 'deficit' : 'surplus');
    }
    return '<a class="card interactive today-card today-planlink" href="#plan">' +
      '<span class="ic-bubble brand today-round">' + M.icon('flag') + '</span>' +
      '<span class="today-pl-main"><span class="today-pl-title">' + esc(title) + '</span><span class="today-pl-sub">' + esc(sub) + '</span></span>' +
      M.icon('chevron', 'row-chev') + '</a>';
  }

  function mealsCard(b) {
    const foods = M.store.getDay(U.todayKey()).foods.slice().sort((x, y) => x.t - y.t);
    const label = id => (M.MEALS.find(m => m.id === id) || { label: 'Snack' }).label;
    const shown = foods.slice(-4);
    const head = '<div class="card-head"><div class="ch-text"><h2 class="card-title">Today’s meals</h2>' +
      (foods.length ? '<p class="card-sub">' + U.plural(foods.length, 'item') + '</p>' : '') + '</div>' +
      '<div class="ch-action"><a class="link-btn" href="#food">See all food</a></div></div>';
    if (!foods.length) {
      return '<section class="card today-card today-meals">' + head +
        ui.empty({ icon: 'food', compact: true, title: 'No meals yet today', body: 'Snap a photo, describe it in a sentence, or type it in.', actions: '<button type="button" class="btn btn-tonal" data-open-sheet="food">' + M.icon('camera') + '<span class="btn-label">Log food</span></button>' }) +
        '</section>';
    }
    return '<section class="card today-card today-meals">' + head +
      '<div class="list">' + shown.map(f =>
        '<button type="button" class="row" data-open-sheet="food" data-sheet-opts=\'' + esc(JSON.stringify({ id: f.id })) + '\'>' +
        (f.thumb ? '<img class="row-thumb" src="' + esc(f.thumb) + '" alt="">' : '<span class="row-thumb">' + M.icon(f.source === 'photo' ? 'camera' : 'food') + '</span>') +
        '<span class="row-main"><span class="row-title">' + esc(f.name) + '</span><span class="row-sub">' + esc(label(f.meal)) + ' · ' + esc(U.fmtTime(f.t)) + (f.source === 'photo' ? ' · From photo' : '') + '</span></span>' +
        '<span class="row-end"><span class="row-value">' + U.int(f.kcal) + '<span class="unit">kcal</span></span></span></button>').join('') + '</div>' +
      (foods.length > shown.length ? '<p class="card-sub">+ ' + U.plural(foods.length - shown.length, 'earlier item') + '</p>' : '') +
      '<div class="today-total"><span>Total eaten</span><span class="today-total-v"><b>' + U.int(b.eaten) + '</b> of ' + nb(U.int(Math.max(0, b.budget)) + ' kcal') + '</span></div>' +
      '</section>';
  }

  function weighCard(a, desk) {
    const all = M.store.allWeights();
    const recent = all.slice(desk ? -5 : -3).reverse();
    const extremeId = a.extreme && all.length >= 5 ? a.extreme.id : null;
    const head = '<div class="card-head"><div class="ch-text"><h2 class="card-title">Recent weigh-ins</h2></div>' +
      '<div class="ch-action"><a class="link-btn" href="#progress">See progress</a></div></div>';
    if (!recent.length) {
      return '<section class="card today-card today-weighins">' + head +
        ui.empty({ icon: 'scale', compact: true, title: 'No weigh-ins yet', body: 'Weigh in as often as you like. Your trend smooths out the daily swings.', actions: '<button type="button" class="btn btn-tonal" data-open-sheet="weighIn">' + M.icon('plus') + '<span class="btn-label">Log weight</span></button>' }) +
        '</section>';
    }
    return '<section class="card today-card today-weighins">' + head +
      '<div class="list">' + recent.map(w =>
        '<button type="button" class="row" data-open-sheet="weighIn" data-sheet-opts=\'' + esc(JSON.stringify({ id: w.id })) + '\'>' +
        '<span class="row-main"><span class="row-title">' + esc(U.relDay(U.keyOf(w.t))) + ' · ' + esc(U.fmtTime(w.t)) + '</span>' +
        ((w.tags && w.tags.length) || w.note || w.id === extremeId ? '<span class="row-sub today-wi-sub">' + (w.id === extremeId ? ui.badge(a.dir < 0 ? 'Lowest yet' : 'Highest yet', 'good') : '') + '<span>' + esc((w.tags || []).join(', ') || w.note || '') + '</span></span>' : '') + '</span>' +
        '<span class="row-end">' +
        '<span class="row-value">' + M.units.n(w.kg) + '<span class="unit">' + M.units.unit + '</span></span></span></button>').join('') + '</div>' +
      '<p class="card-sub">Your trend (' + M.units.n(a.current) + ' ' + M.units.unit + ') smooths out daily swings from water, salt and meal timing.</p>' +
      '</section>';
  }

  /* ================= charts ================= */
  function drawDeficit(slot, da, b) {
    if (!slot) return;
    const bars = da.days.map((d, i) => ({
      label: d.partial ? 'Today' : U.fromKey(d.key).toLocaleDateString('en-US', { weekday: 'short' }),
      value: d.logged ? d.deficit : 0, highlight: d.partial, muted: !d.logged,
      color: d.partial && d.logged && d.deficit >= 0 ? 'var(--d-workout)' : undefined
    }));
    // direct-label only today's bar (the rest live in tooltips) so labels never fight the goal line
    const todayVal = bars[bars.length - 1].value;
    charts.push(M.charts.barChart(slot, {
      bars, height: 150, labels: 'auto', valueFmt: v => v === todayVal && v !== 0 ? U.int(v) : '',
      ref: b.targetDeficit > 0 ? { value: b.targetDeficit } : null,
      ariaLabel: 'Daily calorie deficit for the last 7 days: ' + da.days.map(d => (d.partial ? 'today ' : U.fmtDate(d.key, { weekday: 'long' }) + ' ') + (d.logged ? (d.deficit >= 0 ? U.int(d.deficit) : U.int(-d.deficit) + ' over') : 'not logged')).join(', '),
      tip: (bar, i) => {
        const d = da.days[i];
        if (!d.logged) return { title: U.relDay(d.key), rows: [['Food', 'Not logged']] };
        return { title: U.relDay(d.key) + (d.partial ? ' (so far)' : ''), rows: [['Eaten', U.kcal(d.eaten)], ['Burned', U.kcal(d.burn)], [d.deficit >= 0 ? 'Deficit' : 'Surplus', U.kcal(Math.abs(d.deficit))]] };
      }
    }));
  }
  function drawWeight(slot, a) {
    if (!slot) return;
    const u = M.units.unit, today = U.todayKey();
    const days = range === '1M' ? 30 : range === '3M' ? 91 : null;
    let from = days ? U.addDays(today, -days) : (a.series[0] ? (a.startK < a.series[0].key ? a.startK : a.series[0].key) : today);
    // a brand-new journey: don't squeeze one dot into the far corner of a 3-month axis
    if (a.series.length && a.series[0].key > U.addDays(today, -14) && (!days || days > 14)) from = U.addDays(a.series[0].key, -7);
    const inR = a.series.filter(d => d.key >= from);
    let to = from > U.addDays(today, -14) ? U.addDays(today, 7) : today;
    const proj = [];
    if (a.projKey && a.last) {
      const cap = U.addDays(today, days ? Math.round(days * 0.6) : 365);
      to = a.projKey <= cap ? a.projKey : cap;
      const frac = U.diffDays(today, to) / Math.max(1, U.diffDays(today, a.projKey));
      proj.push({ key: a.last.key, y: M.units.to(a.current) }, { key: to, y: M.units.to(a.current + (a.goalKg - a.current) * frac) });
    }
    charts.push(M.charts.lineChart(slot, {
      dots: inR.map(d => ({ key: d.key, y: M.units.to(d.avg) })),
      line: inR.map(d => ({ key: d.key, y: M.units.to(d.trend) })),
      goal: M.units.to(a.goalKg), goalLabel: 'Goal ' + M.units.n(a.goalKg, u === 'lb' ? 0 : 1) + (a.target ? ' · ' + U.fmtDate(a.target) : ''),
      projection: proj, projectionLabel: proj.length && to === a.projKey ? U.fmtDate(a.projKey) : '',
      domain: { from, to }, height: 240, yFmt: v => v.toFixed(0), latestLabel: inR.length ? M.units.n(a.current) : '',
      ariaLabel: 'Weight trend' + (a.series.length ? ', now ' + M.units.n(a.current) + ' ' + u : '') + (a.projKey ? '. At your recent pace you reach your goal around ' + U.fmtDateY(a.projKey) : ''),
      emptyText: 'Log a few weigh-ins to see your trend',
      tip: key => {
        const d = a.series.find(x => x.key === key);
        if (!d) return { title: U.fmtDateY(key), rows: [] };
        return { title: U.fmtDateY(key), rows: [['Trend', M.units.n(d.trend) + ' ' + u], [d.n > 1 ? 'Avg of ' + d.n : 'Weigh-in', M.units.n(d.avg) + ' ' + u]] };
      }
    }));
  }

  /* ================= headlines rotation ================= */
  function paintHeadline(root) {
    const box = root && root.querySelector('[data-slot="hl"]');
    if (!box || !hlList.length) return;
    const t = box.querySelector('.today-hl-text');
    const h = hlList[hlIndex % hlList.length];
    const swap = () => {
      t.innerHTML = h.html;
      t.classList.remove('out');
    };
    if (U.reduceMotion()) swap(); else { t.classList.add('out'); setTimeout(swap, 180); }
  }
  function startRotation() {
    if (hlTimer || U.reduceMotion()) return;
    hlTimer = setInterval(() => {
      if (document.hidden || hlList.length < 2) return;
      const root = document.querySelector('.today-view');
      if (!root) return;
      hlIndex = (hlIndex + 1) % hlList.length;
      paintHeadline(root);
    }, 8000);
  }

  /* ================= view ================= */
  M.views.today = {
    title: 'Today',
    narrow: false,
    render(el) {
      killCharts();
      const S = M.state, p = S.profile || {};
      const b = M.data.balance(), ta = M.data.todayActions(), a = M.data.analysis(), pl = M.data.plan(), da = M.data.deficits(7);
      const desk = isDesk(), wide = isWide();
      const fresh = M.data.headlines() || [];
      if (fresh.map(h => h.text).join('|') !== hlList.map(h => h.text).join('|')) { hlList = fresh; if (hlIndex >= hlList.length) hlIndex = 0; }
      const name = (p.name || '').trim();
      const head = '<header class="page-head today-head"><div class="ph-text"><p class="ph-over">' + esc(U.fmtDateLong(U.todayKey())) + '</p>' +
        '<h1>' + esc(U.greeting() + (name ? ', ' + name : '')) + '</h1></div></header>';

      el.innerHTML = '<div class="view today-view' + (wasShown ? ' today-still' : '') + '">' + head +
        '<div class="today-grid">' +
        '<div class="today-a-energy">' + energyCard(b) + '</div>' +
        '<div class="today-a-weight">' + weightCard(a, pl, wide) + '</div>' +
        '<div class="today-a-plan">' + planChecklist(b, ta, p) + '</div>' +
        '<div class="today-a-deficit">' + deficitCard(da, b) + '</div>' +
        (desk ? '<div class="today-a-burn">' + burnCard(b) + '</div>' : '') +
        (!desk ? '<div class="today-a-planlink">' + planLink(a, pl) + '</div>' : '') +
        '<div class="today-a-meals">' + mealsCard(b) + '</div>' +
        '<div class="today-a-weighins">' + weighCard(a, desk) + '</div>' +
        '</div></div>';
      const root = el.firstElementChild;
      wasShown = true;

      // energy mode toggle
      const segSlot = root.querySelector('[data-slot="mode"]');
      segSlot.appendChild(ui.segmented({ options: [{ value: 'sofar', label: 'So far' }, { value: 'plan', label: 'Plan' }], value: mode, ariaLabel: 'Energy balance view', onChange: v => { mode = v; M.render(); } }));
      // desktop weight range
      const rSlot = root.querySelector('[data-slot="range"]');
      if (rSlot) rSlot.appendChild(ui.segmented({ options: [{ value: '1M', label: '1M' }, { value: '3M', label: '3M' }, { value: 'All', label: 'All' }], value: range, ariaLabel: 'Chart range', onChange: v => { range = v; M.render(); } }));

      drawDeficit(root.querySelector('[data-slot="defchart"]'), da, b);
      drawWeight(root.querySelector('[data-slot="wchart"]'), a);

      // headline: tap / Enter to advance
      const hl = root.querySelector('[data-slot="hl"]');
      if (hl) {
        const next = () => { if (hlList.length < 2) return; hlIndex = (hlIndex + 1) % hlList.length; paintHeadline(root); };
        hl.addEventListener('click', next);
        hl.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); next(); } });
        if (hlList.length < 2) { hl.removeAttribute('role'); hl.removeAttribute('tabindex'); hl.removeAttribute('aria-label'); }
      }
      startRotation();

      // re-render when crossing the desktop breakpoint (layout differs)
      if (!mq) {
        try {
          mq = [matchMedia('(min-width: 1024px)'), matchMedia('(min-width: 768px)')];
          mqHandler = () => { if (document.querySelector('.today-view')) M.render(); };
          mq.forEach(q => q.addEventListener('change', mqHandler));
        } catch (e) { mq = null; }
      }
    },
    destroy() {
      wasShown = false;
      killCharts();
      if (hlTimer) { clearInterval(hlTimer); hlTimer = null; }
      if (mq && mqHandler) { try { mq.forEach(q => q.removeEventListener('change', mqHandler)); } catch (e) {} }
      mq = null; mqHandler = null;
    }
  };
})();
