/* Momentum v2 — BMI view (#bmi). Owner: BMI builder. Styles: css/bmi.css (.bmi-*).
   Sub-screen (not a nav tab) reached from Progress (BMI tile) and Profile (body stats); back button returns to M.prevRoute.
   Focal point: current BMI + category pill + a personal BMI scale (bands, boundary weights for the user's height,
   Start / Now / Goal markers). Then: healthy weight range (distance, weeks at plan pace, optional "Set goal to X"),
   category milestone, BMI trend over tinted category bands (+ projection at plan pace), About BMI + optional waist. */
(function () {
  'use strict';
  const M = window.M, U = M.util, ui = M.ui, C = M.calc;
  const esc = U.esc;
  const fin = v => typeof v === 'number' && isFinite(v);

  /* ---------- module state ---------- */
  let range = 'All';           // trend chart range: '1M' | '3M' | 'All'
  let justSet = null;          // {prevKg, newKg} after "Set goal to X" (inline confirmation + undo)
  let bound = null, ro = null, lastW = {}, model = null, goalToast = null;

  /* ---------- shared BMI API with a local fallback (calc.js provides it) ---------- */
  const CATS = [
    { key: 'under', label: 'Underweight', short: 'Under', min: 0, max: 18.5 },
    { key: 'healthy', label: 'Healthy', short: 'Healthy', min: 18.5, max: 25 },
    { key: 'over', label: 'Overweight', short: 'Over', min: 25, max: 30 },
    { key: 'obese', label: 'Obese', short: 'Obese', min: 30, max: Infinity }
  ];
  const bmiOf = (kg, cm) => (C.bmi ? C.bmi(kg, cm) : (fin(kg) && fin(cm) && cm > 0 ? kg / Math.pow(cm / 100, 2) : null));
  // classify the value the user SEES (1 decimal): 24.96 shows as "25.0" and must read Overweight, not Healthy
  const catOf = b => { if (!fin(b)) return null; b = Math.round(b * 10) / 10; return CATS[b < 18.5 ? 0 : b < 25 ? 1 : b < 30 ? 2 : 3]; };
  const kgFor = (b, cm) => (C.weightForBmi ? C.weightForBmi(b, cm) : b * Math.pow(cm / 100, 2));
  const rank = k => ({ under: 1, healthy: 0, over: 1, obese: 2 })[k];   // distance from healthy

  /* ---------- formatting ---------- */
  const unit = () => M.units.unit;
  const b1 = b => (fin(b) ? b.toFixed(1) : '–');
  /** weight label: whole lb, or 0.1 kg */
  const wRound = kg => (fin(kg) ? (unit() === 'lb' ? String(Math.round(M.units.to(kg))) : M.units.to(kg).toFixed(1)) : '–');
  const wAbs = kg => M.units.abs(kg);
  const pace = kgw => (unit() === 'lb' ? M.units.abs(kgw) : Math.abs(kgw).toFixed(2).replace(/0$/, '')) + ' ' + unit() + '/wk';
  const nw = s => '<span class="nowrap">' + s + '</span>';
  const strong = s => '<b class="bmi-strong nowrap">' + s + '</b>';
  const dateS = k => (U.isValidKey(k) ? U.fmtDateY(k) : '–');

  /* ================= model ================= */
  function build() {
    const p = M.state.profile || {};
    const cm = +p.heightCm;
    if (!fin(cm) || cm < 90 || cm > 260) return { p, noHeight: true };
    const kg = M.data.currentKg();
    const bmi = bmiOf(kg, cm);
    if (!fin(bmi)) return { p, noWeight: true };
    const cat = catOf(bmi);
    const minKg = kgFor(18.5, cm), maxKg = kgFor(24.9, cm);
    const startBmi = bmiOf(+p.startKg, cm), goalBmi = bmiOf(+p.goalKg, cm);
    const pl = M.data.plan() || {};
    const pacePerWeek = fin(pl.kgPerWeek) && pl.kgPerWeek > 0.01 ? pl.kgPerWeek : null;
    const a = M.data.analysis();
    const series = ((a && a.series) || []).filter(d => fin(d.trend)).map(d => ({ key: d.key, kg: d.trend, bmi: bmiOf(d.trend, cm) }));
    const today = U.todayKey();
    // projection target: the healthy edge in the plan's direction, else the goal
    let proj = null;
    if (pacePerWeek) {
      let tKg = null, label = '';
      if ((cat.key === 'over' || cat.key === 'obese') && pl.dir < 0) { tKg = maxKg; label = 'healthy'; }
      else if (cat.key === 'under' && pl.dir > 0) { tKg = minKg; label = 'healthy'; }
      else if (!pl.goalReached && fin(+p.goalKg)) { tKg = +p.goalKg; label = 'goal'; }
      if (tKg != null && (tKg - kg) * pl.dir > 0.05) {
        const days = Math.ceil(Math.abs(tKg - kg) / pacePerWeek * 7);
        if (days > 0 && days <= 365 * 3) proj = { kg: tKg, bmi: bmiOf(tKg, cm), key: U.addDays(today, days), days, label };
      }
    }
    return { p, cm, kg, bmi, cat, minKg, maxKg, startBmi, goalBmi, pl, pacePerWeek, series, today, proj, crossings: crossings(series) };
  }

  /** dates when the trend changed category (from the weight history) */
  function crossings(series) {
    const out = [];
    for (let i = 1; i < series.length; i++) {
      const a = catOf(series[i - 1].bmi), b = catOf(series[i].bmi);
      if (a && b && a.key !== b.key) out.push({ key: series[i].key, from: a, to: b, better: rank(b.key) < rank(a.key) });
    }
    return out;
  }
  const boundaryBetween = (a, b) => (a.key === 'obese' || b.key === 'obese' ? 30 : a.key === 'under' || b.key === 'under' ? 18.5 : 25);

  /* ================= sections ================= */
  function head(m) {
    const p = m.p;
    const prev = M.prevRoute && M.views[M.prevRoute] ? M.prevRoute : 'progress';
    const prevLabel = (M.views[prev] && M.views[prev].title) || 'Progress';
    const bits = ['Body mass index'];
    if (fin(+p.heightCm) && +p.heightCm > 0) bits.push(M.units.height(+p.heightCm));
    if (p.sex === 'male' || p.sex === 'female') bits.push(p.sex);
    const age = C.age(p.birthYear); if (fin(age)) bits.push(String(age));
    return '<header class="page-head bmi-head"><div class="ph-text"><div class="bmi-titlerow">' +
      '<a class="btn-icon bmi-back" href="#' + prev + '" aria-label="Back to ' + esc(prevLabel) + '">' + M.icon('back') + '</a>' +
      '<div class="bmi-titletext"><h1>BMI</h1><p class="bmi-head-sub">' + esc(bits.slice(0, 1).join('') + (bits.length > 1 ? ' · ' + bits.slice(1).join(', ') : '')) + '</p></div></div></div></header>';
  }

  function pill(cat) {
    return '<span class="bmi-pill bmi-c-' + cat.key + '"><span class="bmi-pill-dot" aria-hidden="true"></span>' + esc(cat.label) + '</span>';
  }

  function heroCard(m) {
    const p = m.p;
    let sub = strong(esc(M.units.w(m.kg)));
    if (fin(m.startBmi) && U.isValidKey(p.startDate) && p.startDate < m.today) {
      const d = m.bmi - m.startBmi;
      sub += Math.abs(d) < 0.05 ? ' · same as ' + nw('on ' + esc(dateS(p.startDate))) : ' · ' + (d < 0 ? 'down' : 'up') + ' from ' + nw(esc(b1(m.startBmi)) + ' on ' + esc(dateS(p.startDate)));
    } else sub += ' · trend weight';
    return '<section class="card hero bmi-hero bmi-o1" aria-labelledby="bmi-now-t">' +
      '<h2 id="bmi-now-t" class="sr-only">Your BMI today</h2>' +
      '<div><div class="bmi-now"><p class="bmi-now-v"><span class="bmi-now-n">' + b1(m.bmi) + '</span><span class="bmi-now-u">BMI</span></p>' + pill(m.cat) + '</div>' +
      '<p class="bmi-now-sub">' + sub + '</p></div>' +
      '<div class="bmi-scale" data-slot="scale" aria-hidden="false"></div></section>';
  }

  /** Round a target weight to the display unit, staying inside the healthy range */
  function niceTarget(kg, side, cm) {
    const step = unit() === 'lb' ? 1 : 0.1;
    let v = Math.round(M.units.to(kg) / step) * step;
    const ok = x => { const c = catOf(bmiOf(M.units.from(x), cm)); return !!c && c.key === 'healthy'; };
    for (let i = 0; i < 5 && !ok(v); i++) v += side === 'max' ? -step : step;
    return M.units.from(Math.round(v * 10) / 10);
  }

  function rangeCard(m) {
    const u = unit(), p = m.p;
    const rng = u === 'lb' ? wRound(m.minKg) + '–' + wRound(m.maxKg) : M.units.to(m.minKg).toFixed(1) + '–' + M.units.to(m.maxKg).toFixed(1);
    let body = '', note = '', action = '';
    const weeks = kgDiff => (m.pacePerWeek ? Math.max(1, Math.round(kgDiff / m.pacePerWeek)) : null);
    if (m.cat.key === 'over' || m.cat.key === 'obese') {
      const d = m.kg - m.maxKg;
      const w = m.pl.dir < 0 ? weeks(d) : null;
      body = 'You’re ' + strong(esc(wAbs(d) + ' ' + u)) + ' from the healthy range' +
        (w ? ' — about ' + strong(esc(U.plural(w, 'week'))) + ' at your plan pace ' + nw('(' + esc(pace(m.pacePerWeek)) + ').') : '.');
    } else if (m.cat.key === 'healthy') {
      const room = m.maxKg - m.kg;
      body = 'You’re inside it' + (room > 0.2 ? ', with ' + strong(esc(wAbs(room) + ' ' + u)) + ' of room below the top of the range.' : ', right at the top edge.') + ' Keeping steady here is a great outcome.';
    } else {
      const d = m.minKg - m.kg;
      const w = m.pl.dir > 0 ? weeks(d) : null;
      body = 'You’re ' + strong(esc(wAbs(d) + ' ' + u)) + ' below the healthy range.' +
        (w ? ' Gaining gradually, about ' + strong(esc(U.plural(w, 'week'))) + ' at your plan pace ' + nw('(' + esc(pace(m.pacePerWeek)) + ').') : ' A gradual gain would bring you into it. If you’ve lost weight without trying, check in with your doctor.');
    }
    // goal vs healthy range
    if (fin(m.goalBmi) && fin(+p.goalKg)) {
      const goalTxt = nw(esc(wRound(+p.goalKg) + ' ' + u));
      const gk = catOf(m.goalBmi).key;
      if ((gk === 'over' || gk === 'obese') && m.cat.key !== 'under') {
        const target = niceTarget(m.maxKg, 'max', m.cm);
        note = 'Your ' + goalTxt + ' goal is a BMI of ' + nw(b1(m.goalBmi)) + ', ' + nw(esc(wRound(+p.goalKg - m.maxKg) + ' ' + u)) + ' above the healthy range. Totally fine to keep it.';
        // offer it while the goal is still ahead, or once it is reached (the natural next goal)
        if (!(justSet && Math.abs(justSet.newKg - +p.goalKg) < 0.01) && ((m.pl.goalReached && target < m.kg) || (+p.goalKg - m.kg) * (m.pl.dir || -1) >= -0.05))
          action = '<button type="button" class="btn btn-secondary btn-sm bmi-setgoal" data-bmi="setgoal" data-kg="' + target + '" aria-label="Set goal to ' + esc(wRound(target) + ' ' + u) + ', the top of your healthy range">' +
            '<span class="btn-label">Set goal to ' + esc(wRound(target) + ' ' + u) + '</span></button>';
      } else if (gk === 'under') {
        const target = niceTarget(m.minKg, 'min', m.cm);
        note = 'Your ' + goalTxt + ' goal is a BMI of ' + nw(b1(m.goalBmi)) + ', below the healthy range. A goal of at least ' + nw(esc(wRound(target) + ' ' + u)) + ' keeps you in it.';
        action = '<button type="button" class="btn btn-secondary btn-sm bmi-setgoal" data-bmi="setgoal" data-kg="' + target + '" aria-label="Set goal to ' + esc(wRound(target) + ' ' + u) + ', the bottom of your healthy range">' +
          '<span class="btn-label">Set goal to ' + esc(wRound(target) + ' ' + u) + '</span></button>';
      } else if (gk === 'healthy' && m.cat.key !== 'healthy') {
        note = 'Your ' + goalTxt + ' goal is a BMI of ' + nw(b1(m.goalBmi)) + ', inside the healthy range.';
      } else if (m.cat.key === 'under') {
        // underweight users are only ever told about gaining: a goal above the range is not flagged here
        note = 'Your ' + goalTxt + ' goal passes through the healthy range, which starts at ' + nw(esc(wRound(m.minKg) + ' ' + u)) + '.';
      }
    }
    if (justSet && fin(+p.goalKg) && Math.abs(justSet.newKg - +p.goalKg) < 0.01) {
      action = '<div class="bmi-goalset"><span class="bmi-goalset-ic" aria-hidden="true">' + M.icon('check', 'xs') + '</span>' +
        '<span class="bmi-goalset-t" role="status">Goal set to ' + esc(wRound(justSet.newKg) + ' ' + u) + '</span>' +
        '<button type="button" class="link-btn" data-bmi="undo" aria-label="Undo, keep goal at ' + esc(wRound(justSet.prevKg) + ' ' + u) + '">Undo</button></div>';
    }
    return '<section class="card bmi-range bmi-o2" aria-labelledby="bmi-hr-t">' +
      '<div><h2 class="card-title" id="bmi-hr-t">Your healthy weight range</h2>' +
      '<p class="bmi-range-v"><span class="bmi-range-n">' + esc(rng) + '</span><span class="bmi-range-u">' + u + '</span><span class="bmi-range-for">for ' + esc(M.units.height(m.cm)) + '</span></p></div>' +
      '<p class="bmi-body">' + body + '</p>' +
      (note ? '<p class="bmi-note">' + note + '</p>' : '') + action + '</section>';
  }

  function milestoneCard(m) {
    const u = unit();
    const last = m.crossings.filter(c => c.better && rank(c.to.key) >= rank(m.cat.key)).slice(-1)[0];
    // next boundary in the healthy direction
    let next = null;
    if (m.cat.key === 'obese') next = { bmi: 30, to: CATS[2] };
    else if (m.cat.key === 'over') next = { bmi: 24.9, to: CATS[1] };
    else if (m.cat.key === 'under') next = { bmi: 18.5, to: CATS[1] };
    const nextLine = n => {
      const kg = kgFor(n.bmi === 30 ? 29.9 : n.bmi, m.cm);
      const towards = (kg - m.kg) * (m.pl.dir || 0) > 0 && m.pacePerWeek;
      const wk = towards ? Math.max(1, Math.round(Math.abs(kg - m.kg) / m.pacePerWeek)) : null;
      return { kg, text: (n.to.key === 'healthy' ? 'healthy BMI' : n.to.label) + ' at ' + wRound(kg) + ' ' + u, wk };
    };
    let icon, tone, title, sub = '', foot = '';
    if (last) {
      icon = 'check'; tone = 'good';
      title = 'You moved from ' + esc(last.from.label) + ' to ' + esc(last.to.label) + ' on ' + nw(esc(dateS(last.key)));
      sub = 'Crossed ' + nw(esc(wRound(kgFor(boundaryBetween(last.from, last.to), m.cm)) + ' ' + u)) + ' · a real health milestone';
      if (next) { const n = nextLine(next); foot = 'Next: ' + nw(esc(n.text)); }
    } else if (next) {
      const n = nextLine(next);
      icon = 'flag'; tone = 'brand';
      title = 'Next milestone: ' + esc(next.to.key === 'healthy' ? 'a healthy BMI' : next.to.label) + ' at ' + nw(esc(wRound(n.kg) + ' ' + u));
      sub = nw(esc(wAbs(n.kg - m.kg) + ' ' + u)) + ' to go' + (n.wk ? ' · about ' + nw(esc(U.plural(n.wk, 'week'))) + ' at plan pace' : '');
    } else {
      icon = 'check'; tone = 'good';
      const inSince = m.crossings.filter(c => c.to.key === 'healthy').slice(-1)[0];
      title = inSince ? 'Healthy BMI since ' + nw(esc(dateS(inSince.key))) : 'Your BMI is in the healthy range';
      sub = 'Stay between ' + nw(esc(wRound(m.minKg) + '–' + wRound(m.maxKg) + ' ' + u)) + ' to keep it there';
    }
    return '<section class="card bmi-ms bmi-o3" aria-labelledby="bmi-ms-t">' +
      '<span class="bmi-ms-ic ' + tone + '" aria-hidden="true">' + M.icon(icon, 'lg') + '</span>' +
      '<div class="bmi-ms-main"><h2 id="bmi-ms-t" class="bmi-ms-t">' + title + '</h2>' +
      (sub ? '<p class="bmi-ms-s">' + sub + '</p>' : '') +
      (foot ? '<p class="bmi-ms-f">' + M.icon('flag', 'sm') + '<span>' + foot + '</span></p>' : '') + '</div></section>';
  }

  function trendView(m) {
    const from = range === '1M' ? U.addDays(m.today, -30) : range === '3M' ? U.addDays(m.today, -91) : null;
    const pts = m.series.filter(d => !from || d.key >= from);
    const proj = range === 'All' && m.proj && pts.length ? m.proj : null;
    let title, sub;
    if (pts.length < 2) { title = 'Your BMI trend'; sub = pts.length ? 'One day of weigh-ins so far' : 'No weigh-ins in this range'; }
    else {
      const d = pts[pts.length - 1].bmi - pts[0].bmi;
      title = Math.abs(d) < 0.05 ? 'Steady at ' + b1(pts[pts.length - 1].bmi) : (d < 0 ? 'Down ' : 'Up ') + Math.abs(d).toFixed(1) + (Math.abs(d) >= 0.95 && Math.abs(d) < 1.05 ? ' point' : ' points');
      sub = (range === 'All' ? 'Since ' : 'Since ') + dateS(pts[0].key) + ' · ' + (proj ? (proj.label === 'healthy' ? 'healthy by ' : 'goal by ') + dateS(proj.key) + ' at plan pace' : 'from ' + b1(pts[0].bmi) + ' to ' + b1(pts[pts.length - 1].bmi));
    }
    return { pts, proj, title, sub };
  }

  function trendCard(m) {
    const t = trendView(m);
    const seg = '<div class="seg bmi-seg" role="group" aria-label="Chart range">' + ['1M', '3M', 'All'].map(r =>
      '<button type="button" class="seg-btn" data-bmi-range="' + r + '" aria-pressed="' + (r === range) + '">' + r + '</button>').join('') + '</div>';
    return '<section class="card bmi-trend bmi-o4" aria-labelledby="bmi-tr-t">' +
      '<div><div class="bmi-trend-head"><h2 class="card-title" id="bmi-tr-t" data-slot="tr-title">' + esc(t.title) + '</h2>' + seg + '</div>' +
      '<p class="card-sub bmi-trend-sub" data-slot="tr-sub">' + esc(t.sub) + '</p></div>' +
      '<div class="bmi-chart" data-slot="trend"></div>' +
      '<ul class="bmi-legend" data-slot="legend" aria-label="Legend"></ul></section>';
  }

  function aboutCard(m) {
    const u = unit(), p = m.p;
    const half = m.cm / 2;
    const len = cm => (u === 'lb' ? Math.round(cm / 2.54) + ' in' : Math.round(cm) + ' cm');
    let row;
    if (fin(+p.waistCm) && +p.waistCm > 0) {
      const r = +p.waistCm / m.cm, good = r < 0.5;
      row = '<button type="button" class="bmi-waist" data-bmi="waist" aria-label="Update waist measurement, currently ' + esc(len(+p.waistCm)) + '">' +
        '<span class="bmi-waist-ic ' + (good ? 'good' : 'warn') + '" aria-hidden="true">' + rulerIcon() + '</span>' +
        '<span class="bmi-waist-main"><span class="bmi-waist-t">Waist-to-height ' + nw(r.toFixed(2)) + '</span>' +
        '<span class="bmi-waist-s">Waist ' + nw(esc(len(+p.waistCm))) + ' · ' + (good ? 'under 0.5, a healthy sign' : 'target under ' + nw(esc(len(half))) + ' (half your height)') + '</span></span>' +
        M.icon('chevron', 'row-chev') + '</button>';
    } else {
      row = '<button type="button" class="bmi-waist" data-bmi="waist" aria-label="Add waist measurement">' +
        '<span class="bmi-waist-ic" aria-hidden="true">' + rulerIcon() + '</span>' +
        '<span class="bmi-waist-main"><span class="bmi-waist-t add">Add waist measurement</span>' +
        '<span class="bmi-waist-s">Healthy target: under ' + nw(esc(len(half))) + ' (half your height)</span></span>' +
        M.icon('chevron', 'row-chev') + '</button>';
    }
    return '<section class="card bmi-about bmi-o5" aria-labelledby="bmi-ab-t">' +
      '<div><h2 class="card-title" id="bmi-ab-t">About BMI</h2>' +
      '<p class="bmi-about-p">A screening tool for adults, not a diagnosis. It can’t tell muscle from fat, and the categories are the same for men and women. Some health bodies use lower cutoffs, such as 23 for people of Asian descent. Pair it with your waist: a waist under half your height (a ratio below 0.5) is a good sign.</p></div>' +
      row + '</section>';
  }
  const rulerIcon = () => '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="8" width="19" height="8" rx="2"/><path d="M6.5 8v3M10.5 8v4M14.5 8v3M18.5 8v4"/></svg>';

  /* ================= drawing (SVG sized to the container) ================= */
  let mctx = null;
  function textW(s, weight) {
    try {
      if (!mctx) mctx = document.createElement('canvas').getContext('2d');
      mctx.font = (weight || 600) + ' 12px "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif';
      return mctx.measureText(s).width;
    } catch (e) { return s.length * 7; }
  }

  function drawScale(el, m) {
    const W = Math.round(el.clientWidth); if (!W) return;
    const p = m.p, u = unit();
    const marks = [m.bmi, m.startBmi, m.goalBmi].filter(fin);
    let lo = Math.min(15, Math.floor(Math.min.apply(null, marks) - 1));
    let hi = Math.max(34, Math.ceil(Math.max.apply(null, marks) + 1.5));
    hi = Math.min(hi, 60); lo = Math.max(lo, 10);
    const x = b => (U.clamp(b, lo, hi) - lo) / (hi - lo) * W;
    const BAND_Y = 22, BAND_H = 28, GAP = 2;
    let s = '';
    // markers above the band: Start + Goal (labels pushed apart, triangles stay true)
    const above = [];
    if (fin(m.startBmi) && U.isValidKey(p.startDate) && p.startDate < m.today && Math.abs(m.startBmi - m.bmi) >= 0.05) above.push({ b: m.startBmi, text: 'Start ' + b1(m.startBmi), cls: 'bmi-sc-start' });
    if (fin(m.goalBmi) && !(m.pl && m.pl.goalReached)) above.push({ b: m.goalBmi, text: 'Goal ' + b1(m.goalBmi), cls: 'bmi-sc-goal' });
    above.sort((a, b) => a.b - b.b);
    above.forEach(o => { o.w = textW(o.text, 700); o.cx = U.clamp(x(o.b), o.w / 2, W - o.w / 2); });
    if (above.length === 2 && above[1].cx - above[0].cx < (above[0].w + above[1].w) / 2 + 10) {
      const need = (above[0].w + above[1].w) / 2 + 10, mid = (above[0].cx + above[1].cx) / 2;
      above[0].cx = U.clamp(mid - need / 2, above[0].w / 2, W - need - above[1].w / 2);
      above[1].cx = above[0].cx + need;
    }
    above.forEach(o => {
      const tx = x(o.b);
      s += '<text class="' + o.cls + '" x="' + o.cx.toFixed(1) + '" y="11" text-anchor="middle">' + esc(o.text) + '</text>';
      s += '<path class="' + o.cls + '-mk" d="M' + (tx - 4).toFixed(1) + ' 15H' + (tx + 4).toFixed(1) + 'L' + tx.toFixed(1) + ' 20.5Z"/>';
    });
    // bands
    CATS.forEach((c, i) => {
      const a = x(Math.max(c.min, lo)), b = x(Math.min(c.max, hi));
      if (b - a < 1) return;
      const x0 = a + (i ? GAP / 2 : 0), x1 = b - (i < 3 ? GAP / 2 : 0);
      s += '<rect class="bmi-band bmi-b-' + c.key + '" x="' + x0.toFixed(1) + '" y="' + BAND_Y + '" width="' + Math.max(0, x1 - x0).toFixed(1) + '" height="' + BAND_H + '" rx="' + (i === 0 || i === 3 ? 8 : 6) + '"/>';
      const bw = x1 - x0;
      const lbl = textW(c.label) + 6 <= bw ? c.label : textW(c.short) + 6 <= bw ? c.short : '';
      if (lbl) s += '<text class="bmi-band-t" x="' + ((x0 + x1) / 2).toFixed(1) + '" y="40.5" text-anchor="middle">' + esc(lbl) + '</text>';
    });
    // Now marker below the band
    const nx = x(m.bmi), nowTxt = 'Now ' + b1(m.bmi), pw = textW(nowTxt, 700) + 24;
    const px = U.clamp(nx - pw / 2, 0, W - pw);
    s += '<path class="bmi-sc-now" d="M' + nx.toFixed(1) + ' 52.5L' + (nx + 5.5).toFixed(1) + ' 58.5H' + (nx - 5.5).toFixed(1) + 'Z"/>';
    s += '<rect class="bmi-sc-now" x="' + px.toFixed(1) + '" y="58" width="' + pw.toFixed(1) + '" height="26" rx="13"/>';
    s += '<text class="bmi-sc-now-t" x="' + (px + pw / 2).toFixed(1) + '" y="75.5" text-anchor="middle">' + esc(nowTxt) + '</text>';
    // boundaries: BMI + the matching weight at the user's height (stagger if they collide)
    const bnds = [18.5, 25, 30].filter(b => b > lo && b < hi).map(b => {
      const bt = (b === 18.5 ? '18.5' : String(b)) + ' · ', wt = wRound(kgFor(b, m.cm)) + ' ' + u;
      const w = textW(bt, 500) + textW(wt, 700);
      return { b, bt, wt, w, cx: U.clamp(x(b), w / 2, W - w / 2), row: 0 };
    });
    // first try nudging labels apart (up to 30px off their tick) so they stay on one row; stack only if that fails
    const lim = o => [Math.max(o.w / 2, x(o.b) - 36), Math.min(W - o.w / 2, x(o.b) + 36)];
    for (let it = 0; it < 12; it++) for (let i = 1; i < bnds.length; i++) {
      const a = bnds[i - 1], c = bnds[i], d = (a.w + c.w) / 2 + 16 - (c.cx - a.cx);
      if (d > 0) { const la = lim(a), lc = lim(c); a.cx = U.clamp(a.cx - d / 2, la[0], la[1]); c.cx = U.clamp(c.cx + d / 2, lc[0], lc[1]); }
    }
    const fits = bnds.every((o, i) => !i || o.cx - bnds[i - 1].cx >= (o.w + bnds[i - 1].w) / 2 + 14);
    if (!fits) bnds.forEach(o => { o.cx = U.clamp(x(o.b), o.w / 2, W - o.w / 2); });
    if (!fits) for (let i = 1; i < bnds.length; i++) if (bnds[i].cx - bnds[i - 1].cx < (bnds[i].w + bnds[i - 1].w) / 2 + 8 && bnds[i - 1].row === 0) bnds[i].row = 1;
    const rows = bnds.some(b => b.row) ? 2 : 1;
    bnds.forEach(o => {
      const bx = x(o.b).toFixed(1), ty = 106 + o.row * 18;
      s += '<path class="bmi-sc-tick" d="M' + bx + ' 88V' + (93 + o.row * 18) + '"/>';
      s += '<text x="' + o.cx.toFixed(1) + '" y="' + ty + '" text-anchor="middle"><tspan class="bmi-sc-bt">' + esc(o.bt) + '</tspan><tspan class="bmi-sc-wt">' + esc(o.wt) + '</tspan></text>';
    });
    const H = rows === 2 ? 128 : 110;
    const aria = 'BMI scale for your height. ' + CATS.map(c => c.label + (c.key === 'under' ? ' below 18.5, under ' + wRound(kgFor(18.5, m.cm)) + ' ' + u : c.key === 'obese' ? ' 30 and above, ' + wRound(kgFor(30, m.cm)) + ' ' + u + ' and up' : ' ' + c.min + ' to ' + (c.max - 0.1).toFixed(1) + ', ' + wRound(kgFor(c.min, m.cm)) + ' to ' + wRound(kgFor(c.max, m.cm)) + ' ' + u)).join('. ') +
      '. ' + (above.find(o => o.cls === 'bmi-sc-start') ? 'You started at ' + b1(m.startBmi) + ', ' : '') + 'you are now ' + b1(m.bmi) + (above.find(o => o.cls === 'bmi-sc-goal') ? ', and your goal is ' + b1(m.goalBmi) : '') + '.';
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(aria) + '">' + s + '</svg>';
  }

  function drawTrend(el, m) {
    const W = Math.round(el.clientWidth); if (!W) return;
    const t = trendView(m);
    const legendEl = el.parentNode.querySelector('[data-slot="legend"]');
    if (t.pts.length < 2) {
      el.innerHTML = '<div class="chart-empty">Weigh in on a few more days and your BMI trend line appears here</div>';
      if (legendEl) legendEl.innerHTML = '';
      return;
    }
    const H = Math.round(U.clamp(W * 0.42, 150, 220));
    const pad = { l: 30, r: 4, t: 16, b: 22 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const k0 = t.pts[0].key, kEnd = t.proj ? t.proj.key : m.today;
    const span = Math.max(1, U.diffDays(k0, kEnd));
    const sx = k => pad.l + U.diffDays(k0, k) / span * iw;
    const vals = t.pts.map(d => d.bmi).concat(t.proj ? [t.proj.bmi] : []);
    let lo = Math.floor(Math.min.apply(null, vals) - 0.6), hi = Math.ceil(Math.max.apply(null, vals) + 0.6);
    if (hi - lo < 3) { const c = (hi + lo) / 2; lo = Math.floor(c - 1.5); hi = Math.ceil(c + 1.5); }
    const sy = b => pad.t + (hi - b) / (hi - lo) * ih;
    let s = '';
    // tinted category bands + boundary separators
    const shown = [];
    CATS.forEach(c => {
      const a = Math.max(c.min, lo), b = Math.min(c.max, hi);
      if (b <= a) return;
      shown.push(c);
      s += '<rect class="bmi-tb bmi-tb-' + c.key + '" x="' + pad.l + '" y="' + sy(b).toFixed(1) + '" width="' + iw + '" height="' + (sy(a) - sy(b)).toFixed(1) + '"/>';
    });
    const ticks = [{ v: hi, y: sy(hi) }, { v: lo, y: sy(lo) }];
    [18.5, 25, 30].forEach(b => {
      if (b <= lo || b >= hi) return;
      const y = sy(b);
      s += '<path class="bmi-tsep" d="M' + pad.l + ' ' + y.toFixed(1) + 'H' + (pad.l + iw) + '"/>';
      ticks.push({ v: b, y });
    });
    ticks.sort((a, b) => a.y - b.y);
    const kept = [];
    ticks.forEach(tk => { const isB = [18.5, 25, 30].includes(tk.v); const clash = kept.find(k => Math.abs(k.y - tk.y) < 20); if (!clash) kept.push(tk); else if (isB && ![18.5, 25, 30].includes(clash.v)) { kept.splice(kept.indexOf(clash), 1, tk); } });
    kept.forEach(tk => { s += '<text x="' + (pad.l - 8) + '" y="' + (tk.y + 4).toFixed(1) + '" text-anchor="end">' + esc(tk.v % 1 ? tk.v.toFixed(1) : String(tk.v)) + '</text>'; });
    // projection
    const last = t.pts[t.pts.length - 1];
    const lx = sx(last.key), ly = sy(last.bmi);
    if (t.proj) {
      const ex = sx(t.proj.key), ey = sy(t.proj.bmi);
      s += '<path class="bmi-proj" d="M' + lx.toFixed(1) + ' ' + ly.toFixed(1) + 'L' + ex.toFixed(1) + ' ' + ey.toFixed(1) + '"/>';
      s += '<circle class="bmi-proj-end" cx="' + ex.toFixed(1) + '" cy="' + ey.toFixed(1) + '" r="4"/>';
      const endY = ey + (t.proj.bmi < last.bmi ? -10 : 18);
      s += '<text class="ch-strong" x="' + (pad.l + iw) + '" y="' + U.clamp(endY, 12, H - pad.b - 4).toFixed(1) + '" text-anchor="end">' + esc(b1(t.proj.bmi)) + '</text>';
      if (ex - lx > 110) {
        const px = lx + 46, py = ly + (px - lx) * (ey - ly) / (ex - lx) + (t.proj.bmi < last.bmi ? -8 : 16);
        s += '<text class="ch-label" x="' + px.toFixed(1) + '" y="' + U.clamp(py, 12, H - pad.b - 4).toFixed(1) + '">Plan pace</text>';
      }
    }
    // history
    s += '<path class="bmi-line" d="' + t.pts.map((d, i) => (i ? 'L' : 'M') + sx(d.key).toFixed(1) + ' ' + sy(d.bmi).toFixed(1)).join('') + '"/>';
    const fy = sy(t.pts[0].bmi);
    s += '<text class="ch-label" x="' + (pad.l + 6) + '" y="' + Math.max(11, fy - 8).toFixed(1) + '">' + esc(b1(t.pts[0].bmi)) + '</text>';
    s += '<circle class="bmi-last" cx="' + lx.toFixed(1) + '" cy="' + ly.toFixed(1) + '" r="5"/>';
    const bw = 52, bx = U.clamp(lx - bw + 6, pad.l + 2, pad.l + iw - bw);
    const by = ly + 10 + 22 > H - pad.b ? ly - 32 : ly + 10;
    s += '<rect class="bmi-last-pill" x="' + bx.toFixed(1) + '" y="' + by.toFixed(1) + '" width="' + bw + '" height="22" rx="11"/>';
    s += '<text class="bmi-last-t" x="' + (bx + bw / 2).toFixed(1) + '" y="' + (by + 15).toFixed(1) + '" text-anchor="middle">' + esc(b1(last.bmi)) + '</text>';
    // x labels
    const xl = [{ x: pad.l, a: 'start', t: U.fmtDate(k0) }];
    if (t.proj) {
      xl.push({ x: lx, a: 'middle', t: 'Today', strong: true });
      xl.push({ x: pad.l + iw, a: 'end', t: dateS(t.proj.key) });
    } else {
      const mid = U.addDays(k0, Math.round(span / 2));
      xl.push({ x: sx(mid), a: 'middle', t: U.fmtDate(mid) });
      xl.push({ x: pad.l + iw, a: 'end', t: last.key === m.today ? 'Today' : U.fmtDate(last.key), strong: last.key === m.today });
    }
    // drop labels that collide
    const ext = l => { const w = textW(l.t, 600); return l.a === 'start' ? [l.x, l.x + w] : l.a === 'end' ? [l.x - w, l.x] : [l.x - w / 2, l.x + w / 2]; };
    const okL = [xl[0], xl[2]];
    if (xl[1]) { const e1 = ext(xl[1]); if (e1[0] > ext(xl[0])[1] + 8 && e1[1] < ext(xl[2])[0] - 8) okL.splice(1, 0, xl[1]); }
    okL.forEach(l => { s += '<text' + (l.strong ? ' class="ch-label"' : '') + ' x="' + l.x.toFixed(1) + '" y="' + (H - 4) + '" text-anchor="' + l.a + '">' + esc(l.t) + '</text>'; });
    s += '<line class="bmi-cross" x1="0" x2="0" y1="' + pad.t + '" y2="' + (pad.t + ih) + '" style="opacity:0"/>';
    s += '<rect class="bmi-hit" x="' + pad.l + '" y="0" width="' + iw + '" height="' + (H - pad.b) + '" fill="transparent"/>';
    const aria = 'BMI trend, ' + range + ' view: from ' + b1(t.pts[0].bmi) + ' to ' + b1(last.bmi) + ' now, in the ' + m.cat.label.toLowerCase() + ' band' +
      (t.proj ? '. At plan pace, BMI reaches ' + b1(t.proj.bmi) + ' on ' + dateS(t.proj.key) + '.' : '.');
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(aria) + '">' + s + '</svg><div class="chart-tip" role="status"></div>';
    if (legendEl) legendEl.innerHTML = shown.map(c => '<li><span class="bmi-lg-sw bmi-lg-' + c.key + '" aria-hidden="true"></span>' + esc(c.label) + '</li>').join('');
    // hover / tap tooltip
    const svg = el.querySelector('svg'), tip = el.querySelector('.chart-tip'), cross = el.querySelector('.bmi-cross');
    const move = e => {
      const r = svg.getBoundingClientRect();
      const mx = (e.clientX - r.left) * (W / r.width);
      let best = null, bd = Infinity;
      t.pts.forEach(d => { const dd = Math.abs(sx(d.key) - mx); if (dd < bd) { bd = dd; best = d; } });
      if (!best) return;
      const cx = sx(best.key);
      cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.style.opacity = 1;
      const c = catOf(best.bmi);
      tip.innerHTML = '<div class="tt-title">' + esc(U.relDay(best.key)) + '</div><div class="tt-row"><span>BMI</span><b>' + esc(b1(best.bmi)) + '</b></div>' +
        '<div class="tt-row"><span>Trend weight</span><b>' + esc(M.units.w(best.kg)) + '</b></div><div class="tt-row"><span>Category</span><b>' + esc(c ? c.label : '–') + '</b></div>';
      tip.classList.add('on');
      const tw = tip.offsetWidth, th = tip.offsetHeight, py = sy(best.bmi) * (r.height / H);
      tip.style.left = U.clamp(cx * (r.width / W) - tw / 2, 0, r.width - tw) + 'px';
      let top = py - th - 14; if (top < -8) top = py + 16;
      tip.style.top = top + 'px';
    };
    const leave = () => { tip.classList.remove('on'); cross.style.opacity = 0; };
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerdown', move);
    svg.addEventListener('pointerleave', leave);
  }

  function drawAll(root, force) {
    if (!model || model.noHeight || model.noWeight) return;
    const sc = root.querySelector('[data-slot="scale"]'), tr = root.querySelector('[data-slot="trend"]');
    if (sc && (force || Math.round(sc.clientWidth) !== lastW.sc)) { lastW.sc = Math.round(sc.clientWidth); drawScale(sc, model); }
    if (tr && (force || Math.round(tr.clientWidth) !== lastW.tr)) { lastW.tr = Math.round(tr.clientWidth); drawTrend(tr, model); }
  }

  /* ================= actions ================= */
  function setGoal(kg) {
    const p = M.state.profile || {};
    if (!fin(kg) || !fin(+p.goalKg)) return;
    const prevKg = +p.goalKg;
    M.store.setProfile({ goalKg: kg });
    justSet = { prevKg, newKg: kg };
    goalToast = ui.toast('Goal set to ' + wRound(kg) + ' ' + unit(), { action: { label: 'Undo', fn: undoGoal } });
  }
  function undoGoal() {
    if (!justSet) return;
    const prev = justSet.prevKg;
    justSet = null;
    try { if (goalToast && goalToast.dismiss) goalToast.dismiss(); } catch (e) {}
    goalToast = null;
    M.store.setProfile({ goalKg: prev });
    ui.toast('Goal back to ' + wRound(prev) + ' ' + unit());
  }

  function openWaist() {
    const p = M.state.profile || {};
    const u = unit(), inch = u === 'lb';
    const cur = fin(+p.waistCm) && +p.waistCm > 0 ? +p.waistCm : null;
    const toDisp = cm => (inch ? (cm / 2.54).toFixed(1).replace(/\.0$/, '') : String(Math.round(cm)));
    const half = fin(+p.heightCm) ? +p.heightCm / 2 : null;
    const body = ui.h('div', { class: 'form' });
    body.innerHTML = ui.field({ id: 'bmi-waist-in', label: 'Waist', hint: 'Measure around your middle, just above the hip bones, after breathing out.' + (half ? ' Target: under ' + toDisp(half) + (inch ? ' in' : ' cm') + '.' : ''),
      input: '<div class="input-wrap"><input class="input num-input" id="bmi-waist-in" inputmode="decimal" autocomplete="off" value="' + (cur ? toDisp(cur) : '') + '" placeholder="' + (inch ? '34' : '86') + '"><span class="suffix">' + (inch ? 'in' : 'cm') + '</span></div>' }) +
      '<p class="hint" id="bmi-waist-ratio" aria-live="polite"></p>';
    const foot = document.createDocumentFragment();
    if (cur) foot.appendChild(ui.h('button', { type: 'button', class: 'btn btn-secondary', 'data-w': 'remove' }, 'Remove'));
    foot.appendChild(ui.h('button', { type: 'button', class: 'btn btn-primary', 'data-w': 'save' }, 'Save waist'));
    const sh = ui.sheet({ title: cur ? 'Update waist' : 'Add waist measurement', sub: 'Waist-to-height is a simple check that BMI misses.', body, foot, initialFocus: '#bmi-waist-in' });
    const inp = body.querySelector('#bmi-waist-in'), out = body.querySelector('#bmi-waist-ratio');
    const read = () => { const v = U.parseNum(inp.value); return fin(v) ? (inch ? v * 2.54 : v) : NaN; };
    const live = () => { const cm = read(); out.textContent = fin(cm) && cm >= 40 && cm <= 250 && half ? 'Waist-to-height ' + (cm / (half * 2)).toFixed(2) + (cm / (half * 2) < 0.5 ? ' · under 0.5, a healthy sign' : ' · target under 0.5') : ''; };
    live(); inp.addEventListener('input', live);
    const save = () => {
      const cm = read();
      if (!(cm >= 40 && cm <= 250)) { ui.fieldError(inp, 'Enter a waist between ' + (inch ? '16 and 98 in' : '40 and 250 cm') + '.'); inp.focus(); return; }
      M.store.setProfile({ waistCm: Math.round(cm * 10) / 10 });
      sh.close(); ui.toast('Waist saved');
    };
    sh.foot.addEventListener('click', e => {
      const b = e.target.closest('[data-w]'); if (!b) return;
      if (b.dataset.w === 'save') save();
      else { const prev = cur; M.store.setProfile({ waistCm: null }); sh.close(); ui.toast('Waist removed', { action: { label: 'Undo', fn: () => M.store.setProfile({ waistCm: prev }) } }); }
    });
    body.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target === inp) { e.preventDefault(); save(); } });
  }

  /* ================= view ================= */
  M.views.bmi = {
    title: 'BMI',
    narrow: false,
    render(el) {
      model = build();
      lastW = {};
      if (model.noHeight || model.noWeight) {
        const prev = M.prevRoute && M.views[M.prevRoute] ? M.prevRoute : 'progress';
        el.innerHTML = '<div class="view bmi-view">' + head(model) + '<div class="card">' +
          (model.noHeight
            ? ui.empty({ icon: 'profile', title: 'Add your height to see your BMI', body: 'BMI compares your weight with your height. Add it in your profile and this screen fills in.', actions: '<a class="btn btn-primary" href="#profile">Add your height</a>' })
            : ui.empty({ icon: 'scale', title: 'Log a weigh-in to see your BMI', body: 'Your BMI is worked out from your trend weight.', actions: '<button type="button" class="btn btn-primary" data-open-sheet="weighIn">Log weight</button>' })) +
          '</div><p class="t-sm muted"><a class="link-btn" href="#' + prev + '">Back</a></p></div>';
        return;
      }
      el.innerHTML = '<div class="view bmi-view">' + head(model) +
        '<div class="bmi-layout"><div class="bmi-col bmi-col-main">' + heroCard(model) + trendCard(model) + '</div>' +
        '<div class="bmi-col bmi-col-side">' + rangeCard(model) + milestoneCard(model) + aboutCard(model) + '</div></div></div>';
      drawAll(el, true);
      if (!ro && typeof ResizeObserver !== 'undefined') {
        let raf = 0;
        ro = new ResizeObserver(() => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; const v = document.getElementById('view'); if (v && v.querySelector('.bmi-view')) drawAll(v, false); }); });
      }
      if (ro) { ro.disconnect(); el.querySelectorAll('[data-slot="scale"], [data-slot="trend"]').forEach(n => ro.observe(n)); }
      if (bound !== el) {
        bound = el;
        el.addEventListener('click', e => {
          if (!e.target.closest('.bmi-view')) return;
          const r = e.target.closest('[data-bmi-range]');
          if (r) {
            if (range === r.dataset.bmiRange) return;
            range = r.dataset.bmiRange;
            el.querySelectorAll('[data-bmi-range]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.bmiRange === range)));
            const t = trendView(model);
            el.querySelector('[data-slot="tr-title"]').textContent = t.title;
            el.querySelector('[data-slot="tr-sub"]').textContent = t.sub;
            drawTrend(el.querySelector('[data-slot="trend"]'), model);
            return;
          }
          const b = e.target.closest('[data-bmi]'); if (!b) return;
          if (b.dataset.bmi === 'setgoal') setGoal(+b.dataset.kg);
          else if (b.dataset.bmi === 'undo') undoGoal();
          else if (b.dataset.bmi === 'waist') openWaist();
        });
      }
    },
    destroy() { if (ro) ro.disconnect(); justSet = null; model = null; }
  };
})();
