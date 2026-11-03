/* Momentum v2 — PLAN view (#plan). Owner: plan builder. Styles: css/progress.css (.plan-*).
   Focal point: the goal card with the goal-path chart (your trend, the path you need, your recent pace).
   Then: What it takes (per week / per day / kcal deficit), Every day (eat under X, or eat Y + burn Z ≈ N min),
   Choose your pace (Relaxed / Steady / Ambitious), safety warning + safe date, editable target weight + date, Save plan.
   Edits are a live preview (draft) until "Save plan" writes goalKg + targetDate to the profile. */
(function () {
  'use strict';
  const M = window.M, U = M.util, ui = M.ui, C = M.calc;
  const esc = U.esc;
  const fin = v => typeof v === 'number' && isFinite(v);
  const NS_TIP = 'plan-tip';

  /* ---------- module state ---------- */
  let draft = null;          // {goal: string (display units), date: 'YYYY-MM-DD'}
  let draftFor = '';         // profile signature the draft was made from
  let chart = null;          // local goal-path chart instance
  let bound = null;

  const sig = p => (p ? [p.goalKg, p.targetDate, p.unit].join('|') : '');
  const unitOf = () => M.units.unit;
  const disp = kg => M.units.to(kg);
  const dateS = k => (U.isValidKey(k) ? U.fmtDateY(k) : '–');
  const dateL = k => (U.isValidKey(k) ? U.fmtDate(k, { month: 'short', day: 'numeric', year: 'numeric' }) : '–');
  const round10 = n => Math.round(n / 10) * 10;

  function initDraft(p, P0) {
    if (draft && draftFor === sig(p)) return;
    const goalKg = fin(p.goalKg) ? p.goalKg : null;
    draft = {
      goal: goalKg != null ? M.units.n(goalKg, unitOf() === 'kg' ? 1 : 1).replace(/\.0$/, '') : '',
      date: U.isValidKey(p.targetDate) && p.targetDate > U.todayKey() ? p.targetDate : (P0 && U.isValidKey(P0.targetDate) ? P0.targetDate : U.addDays(U.todayKey(), 84))
    };
    draftFor = sig(p);
  }

  /* ---------- derive everything from the draft ---------- */
  function model() {
    const p = M.state.profile || {};
    const today = U.todayKey();
    const kg = M.data.currentKg();
    const bal = M.data.balance();
    const typicalBurn = bal && bal.plan && fin(bal.plan.typicalBurn) ? bal.plan.typicalBurn : null;
    const goalDisp = U.parseNum(draft.goal);
    const goalKg = fin(goalDisp) ? M.units.from(goalDisp) : NaN;
    const goalOk = fin(goalKg) && goalKg >= 30 && goalKg <= 300;
    const dateOk = U.isValidKey(draft.date) && draft.date > today && U.diffDays(today, draft.date) <= 365 * 5;
    // unchanged draft goal (display-rounded, e.g. "81.6") must use the exact stored kg so Plan matches Today/Food
    const goalSame = fin(p.goalKg) && goalOk && Math.abs(goalDisp - disp(p.goalKg)) < 0.05;
    const goalEff = goalSame ? p.goalKg : goalKg;
    const P = C.plan(Object.assign({}, p, { goalKg: goalOk ? goalEff : p.goalKg, targetDate: dateOk ? draft.date : null, paceKgPerWeek: null }), { currentKg: kg, now: Date.now(), typicalBurn });
    const a = M.data.analysis();
    // recent pace projection toward the DRAFT goal
    let projKey = null, projDays = null;
    const slope = fin(a.slope) ? a.slope : null; // kg/day
    if (!P.goalReached && slope != null && Math.sign(slope) === P.dir && Math.abs(slope) > 0.0005 && P.remainingKg > 0) {
      projDays = Math.ceil(P.remainingKg / Math.abs(slope));
      if (projDays <= 3 * 365) projKey = U.addDays(today, projDays); else projDays = null;
    }
    const dirty = goalOk && dateOk && (!goalSame || draft.date !== p.targetDate);
    return { p, today, kg, bal, typicalBurn, goalKg: goalEff, goalOk, dateOk, P, a, slope, projKey, projDays, dirty };
  }

  /* ================= goal card (focal) ================= */
  function goalCard(m) {
    const u = unitOf(), P = m.P;
    const goalTxt = m.goalOk ? M.units.n(m.goalKg).replace(/\.0$/, '') : '–';
    let meta, takeaway;
    if (!m.goalOk) { meta = 'Enter a target weight below'; takeaway = 'Pick a target weight and a date to see your path.'; }
    else if (P.goalReached) { meta = 'You are already at ' + M.units.w(m.kg); takeaway = P.dir < 0 ? 'You are at or below this weight. Pick a lower target, or keep this one to maintain.' : 'You are at or above this weight already.'; }
    else {
      meta = M.units.abs(P.remainingKg) + ' ' + u + ' to go · ' + (m.dateOk ? U.plural(P.daysLeft, 'day') + ' left' : 'pick a date');
      if (m.projKey && m.dateOk) {
        const diff = U.diffDays(m.projKey, draft.date);
        const wk = Math.round(Math.abs(diff) / 7);
        if (Math.abs(diff) < 4) takeaway = 'At your recent pace you reach ' + goalTxt + ' ' + u + ' right on time.';
        else if (diff > 0) takeaway = 'At your recent pace you reach ' + goalTxt + ' ' + u + ' on ' + dateS(m.projKey) + ', ' + (wk >= 1 ? 'about ' + U.plural(wk, 'week') : U.plural(diff, 'day')) + ' early.';
        else takeaway = 'At your recent pace you reach ' + goalTxt + ' ' + u + ' on ' + dateS(m.projKey) + ', ' + (wk >= 1 ? U.plural(wk, 'week') : U.plural(-diff, 'day')) + ' after your date.';
      } else if (m.a.series.length < 4) takeaway = 'Log a few more weigh-ins and we will compare your real pace with the path you need.';
      else takeaway = 'Your recent trend is flat. The dashed line shows the pace that gets you there by ' + dateS(draft.date) + '.';
    }
    return '<p class="t-over muted">Your goal</p>' +
      '<p class="plan-goal"><span class="plan-goal-n">' + esc(goalTxt) + '</span><span class="plan-goal-u">' + esc(u) + '</span>' +
      '<span class="plan-goal-by">by ' + esc(m.dateOk ? dateL(draft.date) : '–') + '</span></p>' +
      '<p class="plan-meta">' + esc(meta) + '</p>' +
      '<h2 class="plan-takeaway">' + esc(takeaway) + '</h2>' +
      '<div class="plan-chart chart" data-plan-chart></div>' +
      '<ul class="legend plan-legend" aria-label="Legend">' +
      '<li class="legend-item"><span class="plan-key trend"></span><span>Your trend</span></li>' +
      (!P.goalReached && m.dateOk ? '<li class="legend-item"><span class="plan-key need"></span><span>Needed pace</span></li>' : '') +
      (m.projKey || (m.slope != null && m.a.series.length >= 4) ? '<li class="legend-item"><span class="plan-key proj"></span><span>Recent pace</span></li>' : '') +
      '<li class="legend-item"><span class="plan-key goal"></span><span>Goal</span></li></ul>';
  }

  /* ---------- local goal-path chart (foundation lineChart supports only one projection) ---------- */
  function goalChart(host) {
    let lastW = -1, data = null, raf = 0;
    const tip = document.createElement('div'); tip.className = 'chart-tip ' + NS_TIP; tip.setAttribute('role', 'status');
    const draw = () => {
      raf = 0;
      const W = Math.round(host.clientWidth);
      if (!W || !data) return;
      lastW = W;
      host.querySelectorAll('svg, .chart-empty').forEach(n => n.remove());
      host.insertAdjacentHTML('afterbegin', svgFor(W, data));
      if (!tip.isConnected) host.appendChild(tip);
      wire(host, W, data, tip);
    };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { if (Math.round(host.clientWidth) !== lastW && !raf) raf = requestAnimationFrame(draw); }) : null;
    if (ro) ro.observe(host);
    return {
      update(d) { data = d; draw(); if (!host.clientWidth && !raf) raf = requestAnimationFrame(draw); },
      destroy() { if (ro) ro.disconnect(); if (raf) cancelAnimationFrame(raf); host.innerHTML = ''; }
    };
  }

  function chartData(m) {
    const P = m.P, a = m.a, today = m.today;
    const trend = a.series.map(d => ({ key: d.key, y: disp(d.trend) }));
    const p = m.p;
    if (U.isValidKey(p.startDate) && fin(p.startKg) && (!trend.length || p.startDate < trend[0].key)) trend.unshift({ key: p.startDate, y: disp(p.startKg), start: true });
    const cur = disp(m.kg);
    if (!trend.length || trend[trend.length - 1].key !== today) {
      // the trend carries forward to today
      if (trend.length && trend[trend.length - 1].key < today) trend.push({ key: today, y: cur, carried: true });
      else if (!trend.length) trend.push({ key: today, y: cur });
    }
    const goal = m.goalOk ? disp(m.goalKg) : null;
    const target = m.dateOk ? draft.date : null;
    const need = !P.goalReached && target && goal != null ? { key: target, y: goal } : null;
    let end = target || U.addDays(today, 60);
    const daysT = target ? U.diffDays(today, target) : 60;
    let proj = null;
    if (m.projKey && goal != null) {
      const cap = U.addDays(today, Math.max(daysT * 2, 45));
      const pk = m.projKey <= cap ? m.projKey : cap;
      const y = m.projKey <= cap ? goal : cur + m.slope * U.diffDays(today, cap) / (M.units.unit === 'lb' ? C.LB : 1);
      proj = { key: pk, y, reaches: m.projKey <= cap, at: m.projKey };
      if (pk > end) end = pk;
    } else if (m.slope != null && a.series.length >= 4 && !P.goalReached) {
      // flat or wrong-way trend: show it honestly to the end of the window
      proj = { key: end, y: cur + m.slope * U.diffDays(today, end) / (M.units.unit === 'lb' ? C.LB : 1), reaches: false, at: null };
    }
    const start = trend[0].key < today ? trend[0].key : U.addDays(today, -7);
    return { trend, cur, goal, need, proj, from: start, to: end > today ? end : U.addDays(today, 30), today, unit: unitOf() };
  }

  function scales(W, d) {
    const H = W < 480 ? 210 : 250;
    const ms = k => U.fromKey(k).getTime();
    const ys = d.trend.map(p => p.y).concat([d.cur]);
    if (d.goal != null) ys.push(d.goal);
    if (d.proj) ys.push(d.proj.y);
    let lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys);
    const padY = Math.max((hi - lo) * 0.1, 1); lo -= padY; hi += padY;
    const yt = M.charts.niceTicks(lo, hi, 3);
    const yd = d.unit === 'kg' && yt.step < 1 ? 1 : 0;
    const gut = Math.max(30, Math.max.apply(null, yt.ticks.map(v => v.toFixed(yd).length)) * 7 + 12);
    const pad = { l: gut, r: 16, t: 18, b: 30 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const x0 = ms(d.from), x1 = ms(d.to);
    const sx = k => pad.l + (x1 === x0 ? iw / 2 : (ms(k) - x0) / (x1 - x0) * iw);
    const sy = v => pad.t + (1 - (v - yt.lo) / (yt.hi - yt.lo)) * ih;
    return { H, pad, iw, ih, sx, sy, yt, yd, x0, x1 };
  }

  function svgFor(W, d) {
    const s = scales(W, d), f = n => n.toFixed(1);
    const { H, pad, iw, sx, sy, yt, yd } = s;
    let o = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(ariaFor(d)) + '">';
    yt.ticks.forEach(v => { const y = f(sy(v)); o += '<line class="ch-grid" x1="' + pad.l + '" x2="' + (pad.l + iw) + '" y1="' + y + '" y2="' + y + '"/><text x="' + (pad.l - 8) + '" y="' + y + '" dy="4" text-anchor="end">' + esc(v.toFixed(yd)) + '</text>'; });
    // x labels, de-collided by priority
    const xl = [{ x: sx(d.today), t: 'Today', cls: 'ch-strong', pr: 0, anchor: 'middle' }];
    if (d.need) xl.push({ x: sx(d.need.key), t: U.fmtDate(d.need.key), cls: 'ch-label', pr: 1 });
    if (d.proj && d.proj.reaches) xl.push({ x: sx(d.proj.key), t: U.fmtDate(d.proj.key), cls: 'ch-label', pr: 2 });
    xl.push({ x: pad.l, t: U.fmtDate(d.from), cls: '', pr: 3 });
    if (!d.need || d.to !== d.need.key) xl.push({ x: pad.l + iw, t: U.fmtDate(d.to), cls: '', pr: 4 });
    const kept = [];
    xl.sort((p, q) => p.pr - q.pr).forEach(l => {
      const w = l.t.length * 7 + 8;
      l.anchor = l.x - w / 2 < pad.l - 6 ? 'start' : l.x + w / 2 > W - 2 ? 'end' : 'middle';
      l.l = l.anchor === 'start' ? l.x : l.anchor === 'end' ? l.x - w : l.x - w / 2; l.r = l.l + w;
      if (kept.every(k => l.r < k.l || l.l > k.r)) kept.push(l);
    });
    kept.forEach(l => { o += '<text' + (l.cls ? ' class="' + l.cls + '"' : '') + ' x="' + f(l.x) + '" y="' + (H - 8) + '" text-anchor="' + l.anchor + '">' + esc(l.t) + '</text>'; });
    // today marker
    const tx = sx(d.today);
    o += '<line x1="' + f(tx) + '" x2="' + f(tx) + '" y1="' + pad.t + '" y2="' + (H - pad.b) + '" stroke="var(--line-strong)" stroke-width="1"/>';
    // goal
    if (d.goal != null) {
      const gy = f(sy(d.goal));
      o += '<line x1="' + pad.l + '" x2="' + (pad.l + iw) + '" y1="' + gy + '" y2="' + gy + '" stroke="var(--d-goal)" stroke-width="2" stroke-dasharray="6 5" stroke-linecap="round"/>';
      const gLabel = 'Goal ' + d.goal.toFixed(d.unit === 'kg' ? 1 : 0).replace(/\.0$/, '') + ' ' + d.unit;
      const above = sy(d.goal) - 8 > pad.t + 6;
      o += '<text class="ch-label" x="' + (pad.l + 6) + '" y="' + gy + '" dy="' + (above ? -8 : 16) + '" style="paint-order:stroke;stroke:var(--surface);stroke-width:4px">' + esc(gLabel) + '</text>';
    }
    const cx = sx(d.today), cy = sy(d.cur);
    // needed path
    if (d.need) o += '<path d="M' + f(cx) + ',' + f(cy) + 'L' + f(sx(d.need.key)) + ',' + f(sy(d.need.y)) + '" fill="none" stroke="var(--teal)" stroke-width="2" stroke-dasharray="8 6" stroke-linecap="round"/>';
    // recent pace
    if (d.proj) o += '<path d="M' + f(cx) + ',' + f(cy) + 'L' + f(sx(d.proj.key)) + ',' + f(sy(d.proj.y)) + '" fill="none" stroke="var(--d-proj)" stroke-width="2.5" stroke-dasharray="1 6" stroke-linecap="round"/>';
    // trend
    if (d.trend.length >= 2) o += '<path d="' + M.charts.monoPath(d.trend.map(p => ({ x: sx(p.key), y: sy(p.y) }))) + '" fill="none" stroke="var(--d-trend)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';
    // end markers
    if (d.need) o += '<circle cx="' + f(sx(d.need.key)) + '" cy="' + f(sy(d.need.y)) + '" r="5" fill="var(--teal)" stroke="var(--surface)" stroke-width="2"/>';
    if (d.proj) o += '<circle cx="' + f(sx(d.proj.key)) + '" cy="' + f(sy(d.proj.y)) + '" r="5" fill="var(--d-proj)" stroke="var(--surface)" stroke-width="2"/>';
    o += '<circle cx="' + f(cx) + '" cy="' + f(cy) + '" r="6" fill="var(--d-trend)" stroke="var(--surface)" stroke-width="2.5"/>';
    // current value pill, placed left of today (space on the right is the future)
    const lbl = d.cur.toFixed(1), tw = lbl.length * 7.4 + 16;
    let bx = cx - tw - 10; if (bx < pad.l + 2) bx = cx + 10;
    const by = Math.max(2, Math.min(cy - 34, H - pad.b - 28));
    o += '<rect x="' + f(bx) + '" y="' + f(by) + '" width="' + f(tw) + '" height="26" rx="13" fill="var(--ink)"/><text x="' + f(bx + tw / 2) + '" y="' + f(by + 17) + '" text-anchor="middle" style="fill:var(--surface);font-weight:700">' + esc(lbl) + '</text>';
    // hover layer
    o += '<line class="ch-cross" x1="0" x2="0" y1="' + pad.t + '" y2="' + (H - pad.b) + '" stroke="var(--line-strong)" stroke-width="1" opacity="0"/>';
    o += '<rect class="ch-hit" x="' + pad.l + '" y="0" width="' + iw + '" height="' + H + '" fill="transparent" style="cursor:crosshair;touch-action:pan-y"/>';
    return o + '</svg>';
  }

  function ariaFor(d) {
    const u = d.unit;
    let t = 'Goal path. Now ' + d.cur.toFixed(1) + ' ' + u + '.';
    if (d.goal != null) t += ' Goal ' + d.goal.toFixed(1) + ' ' + u + '.';
    if (d.need) t += ' Needed path reaches it on ' + U.fmtDate(d.need.key) + '.';
    if (d.proj && d.proj.reaches) t += ' At your recent pace you reach it on ' + U.fmtDate(d.proj.key) + '.';
    return t;
  }

  function wire(host, W, d, tip) {
    const svg = host.querySelector('svg'); if (!svg) return;
    const s = scales(W, d);
    const cross = svg.querySelector('.ch-cross'), hit = svg.querySelector('.ch-hit');
    const u = d.unit;
    const lerp = (a, b, k) => { const span = U.diffDays(a.key, b.key); if (span <= 0) return b.y; return a.y + (b.y - a.y) * U.clamp(U.diffDays(a.key, k) / span, 0, 1); };
    const move = ev => {
      const r = svg.getBoundingClientRect();
      const px = (ev.clientX - r.left) * (W / r.width);
      const frac = U.clamp((px - s.pad.l) / s.iw, 0, 1);
      const key = U.keyOf(s.x0 + frac * (s.x1 - s.x0));
      const rows = [];
      let y = null;
      if (key <= d.today) {
        let best = d.trend[0];
        d.trend.forEach(p => { if (Math.abs(U.diffDays(p.key, key)) < Math.abs(U.diffDays(best.key, key))) best = p; });
        rows.push(['Trend', best.y.toFixed(1) + ' ' + u, 'var(--d-trend)']);
        y = best.y;
        const x = s.sx(best.key);
        cross.setAttribute('x1', x); cross.setAttribute('x2', x);
        showAt(best.key, x, rows);
        return;
      }
      const here = { key: d.today, y: d.cur };
      if (d.need && key <= d.need.key) { const v = lerp(here, d.need, key); rows.push(['Needed path', v.toFixed(1) + ' ' + u, 'var(--teal)']); y = v; }
      if (d.proj && key <= d.proj.key) { const v = lerp(here, d.proj, key); rows.push(['Recent pace', v.toFixed(1) + ' ' + u, 'var(--d-proj)']); if (y == null) y = v; }
      if (!rows.length) rows.push(['Goal', d.goal != null ? d.goal.toFixed(1) + ' ' + u : '–']);
      const x = s.sx(key);
      cross.setAttribute('x1', x); cross.setAttribute('x2', x);
      showAt(key, x, rows);
    };
    const showAt = (key, x, rows) => {
      cross.setAttribute('opacity', '1');
      const r = svg.getBoundingClientRect();
      tip.innerHTML = '<div class="tt-title">' + esc(U.relDay(key)) + '</div>' + rows.map(rw => '<div class="tt-row"><span>' + (rw[2] ? '<span class="dot" style="background:' + rw[2] + ';margin-right:6px"></span>' : '') + esc(rw[0]) + '</span><b>' + esc(rw[1]) + '</b></div>').join('');
      tip.classList.add('on');
      const tw = tip.offsetWidth, hw = host.clientWidth;
      const left = U.clamp(x * (r.width / W) - tw / 2, 0, Math.max(0, hw - tw));
      tip.style.left = left + 'px'; tip.style.top = '-8px';
    };
    const leave = () => { tip.classList.remove('on'); cross.setAttribute('opacity', '0'); };
    hit.addEventListener('pointermove', move); hit.addEventListener('pointerdown', move); hit.addEventListener('pointerleave', leave);
  }

  /* ================= what it takes ================= */
  function takesCard(m) {
    const u = unitOf(), P = m.P;
    const ok = m.goalOk && !P.goalReached;
    const perWeek = ok ? M.units.abs(P.kgPerWeek) : '0.0';
    const perDay = ok ? M.units.abs(P.kgPerDay, 2) : '0.00';
    const kcal = ok ? U.int(P.kcalPerDay) : '0';
    const word = P.dir < 0 ? 'deficit' : 'surplus';
    return '<div class="card-head"><div class="ch-text"><h2 class="card-title">What it takes</h2><p class="card-sub">' + esc(ok ? (m.dateOk ? 'To reach ' + M.units.n(m.goalKg).replace(/\.0$/, '') + ' ' + u + ' by ' + dateS(draft.date) : 'At a steady default pace') : 'Nothing extra while you are at your goal') + '</p></div></div>' +
      '<div class="plan-takes">' +
      '<div class="plan-take"><p class="plan-take-v"><span>' + esc(perWeek) + '</span><span class="plan-take-u">' + esc(u) + '</span></p><p class="plan-take-l">per week</p></div>' +
      '<div class="plan-take"><p class="plan-take-v"><span>' + esc(perDay) + '</span><span class="plan-take-u">' + esc(u) + '</span></p><p class="plan-take-l">per day</p></div>' +
      '<div class="plan-take plan-take-hero"><p class="plan-take-v"><span>' + esc(kcal) + '</span><span class="plan-take-u">kcal</span></p><p class="plan-take-l">' + word + ' per day</p></div>' +
      '</div>';
  }

  /* ================= every day ================= */
  function everyCard(m) {
    const P = m.P, bal = m.bal;
    const burn = m.typicalBurn;
    const bmr = bal ? bal.bmr : null;
    if (!fin(burn) || !fin(P.budget)) {
      return '<div class="card-head"><div class="ch-text"><h2 class="card-title">Every day</h2></div></div>' +
        '<p class="t-body ink-2">Add your height, age and sex in your profile so we can work out your daily calorie budget.</p><div><a class="btn btn-tonal btn-sm" href="#profile">Open profile</a></div>';
    }
    const actPart = burn - (bmr || 0);
    const burnExplain = 'when you burn about ' + U.int(burn) + ' kcal' + (fin(bmr) ? ' (resting ' + U.int(bmr) + (actPart > 5 ? ' + activity ' + U.int(actPart) : '') + ')' : '');
    let head;
    if (P.goalReached || !m.goalOk) {
      head = '<div class="plan-eat"><span class="ic-bubble brand">' + M.icon('food') + '</span><div class="plan-eat-text"><p class="plan-eat-line"><span>Eat about </span><b class="plan-eat-n">' + esc(U.int(burn)) + '</b><span class="plan-eat-u">kcal</span></p><p class="plan-eat-sub">to hold your weight, ' + esc(burnExplain) + '</p></div></div>';
      return '<div class="card-head"><div class="ch-text"><h2 class="card-title">Every day</h2></div></div>' + head;
    }
    const losing = P.dir < 0;
    const budget = Math.max(0, P.budget);
    head = '<div class="plan-eat"><span class="ic-bubble brand">' + M.icon('food') + '</span><div class="plan-eat-text">' +
      '<p class="plan-eat-line"><span>' + (losing ? 'Eat under ' : 'Eat at least ') + '</span><b class="plan-eat-n">' + esc(U.int(budget)) + '</b><span class="plan-eat-u">kcal</span></p>' +
      '<p class="plan-eat-sub">on a typical day, ' + esc(burnExplain) + '</p></div></div>' +
      (P.lowBudget ? '<p class="plan-floor">' + M.icon('alert', 'sm') + '<span>That is below ' + esc(U.int(P.minKcal)) + ' kcal. Eat at least that and move more instead, as below.</span></p>' : '');
    if (!losing) return '<div class="card-head"><div class="ch-text"><h2 class="card-title">Every day</h2></div></div>' + head;
    // option B: eat a bit more and burn the difference
    const extra = P.lowBudget ? Math.max(100, round10(P.minKcal - budget) + 150) : (P.kcalPerDay >= 300 ? 300 : Math.max(100, round10(P.kcalPerDay)));
    const eatAlt = round10(budget + extra);
    const eq = C.equivalents(extra, m.kg);
    const units = M.units.unit === 'kg';
    const rows = [
      { icon: 'activity', t: 'Treadmill', s: units ? '5.6 km/h, 5% incline' : '3.5 mph, 5% incline', n: U.int(eq.treadmillMin), u: 'min' },
      { icon: 'route', t: 'Brisk walk', s: 'Outside, flat ground', n: U.int(eq.walkMin), u: 'min' },
      { icon: 'steps', t: 'Extra steps', s: 'On top of your usual day', n: U.int(eq.steps), u: 'steps' }
    ];
    return '<div class="card-head"><div class="ch-text"><h2 class="card-title">Every day</h2></div></div>' + head +
      '<div class="plan-or" aria-hidden="true"><span></span><b>or</b><span></span></div>' +
      '<p class="plan-alt">Eat about <b class="nowrap">' + esc(U.int(eatAlt)) + ' kcal</b> and burn <b class="nowrap">' + esc(U.int(extra)) + ' extra</b>. That is any one of these:</p>' +
      '<ul class="plan-moves">' + rows.map(r => '<li class="plan-move"><span class="ic-bubble sm teal">' + M.icon(r.icon) + '</span><span class="plan-move-text"><span class="plan-move-t">' + esc(r.t) + '</span><span class="plan-move-s">' + esc(r.s) + '</span></span><span class="plan-move-v"><b>' + esc(r.n) + '</b><span>' + esc(r.u) + '</span></span></li>').join('') + '</ul>';
  }

  /* ================= pace + edit ================= */
  function paceCard(m) {
    const P = m.P, u = unitOf();
    const sc = m.goalOk && !P.goalReached ? P.scenarios : [];
    let scen = '';
    if (sc.length) {
      scen = '<div class="plan-scen" role="radiogroup" aria-label="Choose your pace">' + sc.map(s => {
        const on = draft.date === s.date;
        return '<button type="button" class="plan-sc' + (on ? ' is-on' : '') + '" role="radio" aria-checked="' + on + '" data-scen="' + esc(s.date) + '">' +
          '<span class="plan-sc-l"><span class="plan-sc-name">' + esc(s.label) + (!s.safe ? ' <span class="badge warn plan-sc-badge">' + (s.kgPerWeek > P.maxSafeKgPerWeek + 1e-9 ? 'Too fast' : 'Low budget') + '</span>' : '') + '</span><span class="plan-sc-pace">' + esc(String(+Math.abs(M.units.to(s.kgPerWeek)).toFixed(2)) + ' ' + u + ' / week') + '</span></span>' +
          '<span class="plan-sc-r"><span class="plan-sc-date">' + esc(dateL(s.date)) + '</span><span class="plan-sc-budget">' + (fin(s.budget) ? esc(U.int(s.budget) + ' kcal / day') : '') + '</span></span>' +
          '</button>';
      }).join('') + '</div>';
    }
    let warn = '';
    if (m.goalOk && m.dateOk && !P.goalReached && (P.tooFast || P.lowBudget)) {
      const max = M.units.abs(P.maxSafeKgPerWeek);
      const txt = P.tooFast
        ? M.units.abs(P.kgPerWeek) + ' ' + u + ' a week is more than 1% of your body weight (' + max + ' ' + u + '). Losing faster than that costs muscle and is hard to keep up.'
        : 'That means eating ' + U.int(P.budget) + ' kcal a day, below the ' + U.int(P.minKcal) + ' kcal minimum we recommend' + (m.p.sex === 'female' ? ' for women.' : ' for men.');
      warn = '<div class="notice warn plan-warn" role="note">' + M.icon('alert') + '<div><p>' + esc(txt) + '</p>' +
        (P.safeDate ? '<button type="button" class="btn btn-outline btn-sm plan-safe" data-safe="' + esc(P.safeDate) + '"><span class="btn-label">Use a safer date: ' + esc(dateS(P.safeDate)) + '</span></button>' : '') + '</div></div>';
    }
    return '<div class="card-head"><div class="ch-text"><h2 class="card-title" id="plan-pace">Choose your pace</h2><p class="card-sub">Tap a pace, or set your own date below</p></div></div>' +
      scen + warn;
  }

  function formHTML(m) {
    const u = unitOf();
    const min = U.addDays(m.today, 1);
    return '<div class="plan-form">' +
      '<div class="field"><label class="label" for="plan-goal">Target weight</label><div class="input-wrap"><input class="input num-input" id="plan-goal" inputmode="decimal" autocomplete="off" value="' + esc(draft.goal) + '"><span class="suffix">' + esc(u) + '</span></div><p class="error-text" id="plan-goal-err" hidden></p></div>' +
      '<div class="field"><label class="label" for="plan-date">Target date</label><input class="input" id="plan-date" type="date" min="' + min + '" value="' + esc(draft.date) + '"><p class="error-text" id="plan-date-err" hidden></p></div>' +
      '</div>';
  }

  function saveHTML(m) {
    return '<div class="plan-save">' +
      '<button type="button" class="btn btn-primary btn-block" data-save' + (m.dirty ? '' : ' disabled') + '>' + M.icon('check') + '<span class="btn-label">' + (m.dirty ? 'Save plan' : 'Plan saved') + '</span></button>' +
      (m.dirty ? '<button type="button" class="btn btn-ghost btn-block" data-reset><span class="btn-label">Undo changes</span></button>' : '<p class="plan-save-note">Change your target or date to update your plan.</p>') +
      '</div>';
  }

  /* ================= paint (partial, keeps inputs focused) ================= */
  function paint(el) {
    const m = model();
    const set = (slot, html) => { const n = el.querySelector('[data-slot="' + slot + '"]'); if (n) n.innerHTML = html; };
    if (chart) { chart.destroy(); chart = null; }
    set('goal', goalCard(m));
    set('takes', takesCard(m));
    set('every', everyCard(m));
    set('pace', paceCard(m));
    set('save', saveHTML(m));
    const host = el.querySelector('[data-plan-chart]');
    if (host) { chart = goalChart(host); chart.update(chartData(m)); }
    // field errors
    const ge = el.querySelector('#plan-goal-err'), de = el.querySelector('#plan-date-err');
    const gi = el.querySelector('#plan-goal'), di = el.querySelector('#plan-date');
    const err = (inp, box, msg) => { if (!inp || !box) return; box.hidden = !msg; box.textContent = msg || ''; inp.setAttribute('aria-invalid', msg ? 'true' : 'false'); };
    err(gi, ge, draft.goal.trim() && !m.goalOk ? 'Enter a weight between ' + M.units.n(30, 0) + ' and ' + M.units.n(300, 0) + ' ' + unitOf() + '.' : '');
    err(di, de, draft.date && !m.dateOk ? 'Pick a date after today.' : '');
    return m;
  }

  function bind(el) {
    if (bound === el) return;
    bound = el;
    el.addEventListener('input', e => {
      if (!e.target.closest('.plan-view')) return;
      if (e.target.id === 'plan-goal') { draft.goal = e.target.value; paint(el); }
      else if (e.target.id === 'plan-date') { draft.date = e.target.value; paint(el); }
    });
    el.addEventListener('change', e => {
      if (!e.target.closest('.plan-view')) return;
      if (e.target.id === 'plan-date') { draft.date = e.target.value; paint(el); }
    });
    el.addEventListener('click', e => {
      if (!e.target.closest('.plan-view')) return;
      const sc = e.target.closest('[data-scen]');
      if (sc) { draft.date = sc.dataset.scen; const di = el.querySelector('#plan-date'); if (di) di.value = draft.date; paint(el); return; }
      const sf = e.target.closest('[data-safe]');
      if (sf) { draft.date = sf.dataset.safe; const di = el.querySelector('#plan-date'); if (di) di.value = draft.date; paint(el); ui.toast('Date moved to ' + dateS(draft.date) + '. Save to keep it.'); return; }
      if (e.target.closest('[data-reset]')) { draftFor = ''; draft = null; M.render(); return; }
      if (e.target.closest('[data-save]')) {
        const m = model();
        if (!m.goalOk || !m.dateOk) { paint(el); const bad = el.querySelector('[aria-invalid="true"]'); if (bad) bad.focus(); return; }
        const prev = { goalKg: m.p.goalKg, targetDate: m.p.targetDate };
        M.store.setProfile({ goalKg: m.goalKg, targetDate: draft.date, paceKgPerWeek: m.P.kgPerWeek });
        draft = null; draftFor = '';
        const msg = fin(m.P.budget) && !m.P.goalReached ? 'Plan saved. Your daily budget is ' + U.int(Math.max(0, m.P.budget)) + ' kcal.' : 'Plan saved.';
        ui.toast(msg, { action: { label: 'Undo', fn: () => M.store.setProfile(prev) } });
      }
    });
  }

  M.views.plan = {
    title: 'Plan',
    narrow: false,
    render(el) {
      const p = M.state.profile || {};
      initDraft(p, M.data.plan());
      const m = model();
      el.innerHTML = '<div class="view plan-view">' +
        '<header class="page-head plan-head"><div class="ph-text"><div class="plan-titlerow"><a class="btn-icon plan-back" href="#today" aria-label="Back to Today">' + M.icon('back') + '</a><h1>Your plan</h1></div>' +
        '<p class="ph-sub">Where you are going, by when, and exactly what it takes each day.</p></div></header>' +
        '<div class="plan-layout">' +
        '<div class="plan-col plan-col-main">' +
        '<section class="card hero plan-o1 plan-goalcard" aria-label="Goal" data-slot="goal"></section>' +
        '<section class="card plan-o3" aria-label="Every day" data-slot="every"></section>' +
        '</div>' +
        '<div class="plan-col plan-col-side">' +
        '<section class="card plan-o2" aria-label="What it takes" data-slot="takes"></section>' +
        '<section class="card plan-o4 plan-pacecard" aria-labelledby="plan-pace"><div data-slot="pace" class="plan-pace-slot"></div>' + formHTML(m) + '<div data-slot="save"></div></section>' +
        '</div></div></div>';
      paint(el);
      bind(el);
    },
    destroy() { if (chart) { chart.destroy(); chart = null; } }
  };
})();
