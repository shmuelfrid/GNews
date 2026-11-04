/* Momentum v2 — TODAY view (#today). Owner: today builder.
   Design: Main.dc.html (approved after the 3-way home exploration).
   1. Deep-indigo hero: greeting, streak, three glowing energy rings (Food / Move / Steps) + focus tiles.
   2. Floating week card: under-budget count + 7 mini deficit rings (tap a day).
   3. "Your climb" card: generated SVG mountain, trail, milestone flags, "you are here", story note, BMI row.
   4. Today's plan checklist (ticks persisted per day in localStorage 'momentum.v2.plan.<date>').
   5. Compact meals + weigh-ins.
   Desktop (>=1024): hero is a wide card (rings left, week card + tiles right); climb + plan side by side. */
(function () {
  'use strict';
  const M = window.M, U = M.util, ui = M.ui, C = M.calc;
  const esc = U.esc;

  /* ---------- module state (survives re-renders) ---------- */
  let focus = '';              // '' | 'food' | 'move' | 'steps'
  let daySel = null;           // selected key in week strip (null = today)
  let climbSel = 'you';        // selected climb item id
  let animated = false;        // ring fill animation runs once per visit
  let mq = null, mqHandler = null;
  let ro = null, roW = 0, climbModel = null;
  let centers = {}, dayLines = {}, stories = {};

  const fin = v => typeof v === 'number' && isFinite(v);
  const isDesk = () => { try { return matchMedia('(min-width: 1024px)').matches; } catch (e) { return false; } };
  const nb = s => String(s).replace(/ /g, ' ');
  const r1 = n => Math.round(n * 10) / 10;
  const f1 = n => (Math.round(n * 10) / 10).toFixed(1);
  const kfmt = n => { if (!fin(n)) return '–'; if (n >= 1000) { const k = n / 1000; return (Math.round(k * 10) / 10).toString().replace(/\.0$/, '') + 'k'; } return U.int(n); };

  /* ---------- BMI (shared API with defensive local fallback) ---------- */
  const BMI_CATS = [
    { key: 'under', label: 'Underweight', min: 0, max: 18.5 },
    { key: 'healthy', label: 'Healthy', min: 18.5, max: 25 },
    { key: 'over', label: 'Overweight', min: 25, max: 30 },
    { key: 'obese', label: 'Obese', min: 30, max: Infinity }
  ];
  const bmiOf = (kg, cm) => {
    try { if (C.bmi) { const v = C.bmi(kg, cm); if (fin(v)) return v; } } catch (e) {}
    return fin(kg) && fin(cm) && cm > 0 ? kg / Math.pow(cm / 100, 2) : NaN;
  };
  const bmiCat = v => {
    v = Math.round(v * 10) / 10;   // classify the value shown (1 decimal): "25.0" must never read Healthy
    try { if (C.bmiCategory) { const c = C.bmiCategory(v); if (c && c.key) return c; } } catch (e) {}
    return BMI_CATS.find(c => v < c.max) || BMI_CATS[3];
  };
  const healthyRange = cm => {
    try { if (C.healthyWeightRange) { const r = C.healthyWeightRange(cm); if (r && fin(r.minKg) && fin(r.maxKg)) return r; } } catch (e) {}
    const m2 = Math.pow(cm / 100, 2); return { minKg: 18.5 * m2, maxKg: 24.9 * m2 };
  };

  /* ---------- per-day plan ticks ---------- */
  const planKey = () => 'momentum.v2.plan.' + U.todayKey();
  function readTicks() { try { const o = JSON.parse(localStorage.getItem(planKey()) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
  function writeTicks(o) { try { localStorage.setItem(planKey(), JSON.stringify(o)); } catch (e) {} }

  /* ---------- icons not in the foundation set ---------- */
  const FLAME = '<svg class="today-flame" width="16" height="18" viewBox="0 0 38 46" aria-hidden="true">' +
    '<path d="M19 2c2 8 13 13 13 26a13 13 0 0 1-26 0c0-7 4-10 6-15 1 4 3 6 5 6-2-7 0-12 2-17z" style="fill:var(--tdy-flame-o)"/>' +
    '<path d="M19 22c1 4 7 7 7 13a7 7 0 0 1-14 0c0-4 3-6 4-9 1 2 2 3 3 3-1-3-1-5 0-7z" style="fill:var(--tdy-flame-i)"/></svg>';
  const CHECK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const FLAG_IC = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/></svg>';

  /* ================= 1. HERO ================= */
  function heroModel(p, b, ta) {
    const kg = b.kg;
    const typ = fin(b.activeAvg7) ? b.activeAvg7 : (C.BASELINE_ACTIVE && C.BASELINE_ACTIVE[p.activityBaseline]) || 250;
    const eq30 = C.equivalents(100, kg);
    const sessionKcal = fin(eq30.perMin && eq30.perMin.treadmill) ? eq30.perMin.treadmill * 30 : 250;
    const moveDone = Math.max(0, Math.round((b.active || 0) + (b.workouts || 0)));
    const extra = ta.extraBurnForTarget && fin(ta.extraBurnForTarget.kcal) ? ta.extraBurnForTarget.kcal : 0;
    const moveGoal = Math.max(50, Math.round(Math.max(typ + sessionKcal, extra > 0 ? moveDone + extra : 0) / 10) * 10);
    const moveLeft = Math.max(0, moveGoal - moveDone);
    const moveEq = C.equivalents(moveLeft, kg);
    const stepGoal = fin(p.stepGoal) && p.stepGoal > 0 ? p.stepGoal : 8000;
    const steps = fin(b.steps) ? Math.round(b.steps) : 0;
    const stepsLeft = Math.max(0, stepGoal - steps);
    const budget = Math.max(0, Math.round(b.budget || 0));
    const eaten = Math.max(0, b.eaten || 0);
    const over = !b.gain && b.over;
    return { moveDone, moveGoal, moveLeft, moveEq, stepGoal, steps, stepsLeft, budget, eaten, over, gain: b.gain };
  }

  function heroCenters(b, h) {
    const def = b.deficitSoFar;
    const defTxt = (def >= 0 ? 'deficit so far ' : 'surplus so far ') + U.int(Math.abs(def)) + ' kcal';
    let none;
    if (!b.hasFood && !h.moveDone && !h.steps) none = { big: U.int(h.budget), unit: b.gain ? 'kcal to eat' : 'kcal to spend', sub: 'A fresh day. Log your first meal to start the rings.' };
    else if (b.gain) none = b.left > 0 ? { big: U.int(b.left), unit: 'kcal to go', sub: 'Left to reach today’s target · ' + defTxt } : { big: U.int(-b.left), unit: 'kcal past target', sub: 'Target reached · ' + defTxt };
    else if (h.over) none = { big: U.int(b.overBy), unit: 'kcal over', sub: 'Over budget · a ' + Math.max(1, Math.round(C.equivalents(b.overBy, b.kg).treadmillMin || 0)) + ' min walk evens it out' };
    else none = { big: U.int(b.left), unit: 'kcal left', sub: 'Left to eat today · ' + defTxt };
    const pctB = h.budget > 0 ? Math.round(h.eaten / h.budget * 100) : 0;
    const walkMin = Math.max(1, Math.round(h.stepsLeft / 100));
    return {
      '': none,
      food: { big: U.int(h.eaten), unit: 'kcal eaten', sub: h.eaten ? pctB + '% of today’s ' + U.int(h.budget) + ' kcal budget' : 'Nothing logged yet · budget ' + U.int(h.budget) + ' kcal' },
      move: { big: U.int(h.moveDone), unit: 'active kcal', sub: h.moveLeft > 0 ? U.int(h.moveLeft) + ' more ≈ ' + Math.max(1, Math.round(h.moveEq.treadmillMin || 0)) + ' min on the treadmill' : 'Move goal reached · ' + U.int(h.moveGoal) + ' kcal' },
      steps: { big: U.int(h.steps), unit: 'steps', sub: h.stepsLeft > 0 ? (h.steps ? U.int(h.stepsLeft) + ' to go · about a ' + walkMin + ' min walk' : 'No steps yet · import from Samsung Health') : 'Step goal reached · ' + U.int(h.stepGoal) }
    };
  }

  function ringsSvg(h, b) {
    const CX = 116, R = [104, 83, 62];
    const foodPct = h.budget > 0 ? h.eaten / h.budget : 0;
    const defs = [
      { id: 'food', pct: foodPct, g: h.over ? 'over' : 'food', label: 'Food' },
      { id: 'move', pct: h.moveGoal > 0 ? h.moveDone / h.moveGoal : 0, g: 'move', label: 'Move' },
      { id: 'steps', pct: h.stepGoal > 0 ? h.steps / h.stepGoal : 0, g: 'steps', label: 'Steps' }
    ];
    const anim = !animated && !U.reduceMotion();
    let tracks = '', glows = '', arcs = '', ends = '', pulse = '';
    defs.forEach((d, i) => {
      const r = R[i], circ = 2 * Math.PI * r;
      const pct = U.clamp(fin(d.pct) ? d.pct : 0, 0, 1);
      const len = Math.max(0, pct * circ);
      const a = pct * 2 * Math.PI;
      const hx = (CX + r * Math.sin(a)).toFixed(1), hy = (CX - r * Math.cos(a)).toFixed(1);
      const st = anim ? ' style="--tdy-len:' + len.toFixed(1) + 'px;animation-delay:' + (i * 120) + 'ms"' : '';
      tracks += '<circle cx="' + CX + '" cy="' + CX + '" r="' + r + '" fill="none" class="today-ring-track t-' + d.g + '" stroke-width="16"/>';
      if (len > 0.5) {
        glows += '<circle class="today-ring-glow today-r-' + d.id + (anim ? ' is-anim' : '') + '" cx="' + CX + '" cy="' + CX + '" r="' + r + '" fill="none" stroke="url(#tdy-g-' + d.g + ')" stroke-width="16" stroke-linecap="round" stroke-dasharray="' + len.toFixed(1) + ' ' + circ.toFixed(1) + '" transform="rotate(-90 ' + CX + ' ' + CX + ')" filter="url(#tdy-blur)"' + st + '/>';
        arcs += '<circle class="today-ring-arc today-r-' + d.id + (anim ? ' is-anim' : '') + '" cx="' + CX + '" cy="' + CX + '" r="' + r + '" fill="none" stroke="url(#tdy-g-' + d.g + ')" stroke-width="16" stroke-linecap="round" stroke-dasharray="' + len.toFixed(1) + ' ' + circ.toFixed(1) + '" transform="rotate(-90 ' + CX + ' ' + CX + ')"' + st + '/>';
        ends += '<circle class="today-ring-end today-r-' + d.id + (anim ? ' is-anim' : '') + '" cx="' + hx + '" cy="' + hy + '" r="4.5"/>';
        if (i === 0 && pct < 1) pulse = '<circle class="today-ring-pulse" cx="' + hx + '" cy="' + hy + '" r="9" fill="none" stroke-width="2"/>';
      }
    });
    const aria = 'Energy today. Food ' + U.int(h.eaten) + ' of ' + U.int(h.budget) + ' kcal budget, move ' + U.int(h.moveDone) + ' of ' + U.int(h.moveGoal) + ' active kcal, steps ' + U.int(h.steps) + ' of ' + U.int(h.stepGoal) + '. ' + (b.deficitSoFar >= 0 ? 'Deficit' : 'Surplus') + ' so far ' + U.int(Math.abs(b.deficitSoFar)) + ' kcal.';
    const grad = (id, a, z) => '<linearGradient id="tdy-g-' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--tdy-' + a + ')"/><stop offset="1" style="stop-color:var(--tdy-' + z + ')"/></linearGradient>';
    return '<svg class="today-rings-svg" viewBox="0 0 232 232" role="img" aria-label="' + esc(aria) + '">' +
      '<defs><radialGradient id="tdy-ringglow" cx="50%" cy="50%" r="50%"><stop offset="0" style="stop-color:var(--tdy-glow);stop-opacity:.42"/><stop offset=".55" style="stop-color:var(--tdy-glow);stop-opacity:.10"/><stop offset="1" style="stop-color:var(--tdy-glow);stop-opacity:0"/></radialGradient>' +
      grad('food', 'food-a', 'food-z') + grad('over', 'over-a', 'over-z') + grad('move', 'move-a', 'move-z') + grad('steps', 'steps-a', 'steps-z') +
      '<filter id="tdy-blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6"/></filter></defs>' +
      '<circle cx="116" cy="116" r="124" fill="url(#tdy-ringglow)"/>' + tracks + glows + arcs + ends + pulse + '</svg>';
  }

  function heroTiles(h) {
    const tiles = [
      { id: 'food', label: 'Food', v: U.int(h.eaten), sub: '/' + U.int(h.budget), aria: 'Food: ' + U.int(h.eaten) + ' of ' + U.int(h.budget) + ' kcal budget eaten' },
      { id: 'move', label: 'Move', v: U.int(h.moveDone), sub: '/' + U.int(h.moveGoal), aria: 'Move: ' + U.int(h.moveDone) + ' of ' + U.int(h.moveGoal) + ' active kcal' },
      { id: 'steps', label: 'Steps', v: U.int(h.steps), sub: '/' + kfmt(h.stepGoal), aria: 'Steps: ' + U.int(h.steps) + ' of ' + U.int(h.stepGoal) }
    ];
    return '<div class="today-tiles" role="group" aria-label="Focus a ring">' + tiles.map(t =>
      '<button type="button" class="today-tile t-' + t.id + (h.over && t.id === 'food' ? ' is-over' : '') + '" data-focus="' + t.id + '" aria-pressed="' + (focus === t.id) + '" aria-label="' + esc(t.aria) + '">' +
      '<span class="today-tile-label"><span class="today-tile-dot" aria-hidden="true"></span>' + t.label + '</span>' +
      '<span class="today-tile-val"><span class="today-tile-n">' + t.v + '</span><span class="today-tile-s">' + esc(t.sub) + '</span></span></button>').join('') + '</div>';
  }

  function heroHtml(p, b, h, a, weekCard) {
    const name = (p.name || '').trim();
    const streak = a.streak || 0;
    const chip = streak >= 1 ? '<span class="today-streak">' + FLAME + '<span>' + (streak === 1 ? 'Day 1 streak' : streak + '-day streak') + '</span></span>' : '';
    const c = centers[focus] || centers[''];
    return '<section class="today-hero" aria-labelledby="today-hero-t" data-sel="' + focus + '">' +
      '<div class="today-hero-bg" aria-hidden="true"><span class="today-glow g1"></span><span class="today-glow g2"></span><span class="today-orbit o1"></span><span class="today-orbit o2"></span></div>' +
      '<header class="today-hero-head">' +
      '<div class="today-hero-hd"><div class="today-hero-meta"><p class="today-date">' + esc(U.fmtDate(U.todayKey(), { weekday: 'short', month: 'short', day: 'numeric' })) + '</p>' + chip + '</div>' +
      '<h1 class="today-greet">' + esc(U.greeting() + (name ? ', ' + name : '')) + '</h1></div>' +
      '<a class="today-avatar" href="#profile" aria-label="Profile and settings">' + esc((name[0] || 'M').toUpperCase()) + '</a></header>' +
      '<h2 id="today-hero-t" class="sr-only">Energy today</h2>' +
      '<div class="today-hero-body">' +
      '<div class="today-hero-rings">' +
      '<div class="today-rings">' + ringsSvg(h, b) +
      '<div class="today-center" aria-hidden="true"><span class="today-center-n" data-len="' + c.big.length + '">' + esc(c.big) + '</span><span class="today-center-u">' + esc(c.unit) + '</span></div></div>' +
      '<p class="today-caption" aria-live="polite">' + esc(c.sub) + '</p></div>' +
      '<div class="today-hero-side">' + (weekCard || '') + heroTiles(h) + '</div>' +
      '</div></section>';
  }

  /* ================= 2. WEEK CARD ================= */
  function weekHtml(da, b) {
    const days = da.days;
    const sel = daySel && days.some(d => d.key === daySel) ? daySel : days[days.length - 1].key;
    const gain = !!da.gain;
    const C13 = 2 * Math.PI * 13;
    dayLines = {};
    const cells = days.map(d => {
      const g = gain ? -d.deficit : d.deficit;                   // "good" direction
      const tg = Math.abs(d.target) > 10 ? Math.abs(d.target) : 500;
      let tone = 'none', pct = 0, met = false;
      if (d.logged) {
        if (g < 0 || (!d.partial && !d.under)) { tone = 'warn'; pct = Math.min(1, Math.abs(g) / tg); if (pct < 0.15) pct = 0.15; }
        else { met = !d.partial && g >= tg; tone = met ? 'met' : 'good'; pct = Math.min(1, g / tg); }   // today can't "beat" the target until it's over
      }
      const lab = d.partial ? 'Today' : U.fmtDate(d.key, { weekday: 'narrow' });
      const full = d.partial ? 'Today' : U.fmtDate(d.key, { weekday: 'short', month: 'short', day: 'numeric' });
      let big = '', unit = '', chip, chipTone;
      if (!d.logged) { unit = d.partial ? 'No meals logged yet' : 'No meals logged'; chip = d.partial ? 'In progress' : 'Not logged'; chipTone = d.partial ? 'brand' : 'plain'; }
      else {
        big = U.int(Math.abs(d.deficit));
        unit = d.deficit >= 0 ? 'kcal deficit' : 'kcal surplus';
        if (d.partial) { chip = 'In progress'; chipTone = 'brand'; }
        else if (tone === 'warn') { chip = gain ? 'Under target' : 'Over budget'; chipTone = 'warn'; }
        else if (met) { chip = 'Goal beaten'; chipTone = 'good'; }
        else { chip = gain ? 'On target' : 'Under budget'; chipTone = 'plain'; }
      }
      const detail = d.logged ? 'Ate ' + U.int(d.eaten) + ' · burned ' + U.int(d.burn) + (d.partial ? ' so far' : '') + (d.partial ? '' : ' · budget ' + U.int(Math.max(0, d.budget))) : (d.partial ? 'Log a meal to see today’s balance' : 'Log meals to see that day’s balance');
      dayLines[d.key] = { full, big, unit, chip, chipTone, detail };
      const dash = (pct * C13).toFixed(1) + ' ' + C13.toFixed(1);
      return '<button type="button" class="today-day tone-' + tone + (d.partial ? ' is-today' : '') + '" data-day="' + d.key + '" aria-pressed="' + (d.key === sel) + '" aria-label="' + esc(full + ': ' + (d.logged ? big + ' ' + unit : unit)) + '">' +
        '<svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><circle class="today-day-track" cx="17" cy="17" r="13" fill="none" stroke-width="4.5"' + (tone === 'none' ? ' stroke-dasharray="2.5 3.3"' : '') + '/>' +
        (pct > 0 ? '<circle class="today-day-arc" cx="17" cy="17" r="13" fill="none" stroke-width="4.5" stroke-linecap="round" stroke-dasharray="' + dash + '" transform="rotate(-90 17 17)"/>' : '') +
        (met ? '<circle class="today-day-dot" cx="17" cy="17" r="4"/>' : '') + '</svg>' +
        '<span class="today-day-l">' + esc(lab) + '</span></button>';
    }).join('');
    let title;
    if (!da.completedCount) title = days[days.length - 1].logged ? 'Your week is taking shape' : 'Your week starts here';
    else if (da.completedCount === days.length - 1) title = (gain ? 'On target ' : 'Under budget ') + da.underCount + ' of the last ' + U.plural(da.completedCount, 'day');
    else title = (gain ? 'On target ' : 'Under budget ') + da.underCount + ' of ' + U.plural(da.completedCount, 'logged day');
    const L = dayLines[sel];
    return '<section class="today-week" aria-labelledby="today-wk-t">' +
      '<h2 id="today-wk-t" class="today-week-t">' + esc(title) + '</h2>' +
      '<div class="today-week-line" aria-live="polite">' + dayLineHtml(L) + '</div>' +
      '<div class="today-days" role="group" aria-label="Pick a day">' + cells + '</div></section>';
  }
  function dayLineHtml(L) {
    return '<div class="today-wl-main"><p class="today-wl-1"><span class="muted">' + esc(L.full) + ' · </span>' + (L.big ? '<b>' + esc(L.big) + '</b> ' : '') + '<span>' + esc(L.unit) + '</span></p>' +
      '<p class="today-wl-2">' + esc(L.detail) + '</p></div>' +
      '<span class="today-chip tone-' + L.chipTone + '">' + esc(L.chip) + '</span>';
  }

  /* ================= 3. CLIMB ================= */
  function shortLabel(m, dir, unit) {
    if (m.id === 'half') return 'Halfway';
    if (/^dec-/.test(m.id)) return m.title;
    const n = (m.id.match(/-(\d+(?:\.\d+)?)$/) || [])[1];
    return (dir < 0 ? '−' : '+') + n;
  }
  function storyTitle(m, dir, unit) {
    if (m.id === 'half') return 'Halfway';
    if (/^dec-/.test(m.id)) return m.title;
    return shortLabel(m, dir, unit) + ' ' + unit + ' flag';
  }

  function climbData(p, a, hl) {
    const unit = M.units.unit;
    const dir = a.dir || -1;
    const startKg = a.startKg, goalKg = a.goalKg;
    const journey = Math.abs(goalKg - startKg);
    const valid = fin(startKg) && fin(goalKg) && journey > 0.01;
    const f = valid ? U.clamp(a.goalReached ? 1 : a.progress || 0, 0, 1) : 0;
    const cur = fin(a.current) ? a.current : startKg;
    const proj = a.goalReached ? null : (a.projKey || (U.isValidKey(p.targetDate) ? p.targetDate : null));
    const slope = fin(a.slope) && a.slope * dir > 0.0005 ? Math.abs(a.slope) : null;
    const weekOf = k => Math.max(1, Math.floor(U.diffDays(a.startK, k) / 7) + 1);
    const flags = [];
    if (valid) {
      const next = a.milestones.next;
      a.milestones.weight.filter(m => !m.isGoal).forEach(m => {
        const frac = U.clamp(Math.abs(m.targetKg - startKg) / journey, 0, 1);
        if (frac <= 0.01 || frac >= 0.99) return;
        const isNext = next && next.id === m.id;
        const pr = isNext ? 0 : m.id === 'half' ? 1 : /^dec-/.test(m.id) ? 2 : (/-(\d+)$/.exec(m.id) || [0, 5])[1] % 10 === 0 ? 3 : 4;
        flags.push({ id: m.id, frac, passed: !!m.earned, next: !!isNext, pr, label: (isNext ? 'Next ' : '') + shortLabel(m, dir, unit), m });
      });
    }
    // stories
    stories = {};
    const startTxt = fin(startKg) ? M.units.n(startKg) : '–';
    const wk = Math.floor(Math.max(0, U.diffDays(a.startK, U.todayKey())) / 7);
    stories.start = { kind: 'passed', title: 'Start · ' + startTxt + ' ' + unit, body: U.isValidKey(a.startK) ? U.fmtDateY(a.startK) + ', the first step.' + (wk >= 1 ? ' ' + U.plural(wk, 'week') + ' of climbing since.' : ' Your climb starts now.') : 'Where your climb began.' };
    const best = hl && hl[0] ? hl[0] : null;
    stories.you = { kind: 'you', title: (a.goalReached ? 'Summit reached · ' : 'You are here · ') + M.units.n(cur) + ' ' + unit, html: best ? best.html : esc('Every weigh-in moves this marker.') };
    let goalBody;
    if (a.goalReached) goalBody = 'You made it to the top. Set your next goal in your plan.';
    else if (a.projKey && a.scheduleDays != null && a.scheduleDays >= 7) goalBody = 'On track for ' + U.fmtDateY(a.projKey) + ', ' + U.plural(Math.round(a.scheduleDays / 7), 'week') + ' before your ' + U.fmtDateY(a.target) + ' goal.';
    else if (a.projKey) goalBody = 'At your recent pace you arrive around ' + U.fmtDateY(a.projKey) + '.';
    else if (proj) goalBody = 'Your target date is ' + U.fmtDateY(proj) + '. ' + M.units.abs(a.remaining) + ' ' + unit + ' to go.';
    else goalBody = M.units.abs(a.remaining) + ' ' + unit + ' to go. A few more weigh-ins and we can project your arrival.';
    stories.goal = { kind: 'goal', title: 'Summit · ' + (fin(goalKg) ? M.units.n(goalKg) : '–') + ' ' + unit, body: goalBody };
    flags.forEach(fl => {
      const m = fl.m;
      if (fl.passed && m.date) stories[fl.id] = { kind: 'passed', title: storyTitle(m, dir, unit) + ' · reached ' + U.fmtDate(m.date), body: M.units.n(m.targetKg) + ' ' + unit + ', in week ' + weekOf(m.date) + ' of your climb.' };
      else {
        const toGo = Math.abs(cur - m.targetKg);
        const d = slope ? Math.ceil(toGo / slope) : null;
        stories[fl.id] = { kind: fl.next ? 'next' : 'upcoming', title: (fl.next ? 'Next flag: ' : '') + storyTitle(m, dir, unit) + ' · ' + M.units.n(m.targetKg) + ' ' + unit, body: M.units.abs(toGo) + ' ' + unit + ' to go' + (d && d <= 365 ? ', about ' + U.plural(d, 'day') + ' at your recent pace.' : '.') };
      }
    });
    return { valid, f, cur, unit, dir, startKg, goalKg, proj, flags, goalReached: !!a.goalReached };
  }

  /* --- geometry --- */
  function catmull(pts, n) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      for (let s = 0; s < n; s++) {
        const t = s / n, t2 = t * t, t3 = t2 * t;
        out.push([
          0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
        ]);
      }
    }
    out.push(pts[pts.length - 1].slice());
    return out;
  }
  function measure(pts) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return cum;
  }
  function pointAt(pts, cum, frac) {
    const L = cum[cum.length - 1], d = U.clamp(frac, 0, 1) * L;
    let i = 1; while (i < cum.length - 1 && cum[i] < d) i++;
    const seg = cum[i] - cum[i - 1] || 1, t = (d - cum[i - 1]) / seg;
    return { x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, y: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t, i, d };
  }
  const pathOf = pts => pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
  const tw = s => Math.round(String(s).length * 7.1 + 18);   // 12px/700 label pill width
  const hit = (r, list) => list.some(o => r.x < o.x + o.w + 3 && r.x + r.w + 3 > o.x && r.y < o.y + o.h + 3 && r.y + r.h + 3 > o.y);

  function climbSvg(cd, W) {
    W = Math.max(280, Math.round(W));
    const H = Math.round(U.clamp(W * 0.74, 256, 330));
    const X = fx => 16 + fx * (W - 32), Y = fy => 48 + fy * (H - 72);
    const way = [[0.06, 1.0], [0.32, 0.97], [0.62, 0.91], [0.86, 0.80], [0.80, 0.69], [0.54, 0.63], [0.24, 0.55], [0.09, 0.45], [0.20, 0.35], [0.47, 0.30], [0.64, 0.21], [0.72, 0.10], [0.77, 0.0]];
    const pts = catmull(way.map(p => [X(p[0]), Y(p[1])]), 14);
    const cum = measure(pts);
    const P = fr => pointAt(pts, cum, fr);
    const S = pts[0], G = pts[pts.length - 1];
    const sx = G[0], sy = G[1];
    const me = P(cd.f);
    const svg = [];
    const ns = 'font-family="Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"';
    // defs
    svg.push('<defs>' +
      '<linearGradient id="tdy-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--tdy-sky-a)"/><stop offset=".75" style="stop-color:var(--tdy-sky-z)"/></linearGradient>' +
      '<radialGradient id="tdy-sun" cx=".5" cy=".5" r=".5"><stop offset="0" style="stop-color:var(--tdy-sun);stop-opacity:.75"/><stop offset="1" style="stop-color:var(--tdy-sun);stop-opacity:0"/></radialGradient>' +
      '<linearGradient id="tdy-far" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--tdy-far-a)"/><stop offset=".6" style="stop-color:var(--tdy-far-z)"/></linearGradient>' +
      '<linearGradient id="tdy-mid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--tdy-mid-a)"/><stop offset="1" style="stop-color:var(--tdy-mid-z)"/></linearGradient>' +
      '<linearGradient id="tdy-near" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--tdy-near-a)"/><stop offset="1" style="stop-color:var(--tdy-near-z)"/></linearGradient>' +
      '<linearGradient id="tdy-trail" gradientUnits="userSpaceOnUse" x1="0" y1="' + S[1].toFixed(0) + '" x2="0" y2="' + sy.toFixed(0) + '"><stop offset="0" style="stop-color:var(--tdy-trail-a)"/><stop offset="1" style="stop-color:var(--tdy-trail-z)"/></linearGradient>' +
      '<linearGradient id="tdy-goalflag" x1="0" y1="0" x2="1" y2="0"><stop offset="0" style="stop-color:var(--tdy-goal-a)"/><stop offset="1" style="stop-color:var(--tdy-goal-z)"/></linearGradient>' +
      '<filter id="tdy-shadow" x="-30%" y="-40%" width="160%" height="200%"><feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="#12141C" flood-opacity="0.16"/></filter>' +
      '</defs>');
    // sky, sun, clouds / stars
    svg.push('<rect width="' + W + '" height="' + H + '" fill="url(#tdy-sky)"/>');
    svg.push('<circle cx="' + sx.toFixed(0) + '" cy="' + (sy + 4).toFixed(0) + '" r="' + Math.round(H * 0.32) + '" fill="url(#tdy-sun)"/>');
    svg.push('<g class="today-clouds">' +
      '<ellipse cx="' + X(0.13) + '" cy="' + Y(0.02) + '" rx="26" ry="7"/><ellipse cx="' + (X(0.13) + 16) + '" cy="' + (Y(0.02) - 6) + '" rx="14" ry="8"/>' +
      '<ellipse cx="' + X(0.94) + '" cy="' + Y(0.33) + '" rx="20" ry="5"/><ellipse cx="' + (X(0.94) + 10) + '" cy="' + (Y(0.33) - 5) + '" rx="10" ry="6"/></g>');
    svg.push('<g class="today-stars">' + [[0.04, -0.05], [0.3, -0.12], [0.46, 0.02], [0.92, -0.08], [0.58, -0.1], [0.98, 0.12], [0.36, 0.14]].map(s => '<circle cx="' + X(s[0]).toFixed(0) + '" cy="' + Y(s[1]).toFixed(0) + '" r="1.2"/>').join('') + '</g>');
    // far range (main peak sits behind the summit)
    const far = [[0, Y(0.42)], [X(0.07), Y(0.30)], [X(0.17), Y(0.37)], [X(0.33), Y(0.13)], [X(0.47), Y(0.29)], [X(0.6), Y(0.15)], [sx, sy - 4], [Math.min(W, sx + W * 0.13), Y(0.22)], [W, Y(0.17)]];
    svg.push('<path d="M' + far.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L') + ' L' + W + ' ' + H + ' L0 ' + H + 'Z" fill="url(#tdy-far)"/>');
    svg.push('<path class="today-snow" d="M' + sx.toFixed(1) + ' ' + (sy - 4).toFixed(1) + ' L' + (sx - 20).toFixed(1) + ' ' + (sy + 12).toFixed(1) + ' L' + (sx - 12).toFixed(1) + ' ' + (sy + 14).toFixed(1) + ' L' + (sx - 6).toFixed(1) + ' ' + (sy + 9).toFixed(1) + ' L' + sx.toFixed(1) + ' ' + (sy + 15).toFixed(1) + ' L' + (sx + 6).toFixed(1) + ' ' + (sy + 10).toFixed(1) + ' L' + (sx + 15).toFixed(1) + ' ' + (sy + 12).toFixed(1) + 'Z"/>');
    const p2 = [X(0.33), Y(0.13)];
    svg.push('<path class="today-snow" opacity=".85" d="M' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1) + ' l-12 11 l7 1 l5 -4 l6 5 l5 -3Z"/>');
    // mid + near hills
    svg.push('<path d="M0 ' + Y(0.60).toFixed(1) + ' C' + X(0.17) + ' ' + Y(0.52) + ' ' + X(0.31) + ' ' + Y(0.57) + ' ' + X(0.46) + ' ' + Y(0.52) + ' C' + X(0.63) + ' ' + Y(0.46) + ' ' + X(0.8) + ' ' + Y(0.53) + ' ' + W + ' ' + Y(0.45).toFixed(1) + ' L' + W + ' ' + H + ' L0 ' + H + 'Z" fill="url(#tdy-mid)"/>');
    svg.push('<path d="M0 ' + Y(0.84).toFixed(1) + ' C' + X(0.23) + ' ' + Y(0.77) + ' ' + X(0.46) + ' ' + Y(0.88) + ' ' + X(0.69) + ' ' + Y(0.81) + ' C' + X(0.83) + ' ' + Y(0.77) + ' ' + X(0.91) + ' ' + Y(0.80) + ' ' + W + ' ' + Y(0.74).toFixed(1) + ' L' + W + ' ' + H + ' L0 ' + H + 'Z" fill="url(#tdy-near)"/>');
    // trees
    const tree = (fx, fy, s) => { const x = X(fx), y = Y(fy); return '<path d="M' + (x - s * 0.45).toFixed(1) + ' ' + y.toFixed(1) + ' L' + x.toFixed(1) + ' ' + (y - s).toFixed(1) + ' L' + (x + s * 0.45).toFixed(1) + ' ' + y.toFixed(1) + 'Z"/>'; };
    svg.push('<g class="today-trees">' + tree(0.9, 0.98, 16) + tree(0.94, 1.02, 18) + tree(0.98, 0.95, 13) + tree(0.43, 0.79, 13) + tree(0.46, 0.80, 11) + tree(0.03, 0.58, 13) + '</g>');
    // trail bed
    const all = pathOf(pts);
    svg.push('<path d="' + all + '" fill="none" class="today-trail-shadow" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>');
    svg.push('<path d="' + all + '" fill="none" class="today-trail-bed" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>');
    // progress + remaining
    const done = pts.slice(0, me.i).concat([[me.x, me.y]]);
    const rest = [[me.x, me.y]].concat(pts.slice(me.i));
    if (cd.f > 0.002) svg.push('<path d="' + pathOf(done) + '" fill="none" stroke="url(#tdy-trail)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>');
    if (cd.f < 0.998) svg.push('<path d="' + pathOf(rest) + '" fill="none" class="today-trail-ahead" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="0.1 8"/>');
    // selection halo
    svg.push('<circle id="tdy-sel" class="today-sel" r="15" cx="-50" cy="-50"/>');

    // ---- labels, collision-aware ----
    const placed = [];
    const items = {};
    const pills = [];
    // goal
    const projTxt = cd.proj ? (U.diffDays(U.todayKey(), cd.proj) > 300 ? U.fmtDate(cd.proj, { month: 'short', year: 'numeric' }) : U.fmtDate(cd.proj)) : '';   // far dates need the year
    const goalTxt = (fin(cd.goalKg) ? M.units.n(cd.goalKg, cd.unit === 'lb' ? 0 : 1).replace(/\.0$/, '') + ' ' + cd.unit : 'Goal') + (projTxt ? ' · ' + projTxt : '');
    const gw = tw(goalTxt) + 4;
    const gRect = { x: U.clamp(sx - gw - 10, 4, W - gw - 4), y: Math.max(4, sy - 40), w: gw, h: 22 };
    placed.push(gRect, { x: sx - 2, y: sy - 34, w: 26, h: 16 });
    items.goal = { x: sx, y: sy - 14 };
    // you are here tooltip
    const youTxt = M.units.n(cd.cur) + ' ' + cd.unit;
    const yw = tw(youTxt);
    let yRect = { x: U.clamp(me.x - yw / 2, 4, W - yw - 4), y: me.y - 42, w: yw, h: 24 }, yBelow = false;
    if (yRect.y < 4 || hit(yRect, placed)) { yRect = { x: yRect.x, y: me.y + 18, w: yw, h: 24 }; yBelow = true; }
    placed.push(yRect, { x: me.x - 12, y: me.y - 12, w: 24, h: 24 });
    items.you = { x: me.x, y: me.y };
    // start
    const showStart = cd.f > 0.05;
    if (showStart) {
      const sTxt = 'Start ' + M.units.n(cd.startKg, cd.unit === 'lb' ? 0 : 1);
      const sw = tw(sTxt);
      const sRect = { x: U.clamp(S[0] - 14, 4, W - sw - 4), y: S[1] - 34, w: sw, h: 20 };
      placed.push(sRect);
      pills.push('<rect x="' + sRect.x.toFixed(1) + '" y="' + sRect.y.toFixed(1) + '" width="' + sw + '" height="20" rx="10" class="today-pill" filter="url(#tdy-shadow)"/><text x="' + (sRect.x + sw / 2).toFixed(1) + '" y="' + (sRect.y + 14).toFixed(1) + '" text-anchor="middle" class="today-pill-t" ' + ns + '>' + esc(sTxt) + '</text>');
    }
    items.start = { x: S[0], y: S[1] };
    placed.push({ x: S[0] - 9, y: S[1] - 9, w: 18, h: 18 });   // keep flag labels off the start dot
    // flags: thin by arc distance, priority order
    const L = cum[cum.length - 1];
    const kept = [];
    cd.flags.slice().sort((a, b) => a.pr - b.pr || a.frac - b.frac).forEach(fl => {
      if (kept.length >= 9) return;
      const d = fl.frac * L;
      if (d < 26 || L - d < 34 || Math.abs(d - cd.f * L) < 14) return;
      if (kept.some(k => Math.abs(k.frac * L - d) < 24)) return;
      // visual QA: also thin by on-screen distance (switchbacks bring far-apart arc points close together)
      const q = P(fl.frac), dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
      if (dist(q, { x: S[0], y: S[1] }) < 48 || dist(q, me) < 24) return;
      if (kept.some(k => dist(P(k.frac), q) < 36)) return;
      kept.push(fl);
    });
    const poles = [], tips = [], rings = [], labels = [];
    kept.forEach(fl => {
      const pt = P(fl.frac);
      const x = pt.x, y = pt.y;
      fl.x = x; fl.y = y;
      const cls = fl.passed ? 'is-passed' : 'is-ahead';
      poles.push('<path class="today-pole ' + cls + '" d="M' + x.toFixed(1) + ' ' + y.toFixed(1) + ' V' + (y - 24).toFixed(1) + '"/>');
      tips.push('<path class="today-flag ' + cls + '" d="M' + x.toFixed(1) + ' ' + (y - 24).toFixed(1) + ' L' + (x + 13).toFixed(1) + ' ' + (y - 19.5).toFixed(1) + ' L' + x.toFixed(1) + ' ' + (y - 15).toFixed(1) + 'Z"/>');
      rings.push('<circle class="today-flag-base ' + cls + '" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3.5"/>');
      placed.push({ x: x - 2, y: y - 26, w: 17, h: 26 });
      items[fl.id] = { x, y: y - 12 };
    });
    kept.forEach(fl => {
      const w = tw(fl.label), h = 20, x = fl.x, y = fl.y;
      const cands = [{ x: x + 16, y: y - 26 }, { x: x - w - 6, y: y - 30 }, { x: x + 8, y: y + 6 }, { x: x - w / 2, y: y + 8 }, { x: x - w - 6, y: y - 8 }];
      const c = cands.map(c => ({ x: c.x, y: c.y, w, h })).find(r => r.x >= 4 && r.x + r.w <= W - 4 && r.y >= 4 && r.y + r.h <= H - 4 && !hit(r, placed));
      if (!c) return;
      placed.push(c);
      labels.push('<rect x="' + c.x.toFixed(1) + '" y="' + c.y.toFixed(1) + '" width="' + w + '" height="20" rx="10" class="today-pill' + (fl.next ? ' is-next' : '') + '"' + (fl.next ? '' : ' filter="url(#tdy-shadow)"') + '/>' +
        '<text x="' + (c.x + w / 2).toFixed(1) + '" y="' + (c.y + 14).toFixed(1) + '" text-anchor="middle" class="today-pill-t' + (fl.next ? ' is-next' : '') + '" ' + ns + '>' + esc(fl.label) + '</text>');
    });
    svg.push(poles.join('') + tips.join('') + rings.join(''));
    // start dot
    svg.push('<circle class="today-start" cx="' + S[0].toFixed(1) + '" cy="' + S[1].toFixed(1) + '" r="6" stroke-width="2.5"/>');
    svg.push(pills.join('') + labels.join(''));
    // summit flag + pill
    svg.push('<path class="today-goalpole" d="M' + sx.toFixed(1) + ' ' + sy.toFixed(1) + ' V' + (sy - 30).toFixed(1) + '" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M' + sx.toFixed(1) + ' ' + (sy - 30).toFixed(1) + ' L' + (sx + 23).toFixed(1) + ' ' + (sy - 24).toFixed(1) + ' L' + sx.toFixed(1) + ' ' + (sy - 18).toFixed(1) + 'Z" fill="url(#tdy-goalflag)"/>' +
      '<rect x="' + gRect.x.toFixed(1) + '" y="' + gRect.y.toFixed(1) + '" width="' + gw + '" height="22" rx="11" class="today-goalpill" filter="url(#tdy-shadow)"/>' +
      '<text x="' + (gRect.x + gw / 2).toFixed(1) + '" y="' + (gRect.y + 15).toFixed(1) + '" text-anchor="middle" class="today-pill-t" ' + ns + '>' + esc(goalTxt) + '</text>');
    // you are here
    const mx = me.x.toFixed(1), my = me.y.toFixed(1);
    svg.push('<circle class="today-me-pulse" cx="' + mx + '" cy="' + my + '" r="14"/>' +
      '<circle class="today-me-ring" cx="' + mx + '" cy="' + my + '" r="10" filter="url(#tdy-shadow)"/>' +
      '<circle class="today-me-dot" cx="' + mx + '" cy="' + my + '" r="6.5"/>' +
      '<rect class="today-tip" x="' + yRect.x.toFixed(1) + '" y="' + yRect.y.toFixed(1) + '" width="' + yw + '" height="24" rx="12"/>' +
      (yBelow ? '<path class="today-tip" d="M' + (me.x - 6).toFixed(1) + ' ' + yRect.y.toFixed(1) + ' L' + mx + ' ' + (yRect.y - 6).toFixed(1) + ' L' + (me.x + 6).toFixed(1) + ' ' + yRect.y.toFixed(1) + 'Z"/>'
        : '<path class="today-tip" d="M' + (me.x - 6).toFixed(1) + ' ' + (yRect.y + 24).toFixed(1) + ' L' + mx + ' ' + (yRect.y + 30).toFixed(1) + ' L' + (me.x + 6).toFixed(1) + ' ' + (yRect.y + 24).toFixed(1) + 'Z"/>') +
      '<text x="' + (yRect.x + yw / 2).toFixed(1) + '" y="' + (yRect.y + 16).toFixed(1) + '" text-anchor="middle" class="today-tip-t" ' + ns + '>' + esc(youTxt) + '</text>');

    const passedN = kept.filter(k => k.passed).length;
    const aria = 'Journey map from ' + M.units.n(cd.startKg) + ' ' + cd.unit + ' at the start to the ' + M.units.n(cd.goalKg) + ' ' + cd.unit + ' summit. You are at ' + youTxt + ', ' + Math.round(cd.f * 100) + ' percent of the way.' + (passedN ? ' ' + U.plural(passedN, 'flag') + ' passed.' : '') + (cd.proj ? ' Projected arrival ' + U.fmtDateY(cd.proj) + '.' : '');
    // hit targets
    const order = ['start'].concat(kept.slice().sort((x, y) => x.frac - y.frac).map(k => k.id), ['you', 'goal']);
    const btns = order.filter(id => items[id] && stories[id]).map(id => {
      const it = items[id];
      return '<button type="button" class="today-hit" data-climb="' + id + '" aria-pressed="' + (climbSel === id) + '" aria-label="' + esc(stories[id].title) + '" style="left:' + (it.x - 22).toFixed(1) + 'px;top:' + (it.y - 22).toFixed(1) + 'px"></button>';
    }).join('');
    climbModel = { items };
    return '<div class="today-map-inner" style="height:' + H + 'px"><svg class="today-map-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(aria) + '">' + svg.join('') + '</svg>' + btns + '</div>';
  }

  function storyHtml(id) {
    const s = stories[id] || stories.you;
    return '<span class="today-story-ic k-' + s.kind + '" aria-hidden="true">' + FLAG_IC + '</span>' +
      '<div class="today-story-main"><p class="today-story-t">' + esc(s.title) + '</p><p class="today-story-b">' + (s.html || esc(s.body)) + '</p></div>';
  }

  function bmiRow(p, kg) {
    if (!fin(p.heightCm) || !fin(kg)) return '';
    const v = bmiOf(kg, p.heightCm);
    if (!fin(v)) return '';
    const cat = bmiCat(v);
    const hr = healthyRange(p.heightCm);
    const u = M.units.unit, d = u === 'lb' ? 0 : 1;
    let sub;
    if (cat.key === 'healthy') sub = 'Healthy range ' + M.units.n(hr.minKg, d) + '–' + M.units.n(hr.maxKg, d) + ' ' + u;
    else if (cat.key === 'under') sub = 'Healthy range from ' + M.units.n(hr.minKg, d) + ' ' + u;
    else sub = 'Healthy range up to ' + M.units.n(hr.maxKg, d) + ' ' + u;
    const pos = U.clamp((v - 15) / (40 - 15), 0, 1) * 40;
    return '<a class="today-bmi" href="#bmi">' +
      '<span class="today-bmi-scale" aria-hidden="true"><svg width="40" height="14" viewBox="0 0 40 14">' +
      '<rect x="0" y="5" width="5.5" height="4" rx="2" class="b-under"/><rect x="7" y="5" width="9.5" height="4" rx="2" class="b-healthy"/><rect x="18" y="5" width="6.5" height="4" rx="2" class="b-over"/><rect x="26" y="5" width="14" height="4" rx="2" class="b-obese"/>' +
      '<rect x="' + U.clamp(pos - 1.5, 0, 37).toFixed(1) + '" y="1" width="3" height="12" rx="1.5" class="b-mark"/></svg></span>' +
      '<span class="today-bmi-main"><span class="today-bmi-t">BMI ' + f1(v) + ' <span class="today-bmi-cat k-' + esc(cat.key) + '">· ' + esc(cat.label) + '</span></span>' +
      '<span class="today-bmi-s">' + esc(sub) + '</span></span>' + M.icon('chevron', 'sm') + '</a>';
  }

  function climbHtml(p, a, cd) {
    const unit = cd.unit;
    const pct = Math.round(cd.f * 100);
    const goalLbl = fin(cd.goalKg) ? M.units.n(cd.goalKg, unit === 'lb' ? 0 : 1).replace(/\.0$/, '') + ' ' + unit : 'your goal';
    const ch = fin(a.totalChange) ? a.totalChange : 0;
    const toward = ch * cd.dir > 0.05;
    const since = U.isValidKey(a.startK) ? ' since ' + U.fmtDate(a.startK) : '';
    const line = cd.goalReached ? '<b class="c-good">' + M.units.signed(ch) + ' ' + unit + '</b>' + since + ' · summit reached'
      : (Math.abs(ch) > 0.05 ? '<b class="' + (toward ? 'c-good' : 'c-warn') + '">' + M.units.signed(ch) + ' ' + unit + '</b>' + esc(since) + ' · ' : 'Starting point' + esc(since ? ' · ' + U.fmtDate(a.startK) : '') + ' · ') + esc(M.units.abs(a.remaining) + ' ' + unit + ' to the summit');
    const chip = '<span class="today-chip tone-good">' + (cd.goalReached ? 'Summit!' : pct + '% climbed') + '</span>';
    return '<section class="today-climb" aria-labelledby="today-climb-t">' +
      '<div class="today-climb-head"><div class="today-climb-row"><h2 id="today-climb-t" class="today-card-t">Your climb to ' + esc(goalLbl) + '</h2>' + chip + '</div>' +
      '<p class="today-climb-big"><span class="today-climb-n">' + M.units.n(cd.cur) + '</span><span class="today-climb-u">' + unit + '</span></p>' +
      '<p class="today-climb-sub">' + line + '</p></div>' +
      '<div class="today-map" data-slot="map"></div>' +
      '<div class="today-story" aria-live="polite">' + storyHtml(climbSel) + '</div>' +
      bmiRow(p, cd.cur) + '</section>';
  }

  /* ================= 4. PLAN ================= */
  function planModel(p, b, h) {
    const u = M.units.unit;
    const day = M.store.getDay(U.todayKey());
    const ws = day.weights.slice().sort((x, y) => x.t - y.t);
    const dinner = day.foods.some(f => f.meal === 'dinner');
    const times = ws.map(w => U.fmtTime(w.t));
    const listTimes = times.length <= 2 ? times.join(' and ') : times.slice(0, -1).join(', ') + ' and ' + times[times.length - 1];
    const tread = Math.max(1, Math.round(h.moveEq.treadmillMin || 0));
    const items = [];
    // eat
    if (b.gain) items.push({ id: 'eat', icon: 'food', tone: 'brand', title: 'Eat at least ' + U.int(h.budget) + ' kcal', sub: b.left > 0 ? U.int(b.left) + ' kcal to go' : 'Target reached', auto: b.left <= 0, sheet: 'food' });
    else items.push({
      id: 'eat', icon: 'food', tone: h.over ? 'amber' : 'brand', title: 'Eat under ' + U.int(h.budget) + ' kcal',
      sub: !b.hasFood ? 'Nothing logged yet' : h.over ? 'Over by ' + U.int(b.overBy) + ' kcal · a walk evens it out' : U.int(b.left) + ' kcal left' + (dinner ? '' : ' for dinner'),
      auto: b.hasFood && dinner && !h.over, sheet: 'food'
    });
    // move
    items.push(h.moveLeft > 0
      ? { id: 'move', icon: 'activity', tone: 'teal', title: tread + ' min on the treadmill', sub: '3.5 mph · 5% incline ≈ ' + U.int(h.moveLeft) + ' kcal', auto: false, sheet: 'workout' }
      : { id: 'move', icon: 'activity', tone: 'teal', title: 'Move goal reached', sub: U.int(h.moveDone) + ' active kcal today', auto: true, sheet: 'workout' });
    // steps
    items.push({ id: 'steps', icon: 'steps', tone: 'teal', title: 'Reach ' + U.int(h.stepGoal) + ' steps', sub: h.steps ? U.int(h.steps) + ' so far · ' + (h.stepsLeft ? U.int(h.stepsLeft) + ' to go' : 'goal reached') : 'Import from Samsung Health or type them in', auto: h.steps >= h.stepGoal, sheet: 'activity' });
    // weigh-in
    items.push(ws.length
      ? { id: 'weigh', icon: 'scale', tone: 'plain', title: 'Weighed in today', sub: 'Logged ' + listTimes, auto: true, sheet: 'weighIn' }
      : { id: 'weigh', icon: 'scale', tone: 'plain', title: 'Weigh in', sub: new Date().getHours() < 11 ? 'Best first thing in the morning' : 'Any time works. Your trend smooths it out', auto: false, sheet: 'weighIn' });
    const ticks = readTicks();
    items.forEach(it => { it.done = typeof ticks[it.id] === 'boolean' ? ticks[it.id] : it.auto; });
    return items;
  }
  function planHtml(items) {
    const n = items.filter(i => i.done).length, N = items.length;
    return '<section class="today-plan" aria-labelledby="today-plan-t">' +
      '<div class="today-plan-head"><h2 id="today-plan-t" class="today-card-t">Today’s plan</h2><a class="today-plan-link" href="#plan">Full plan' + M.icon('chevron', 'sm') + '</a></div>' +
      '<div class="today-plan-prog"><div class="today-segs" role="progressbar" aria-label="Plan progress" aria-valuemin="0" aria-valuemax="' + N + '" aria-valuenow="' + n + '">' +
      items.map((it, i) => '<span' + (i < n ? ' class="on"' : '') + '></span>').join('') + '</div>' +
      '<span class="today-plan-count' + (n === N ? ' is-all' : '') + '">' + (n === N ? 'All done — great day' : n + ' of ' + N + ' done') + '</span></div>' +
      '<ul class="today-tasks">' + items.map(it =>
        '<li class="today-task' + (it.done ? ' is-done' : '') + '" data-task="' + it.id + '">' +
        '<button type="button" class="today-task-main" data-open-sheet="' + it.sheet + '">' +
        '<span class="today-task-ic tone-' + it.tone + '" aria-hidden="true">' + M.icon(it.icon) + '</span>' +
        '<span class="today-task-txt"><span class="today-task-t">' + esc(it.title) + '</span><span class="today-task-s">' + esc(it.sub) + '</span></span></button>' +
        '<button type="button" class="today-tick" data-tick="' + it.id + '" aria-pressed="' + it.done + '" aria-label="' + esc((it.done ? 'Mark not done: ' : 'Mark done: ') + it.title) + '"><span class="today-tick-c">' + CHECK + '</span></button>' +
        '</li>').join('') + '</ul></section>';
  }

  /* ================= 5. LOG (meals + weigh-ins) ================= */
  function logHtml(b) {
    const day = M.store.getDay(U.todayKey());
    const foods = day.foods.slice().sort((x, y) => x.t - y.t);
    const ws = day.weights.slice().sort((x, y) => y.t - x.t);
    const label = id => (M.MEALS.find(m => m.id === id) || { label: 'Snack' }).label;
    const meals = '<section class="card today-log" aria-labelledby="today-meals-t">' +
      '<div class="card-head"><div class="ch-text"><h2 id="today-meals-t" class="card-title">Today’s meals</h2>' +
      (foods.length ? '<p class="card-sub">' + U.int(b.eaten) + ' kcal · ' + U.plural(foods.length, 'item') + '</p>' : '') + '</div>' +
      '<div class="ch-action"><a class="link-btn" href="#food">See all</a></div></div>' +
      (foods.length ? '<div class="list">' + foods.slice(-4).map(f =>
        '<button type="button" class="row" data-open-sheet="food" data-sheet-opts=\'' + esc(JSON.stringify({ id: f.id })) + '\'>' +
        (f.thumb ? '<img class="row-thumb" src="' + esc(f.thumb) + '" alt="">' : '<span class="row-thumb">' + M.icon(f.source === 'photo' ? 'camera' : 'food') + '</span>') +
        '<span class="row-main"><span class="row-title">' + esc(f.name) + '</span><span class="row-sub">' + esc(label(f.meal) + ' · ' + U.fmtTime(f.t)) + '</span></span>' +
        '<span class="row-end"><span class="row-value">' + U.int(f.kcal) + '<span class="unit">kcal</span></span></span></button>').join('') + '</div>'
        : '<button type="button" class="today-log-empty" data-open-sheet="food"><span class="ic-bubble brand sm">' + M.icon('plus') + '</span><span>Log a meal by photo, words or numbers</span></button>') +
      '</section>';
    const weighs = '<section class="card today-log" aria-labelledby="today-wi-t">' +
      '<div class="card-head"><div class="ch-text"><h2 id="today-wi-t" class="card-title">Weigh-ins today</h2></div>' +
      '<div class="ch-action"><a class="link-btn" href="#progress">Progress</a></div></div>' +
      (ws.length ? '<div class="list">' + ws.slice(0, 3).map(w =>
        '<button type="button" class="row" data-open-sheet="weighIn" data-sheet-opts=\'' + esc(JSON.stringify({ id: w.id })) + '\'>' +
        '<span class="row-thumb">' + M.icon('scale') + '</span>' +
        '<span class="row-main"><span class="row-title">' + esc(U.fmtTime(w.t)) + '</span>' + ((w.tags && w.tags.length) ? '<span class="row-sub">' + esc(w.tags.join(', ')) + '</span>' : '') + '</span>' +
        '<span class="row-end"><span class="row-value">' + M.units.n(w.kg) + '<span class="unit">' + M.units.unit + '</span></span></span></button>').join('') + '</div>'
        : '<button type="button" class="today-log-empty" data-open-sheet="weighIn"><span class="ic-bubble brand sm">' + M.icon('plus') + '</span><span>Step on the scale. Weigh in as often as you like</span></button>') +
      '</section>';
    return '<div class="today-logs">' + meals + weighs + '</div>';
  }

  /* ================= interactions (in place, no full re-render) ================= */
  function paintFocus(root) {
    const hero = root.querySelector('.today-hero');
    if (!hero) return;
    hero.dataset.sel = focus;
    const c = centers[focus] || centers[''];
    const n = hero.querySelector('.today-center-n');
    n.textContent = c.big; n.dataset.len = c.big.length;
    hero.querySelector('.today-center-u').textContent = c.unit;
    hero.querySelector('.today-caption').textContent = c.sub;
    hero.querySelectorAll('button[data-focus]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.focus === focus)));
  }
  function paintDay(root) {
    const wk = root.querySelector('.today-week'); if (!wk) return;
    const L = dayLines[daySel] || dayLines[Object.keys(dayLines).pop()];
    wk.querySelector('.today-week-line').innerHTML = dayLineHtml(L);
    wk.querySelectorAll('[data-day]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.day === (daySel || Object.keys(dayLines).pop()))));
  }
  function paintClimb(root) {
    const st = root.querySelector('.today-story'); if (st) st.innerHTML = storyHtml(climbSel);
    root.querySelectorAll('[data-climb]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.climb === climbSel)));
    const sel = root.querySelector('#tdy-sel');
    const it = climbModel && climbModel.items[climbSel];
    if (sel) { if (it && climbSel !== 'you') { sel.setAttribute('cx', it.x.toFixed(1)); sel.setAttribute('cy', it.y.toFixed(1)); } else { sel.setAttribute('cx', '-50'); sel.setAttribute('cy', '-50'); } }
  }
  function drawMap(root, cd) {
    const slot = root.querySelector('[data-slot="map"]'); if (!slot) return;
    const w = slot.clientWidth || 350;
    roW = w;
    slot.innerHTML = climbSvg(cd, w);
    paintClimb(root);
  }

  /* ================= view ================= */
  M.views.today = {
    title: 'Today',
    narrow: false,
    render(el) {
      const p = M.state.profile || {};
      const b = M.data.balance(), ta = M.data.todayActions(), a = M.data.analysis(), da = M.data.deficits(7);
      const hl = M.data.headlines() || [];
      const desk = isDesk();
      const h = heroModel(p, b, ta);
      centers = heroCenters(b, h);
      const cd = climbData(p, a, hl);
      if (!stories[climbSel]) climbSel = 'you';
      const week = weekHtml(da, b);
      const plan = planHtml(planModel(p, b, h));

      el.innerHTML = '<div class="view today-root' + (desk ? ' is-desk' : '') + '">' +
        '<div class="today-top">' + heroHtml(p, b, h, a, desk ? week : '') + (desk ? '' : week) + '</div>' +
        '<div class="today-duo">' + climbHtml(p, a, cd) + '<div class="today-col">' + plan + logHtml(b) + '</div></div></div>';
      const root = el.firstElementChild;
      animated = true;
      drawMap(root, cd);

      root.addEventListener('click', e => {
        const t = e.target.closest('[data-focus],[data-day],[data-climb],[data-tick]');
        if (!t || !root.contains(t)) return;
        if (t.dataset.tick) {
          const id = t.dataset.tick;
          const ticks = readTicks();
          const li = t.closest('.today-task');
          const now = !li.classList.contains('is-done');
          ticks[id] = now; writeTicks(ticks);
          li.classList.toggle('is-done', now);
          t.setAttribute('aria-pressed', String(now));
          const title = li.querySelector('.today-task-t').textContent;
          t.setAttribute('aria-label', (now ? 'Mark not done: ' : 'Mark done: ') + title);
          const all = root.querySelectorAll('.today-task'), n = root.querySelectorAll('.today-task.is-done').length;
          root.querySelectorAll('.today-segs > span').forEach((s, i) => s.classList.toggle('on', i < n));
          root.querySelector('.today-segs').setAttribute('aria-valuenow', String(n));
          const cnt = root.querySelector('.today-plan-count');
          cnt.textContent = n === all.length ? 'All done — great day' : n + ' of ' + all.length + ' done';
          cnt.classList.toggle('is-all', n === all.length);
          return;
        }
        if (t.dataset.focus) { focus = focus === t.dataset.focus ? '' : t.dataset.focus; paintFocus(root); return; }
        if (t.dataset.day) { daySel = t.dataset.day; paintDay(root); return; }
        if (t.dataset.climb) { climbSel = climbSel === t.dataset.climb && t.dataset.climb !== 'you' ? 'you' : t.dataset.climb; paintClimb(root); }
      });

      // re-draw the mountain when the card width changes
      try {
        if (ro) ro.disconnect();
        const slot = root.querySelector('[data-slot="map"]');
        ro = new ResizeObserver(() => {
          const w = slot.clientWidth;
          if (w && Math.abs(w - roW) > 4 && document.body.contains(slot)) drawMap(root, cd);
        });
        ro.observe(slot);
      } catch (e) { ro = null; }

      if (!mq) {
        try {
          mq = matchMedia('(min-width: 1024px)');
          mqHandler = () => { if (document.querySelector('.today-root')) M.render(); };
          mq.addEventListener('change', mqHandler);
        } catch (e) { mq = null; }
      }
    },
    destroy() {
      if (ro) { try { ro.disconnect(); } catch (e) {} ro = null; }
      if (mq && mqHandler) { try { mq.removeEventListener('change', mqHandler); } catch (e) {} }
      mq = null; mqHandler = null;
      animated = false; focus = ''; daySel = null; climbSel = 'you';
    }
  };
})();
