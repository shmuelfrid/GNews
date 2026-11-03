/* Momentum v2 — PROGRESS view (#progress). Owner: progress builder. Styles: css/progress.css (.prog-*).
   Focal point: the headline card ("You lost 4.6 lb last week") with goal progress.
   Then: weight trend (range 1W/1M/3M/All, goal + projection), daily deficit bars with takeaway and
   expected-vs-actual, stats grid, weekly change bars, patterns (only with enough data), milestones.
   Desktop (>=1024): two columns (7/5) inside the centered container. */
(function () {
  'use strict';
  const M = window.M, U = M.util, ui = M.ui, C = M.calc;
  const esc = U.esc;
  const fin = v => typeof v === 'number' && isFinite(v);

  /* ---------- module state (survives re-renders) ---------- */
  let range = '3M';
  let showAllMs = false;
  let charts = [];
  let bound = null;

  const RANGES = [{ v: '1W', label: '1W', days: 7 }, { v: '1M', label: '1M', days: 30 }, { v: '3M', label: '3M', days: 91 }, { v: 'All', label: 'All', days: null }];
  const killCharts = () => { charts.forEach(c => { try { c.destroy(); } catch (e) {} }); charts = []; };
  const nb = s => String(s).replace(/ /g, ' ');
  const unitOf = () => M.units.unit;
  const disp = kg => M.units.to(kg);
  const dateS = k => (U.isValidKey(k) ? U.fmtDateY(k) : '');
  const v = (n, unit) => '<span class="prog-num">' + esc(n) + '</span>' + (unit ? '<span class="prog-unit">' + esc(unit) + '</span>' : '');
  const weeksWord = d => { const w = Math.round(Math.abs(d) / 7); return w >= 1 ? U.plural(w, 'week') : U.plural(Math.abs(d), 'day'); };

  /* ================= focal headline ================= */
  function headline(a, p) {
    const u = unitOf();
    const toward = d => d * a.dir;
    const lost = a.dir < 0 ? 'lost' : 'gained';
    let over = '', title = '', sub = '';
    const lw = a.lastWeek;
    if (!a.series.length) {
      return null;
    }
    if (a.goalReached) {
      over = 'Goal reached';
      title = 'You made it to <span class="prog-hl-num">' + esc(nb(M.units.w(a.goalKg))) + '</span>';
      sub = 'Keep logging to hold it. Set a new goal in your plan whenever you are ready.';
    } else if (lw && toward(lw.change) > 0.05) {
      over = 'Last week · ' + U.fmtDate(lw.start) + ' – ' + U.fmtDate(lw.end);
      title = 'You ' + lost + ' <span class="prog-hl-num">' + esc(nb(M.units.abs(lw.change) + ' ' + u)) + '</span> last week';
      const best = a.bestWeek === lw && a.dataWeeks.length >= 3;
      const parts = [];
      if (best) parts.push('Your best week yet.');
      if (fin(a.pace4) && toward(a.pace4) > 0.02) {
        const ratio = Math.abs(lw.change) / Math.abs(a.pace4);
        if (ratio >= 1.3) parts.push(ratio.toFixed(1) + '× your 4-week pace.');
        else if (ratio >= 0.8) parts.push('Right in line with your 4-week pace.');
        else parts.push('Your 4-week pace is ' + M.units.abs(a.pace4) + ' ' + u + ' a week.');
      }
      if (!parts.length) parts.push('That is real progress. Keep the rhythm going.');
      sub = parts.join(' ');
    } else if (lw && toward(lw.change) < -0.05) {
      over = 'Last week · ' + U.fmtDate(lw.start) + ' – ' + U.fmtDate(lw.end);
      title = (a.dir < 0 ? 'Up ' : 'Down ') + '<span class="prog-hl-num prog-hl-warn">' + esc(nb(M.units.abs(lw.change) + ' ' + u)) + '</span> last week';
      sub = fin(a.pace4) && toward(a.pace4) > 0.02
        ? 'One week is noise. Your 4-week trend is still ' + M.units.signed(a.pace4) + ' ' + u + ' a week.'
        : 'Scale weeks like this happen to everyone. Water and salt move the number; the next good week starts today.';
    } else if (fin(a.change7) && toward(a.change7) > 0.05) {
      over = 'Last 7 days';
      title = '<span class="prog-hl-num">' + esc(nb(M.units.abs(a.change7) + ' ' + u)) + '</span> ' + (a.change7 < 0 ? 'down' : 'up') + ' this week';
      sub = 'Keep that rhythm and the trend line follows.';
    } else if (toward(a.totalChange) > 0.05) {
      over = 'Since ' + (dateS(a.startK) || 'you started');
      title = 'You have ' + lost + ' <span class="prog-hl-num">' + esc(nb(M.units.abs(a.totalChange) + ' ' + u)) + '</span>';
      sub = a.series.length < 7 ? 'A few more weigh-ins and your weekly story appears here.' : 'Steady beats fast. Every log sharpens the picture.';
    } else {
      over = a.series.length === 1 ? 'Day one' : 'Getting started';
      title = 'Your starting point: <span class="prog-hl-num">' + esc(nb(M.units.w(a.current))) + '</span>';
      sub = a.series.length < 3 ? 'Weigh in on a few more days and your trend line appears.' : 'Keep logging. Real change shows up over weeks, not days.';
    }
    const journey = Math.abs(disp(a.goalKg) - disp(a.startKg));
    const done = Math.max(0, a.toward(disp(a.current) - disp(a.startKg)));
    const frac = journey > 0 ? U.clamp(done / journey, 0, 1) : 0;
    return { over, title, sub, frac, done, journey };
  }

  function heroCard(a, p) {
    const h = headline(a, p);
    if (!h) {
      return '<section class="card hero prog-hero prog-o1" aria-labelledby="prog-hl">' +
        '<div class="prog-hero-empty">' +
        '<span class="ic-bubble brand">' + M.icon('progress', 'lg') + '</span>' +
        '<p class="t-over muted">Your progress</p>' +
        '<h2 id="prog-hl" class="prog-hl">Your story starts with one weigh-in</h2>' +
        '<p class="prog-hl-sub">Log your weight and this screen turns into your trend, weekly wins, milestones and the date you will reach your goal.</p>' +
        '<div><button type="button" class="btn btn-primary" data-open-sheet="weighIn">' + M.icon('scale') + '<span class="btn-label">Log a weigh-in</span></button></div>' +
        '</div></section>';
    }
    const u = unitOf();
    const pct = Math.round(h.frac * 100);
    const word = a.dir < 0 ? 'lost' : 'gained';
    return '<section class="card hero prog-hero prog-o1" aria-labelledby="prog-hl">' +
      '<div class="prog-hero-text">' +
      '<p class="t-over muted">' + esc(h.over) + '</p>' +
      '<h2 id="prog-hl" class="prog-hl">' + h.title + '</h2>' +
      '<p class="prog-hl-sub">' + esc(h.sub) + '</p>' +
      '</div>' +
      '<div class="prog-goalbar">' +
      '<div class="prog-goalbar-meta"><span class="prog-goalbar-l"><b class="num">' + esc(h.done.toFixed(1)) + '</b> of ' + esc(h.journey.toFixed(1) + ' ' + u) + ' ' + word + '</span><b class="num nowrap">' + pct + '%</b></div>' +
      ui.progress(h.frac, 'teal', pct + ' percent of the way to your goal') +
      '<div class="prog-goalbar-ends"><span>Start ' + esc(M.units.n(a.startKg)) + '</span><span>Goal ' + esc(M.units.n(a.goalKg)) + '</span></div>' +
      '</div>' +
      '</section>';
  }

  /* ================= weight trend ================= */
  function rangeWindow(a) {
    const today = U.todayKey();
    const r = RANGES.find(x => x.v === range) || RANGES[2];
    let from;
    if (r.days) from = U.addDays(today, -(r.days - 1));
    else {
      const first = a.series.length ? a.series[0].key : today;
      from = U.isValidKey(a.startK) && a.startK < first ? a.startK : first;
    }
    return { from, today, days: r.days || Math.max(7, U.diffDays(from, today) + 1) };
  }

  function weightCard(a, p) {
    const u = unitOf();
    const w = rangeWindow(a);
    const inRange = a.series.filter(d => d.key >= w.from);
    let title, sub;
    // takeaway title
    const g = M.units.n(a.goalKg).replace(/\.0$/, '');
    if (a.goalReached) title = 'Goal reached at ' + g + ' ' + u;
    else if (a.projKey) title = 'On pace for ' + g + ' ' + u + ' by ' + dateS(a.projKey);
    else if (a.series.length >= 2) title = M.units.abs(a.remaining) + ' ' + u + ' to go to ' + g + ' ' + u;
    else title = 'Your weight trend';
    // range sub
    const first = inRange[0], last = inRange[inRange.length - 1];
    if (first && last && first !== last) {
      const ch = last.trend - first.trend;
      const span = range === '1W' ? 'in the last 7 days' : range === '1M' ? 'in the last 30 days' : range === '3M' ? 'in the last 3 months' : 'since ' + U.fmtDateY(first.key);
      sub = M.units.signed(ch) + ' ' + u + ' ' + span;
      if (range === 'All' && a.scheduleDays != null && a.target) {
        sub += a.scheduleDays >= 7 ? ' · ' + weeksWord(a.scheduleDays) + ' ahead of plan' : a.scheduleDays <= -7 ? ' · ' + weeksWord(a.scheduleDays) + ' behind plan' : ' · right on plan';
      }
    } else if (a.series.length) sub = 'Not enough weigh-ins in this range yet';
    else sub = 'Weigh-ins and your 7-day trend appear here';

    const legend = a.series.length >= 2
      ? '<ul class="legend prog-legend" aria-label="Legend">' +
        '<li class="legend-item"><span class="dot prog-dot-weigh"></span><span>Weigh-ins</span></li>' +
        '<li class="legend-item"><span class="dot line prog-line-trend"></span><span>Trend</span></li>' +
        (a.projKey && range !== '1W' ? '<li class="legend-item"><span class="prog-dash proj"></span><span>Projected</span></li>' : '') +
        (range === 'All' || (a.projKey && range !== '1W') || Math.abs(disp(a.current) - disp(a.goalKg)) < (range === '1W' ? 4 : 12) ? '<li class="legend-item"><span class="prog-dash goal"></span><span>Goal</span></li>' : '') + '</ul>'
      : '';
    const body = a.series.length >= 2
      ? '<div class="prog-chart" data-chart="weight"></div>' + legend
      : '<div class="prog-chart-empty">' + M.icon('progress', 'lg') + '<p><b>' + (a.series.length ? 'One weigh-in down.' : 'No weigh-ins yet.') + '</b> Log on a couple more days and your trend line, goal line and projected finish date appear here.</p></div>';
    return '<section class="card prog-o2 prog-weight" aria-labelledby="prog-wt">' +
      '<div class="prog-card-head"><h2 id="prog-wt" class="chart-title">' + esc(title) + '</h2><p class="card-sub">' + esc(sub) + '</p></div>' +
      body + '</section>';
  }

  function drawWeight(el, a) {
    const host = el.querySelector('[data-chart="weight"]');
    if (!host) return;
    const u = unitOf();
    const w = rangeWindow(a);
    const series = a.series;
    const dots = [], line = [];
    series.forEach(d => {
      if (d.key < U.addDays(w.from, -7)) return;
      d.entries.forEach(e => dots.push({ key: d.key, y: disp(e.kg) }));
      line.push({ key: d.key, y: disp(d.trend) });
    });
    let projection = null, to = w.today;
    if (a.projKey && range !== '1W' && a.last) {
      projection = [{ key: a.last.key, y: disp(a.current) }, { key: a.projKey, y: disp(a.goalKg) }];
      const ahead = U.diffDays(w.today, a.projKey);
      const room = range === 'All' ? ahead : Math.round(w.days * 0.6);
      to = U.addDays(w.today, Math.max(0, Math.min(ahead, room)));
    }
    const showGoal = range === 'All' || !!projection || Math.abs(disp(a.current) - disp(a.goalKg)) < (range === '1W' ? 4 : 12);
    const byKey = {};
    series.forEach(d => { byKey[d.key] = d; });
    const vis = dots.concat(line).filter(p => p.key >= w.from).map(p => p.y).concat(showGoal ? [disp(a.goalKg)] : []);
    const spanY = vis.length ? Math.max.apply(null, vis) - Math.min.apply(null, vis) : 10;
    const yd = spanY < 6 ? 1 : 0;
    const c = M.charts.lineChart(host, {
      dots, line, projection,
      projectionLabel: projection && U.diffDays(w.today, a.projKey) <= U.diffDays(w.today, to) ? U.fmtDate(a.projKey) : '',
      goal: showGoal ? disp(a.goalKg) : null,
      goalLabel: 'Goal ' + M.units.n(a.goalKg, u === 'kg' ? 1 : 0) + ' ' + u,
      domain: { from: w.from, to },
      height: 248,
      yFmt: v => v.toFixed(yd),
      latestLabel: M.units.n(a.current),
      ariaLabel: 'Weight trend, ' + range + ': now ' + M.units.w(a.current) + ', goal ' + M.units.w(a.goalKg) + (a.projKey ? ', projected to reach it ' + dateS(a.projKey) : ''),
      tip: key => {
        const d = byKey[key];
        if (!d) return { title: U.relDay(key), rows: [] };
        const rows = [['Trend', M.units.w(d.trend)]];
        if (d.n > 1) { rows.push(['Average', M.units.w(d.avg)]); rows.push(['Range', M.units.n(d.min) + '–' + M.units.n(d.max)]); }
        else rows.push(['Weigh-in', M.units.w(d.avg)]);
        return { title: U.relDay(key), rows };
      }
    });
    charts.push(c);
  }

  /* ================= daily deficit ================= */
  function deficitDays() { return range === '1W' ? 7 : 30; }

  function deficitCard(da, a) {
    const dir = a.dir;
    const u = unitOf();
    const n = deficitDays();
    const anyFood = da.days.some(d => d.logged);
    if (!anyFood) {
      return '<section class="card prog-o3 prog-deficit" aria-labelledby="prog-df">' +
        '<div class="prog-card-head"><h2 id="prog-df" class="chart-title">Your daily deficit</h2><p class="card-sub">Calories burned minus calories eaten, day by day</p></div>' +
        '<div class="prog-chart-empty">' + M.icon('flame', 'lg') + '<p><b>Log what you eat to see it.</b> Each bar shows how far under your budget you stayed, and how much fat that adds up to.</p>' +
        '<button type="button" class="btn btn-tonal btn-sm" data-open-sheet="food">' + M.icon('plus', 'sm') + '<span class="btn-label">Add food</span></button></div>' +
        '</section>';
    }
    const target = da.today ? da.today.target : 0;
    const losing = target >= 0;
    let title;
    if (da.completedCount >= 1) title = (losing ? 'Under budget ' : 'On target ') + da.underCount + ' of ' + U.plural(da.completedCount, 'day');
    else title = 'Today so far: ' + U.int(Math.abs(da.today.deficit)) + ' kcal ' + (da.today.deficit >= 0 ? 'deficit' : 'surplus');
    const parts = [];
    if (da.completedCount >= 1) {
      if (da.total > 0) parts.push(U.int(da.total) + ' kcal ≈ ' + M.units.abs(da.expectedKg) + ' ' + u + ' of fat');
      else if (da.total < 0) parts.push(U.int(-da.total) + ' kcal surplus');
    }
    if (target > 0) parts.push('goal ' + U.int(target) + ' a day');
    const sub = (parts.length ? parts.join(' · ') : 'Last ' + n + ' days');

    // expected vs actual
    let compare = '';
    if (da.completedCount >= 3 && fin(da.actualKg)) {
      // deficit -> expected weight change (negative = loss). The scale spans all n days, so scale the average logged
      // day up to n days instead of comparing n days of weight with only the days that have food logged.
      const exp = fin(da.avg) ? -(da.avg * n / C.KCAL_PER_KG) : -da.expectedKg;
      const act = da.actualKg;
      const diff = act - exp;
      let note;
      if (Math.abs(diff) < 0.25) note = 'Your scale is tracking your food and activity log closely. That is a sign your logging is accurate.';
      else if (diff * dir > 0) note = 'The scale moved more than your ' + (losing ? 'deficit' : 'surplus') + ' explains. Part of that is water and food weight, so expect some of it to come back and even out.';
      else note = losing ? 'The scale is lagging your deficit. Water, salt and a heavier workout can hide fat loss for a week or two; the fat loss is still happening.' : 'The scale is lagging your surplus. Daily water swings can hide a gain for a week or two; keep eating to your target.';
      compare = '<div class="prog-compare">' +
        '<div class="prog-compare-grid">' +
        '<div class="prog-cmp"><p class="prog-cmp-l">Expected from ' + (losing ? 'deficit' : 'surplus') + (da.completedCount < n - 1 ? ', ' + da.completedCount + ' logged days' : '') + '</p><p class="prog-cmp-v">' + v(M.units.signed(exp), u) + '</p></div>' +
        '<div class="prog-cmp"><p class="prog-cmp-l">Scale trend, ' + n + ' days</p><p class="prog-cmp-v">' + v(M.units.signed(act), u) + '</p></div>' +
        '</div><p class="prog-cmp-note">' + M.icon('info', 'sm') + '<span>' + esc(note) + '</span></p></div>';
    }
    return '<section class="card prog-o3 prog-deficit" aria-labelledby="prog-df">' +
      '<div class="prog-card-head"><h2 id="prog-df" class="chart-title">' + esc(title) + '</h2><p class="card-sub">' + esc(sub) + '</p></div>' +
      '<div class="prog-chart" data-chart="deficit"></div>' +
      '<ul class="legend prog-legend" aria-label="Legend"><li class="legend-item"><span class="dot sq deficit"></span><span>Deficit</span></li><li class="legend-item"><span class="dot sq surplus"></span><span>Surplus</span></li>' +
      (target > 0 ? '<li class="legend-item"><span class="prog-dash ref"></span><span>Daily goal</span></li>' : '') + '</ul>' +
      compare + '</section>';
  }

  function drawDeficit(el, da) {
    const host = el.querySelector('[data-chart="deficit"]');
    if (!host) return;
    const n = da.days.length;
    const target = da.today ? da.today.target : 0;
    // keep the regular date labels clear of the "Today" label (the chart thins labels every k bars)
    const W = host.clientWidth || 320;
    const refPad = target > 0 && W >= 480 ? ('Goal ' + U.int(target)).length * 7 + 20 : 8;
    const slot = Math.max(1, (W - 8 - refPad) / n);
    const every = Math.max(1, Math.ceil(46 / slot));
    const bars = da.days.map((d, i) => ({
      key: d.key,
      label: d.partial ? 'Today' : (n > 7 && i > n - 1 - every) ? '' : n <= 7 ? U.fmtDate(d.key, { weekday: 'short' }) : U.fmtDate(d.key),
      value: d.logged ? d.deficit : 0,
      highlight: d.partial,
      muted: d.partial
    }));
    const c = M.charts.barChart(host, {
      bars, height: 200,
      ref: target > 0 ? { value: target, label: 'Goal ' + U.int(target) } : null,
      valueFmt: v => (v < 0 ? '−' : '') + U.int(Math.abs(v)),
      labels: n <= 7 ? 'all' : 'auto',
      ariaLabel: 'Daily calorie deficit, last ' + n + ' days. ' + da.days.filter(d => d.logged).map(d => U.fmtDate(d.key) + ' ' + U.int(d.deficit)).join(', '),
      tip: b => {
        const d = da.days.find(x => x.key === b.key);
        if (!d || !d.logged) return { title: U.relDay(b.key), rows: [['No food logged', '']] };
        return { title: U.relDay(d.key) + (d.partial ? ' (so far)' : ''), rows: [['Eaten', U.kcal(d.eaten)], ['Burned', U.kcal(d.burn)], [d.deficit >= 0 ? 'Deficit' : 'Surplus', U.kcal(Math.abs(d.deficit))], ['Budget', U.kcal(d.budget)]] };
      }
    });
    charts.push(c);
  }

  /* ================= stats ================= */
  function statsCard(a, da30, p) {
    const u = unitOf();
    const tiles = [];
    const toward = d => d * a.dir;
    if (a.series.length) {
      const tc = toward(a.totalChange);
      tiles.push({ label: a.dir < 0 ? 'Total lost' : 'Total gained', value: tc > 0 ? M.units.abs(a.totalChange) : '0.0', unit: u, cap: Math.round(a.progress * 100) + '% of your goal' });
    }
    if (fin(a.paceAll)) tiles.push({ label: 'Avg per week', value: M.units.signed(a.paceAll), unit: u, cap: fin(a.pace4) ? 'Last 4 wks ' + M.units.signed(a.pace4) : 'Since ' + dateS(a.startK) });
    if (fin(da30.avg) && da30.gain) tiles.push({ label: da30.avg <= 0 ? 'Avg daily surplus' : 'Avg daily deficit', value: U.int(Math.abs(da30.avg)), unit: 'kcal', cap: da30.today && da30.today.target < 0 ? 'Goal +' + U.int(-da30.today.target) : 'Last 30 days', tone: da30.today && da30.today.target < 0 && -da30.avg >= -da30.today.target ? 'good' : '' });
    else if (fin(da30.avg)) tiles.push({ label: 'Avg daily deficit', value: U.int(da30.avg), unit: 'kcal', cap: da30.today && da30.today.target > 0 ? 'Goal ' + U.int(da30.today.target) : 'Last 30 days', tone: da30.today && da30.today.target > 0 && da30.avg >= da30.today.target ? 'good' : '' });
    if (a.goalReached) tiles.push({ label: 'Goal', value: 'Reached', unit: '', cap: 'Nice work', tone: 'good' });
    else if (a.projKey) {
      let cap = 'At your 4-week pace', tone = '';
      if (a.scheduleDays != null) { if (a.scheduleDays >= 7) { cap = weeksWord(a.scheduleDays) + ' early'; tone = 'good'; } else if (a.scheduleDays <= -7) { cap = weeksWord(a.scheduleDays) + ' late'; tone = 'warn'; } else cap = 'Right on time'; }
      tiles.push({ label: 'Goal ETA', value: U.fmtDate(a.projKey), unit: a.projKey.slice(0, 4) !== U.todayKey().slice(0, 4) ? a.projKey.slice(0, 4) : '', cap, tone });
    }
    if (a.series.length) tiles.push({ label: 'Logging streak', value: String(a.streak), unit: a.streak === 1 ? 'day' : 'days', cap: a.longest > a.streak ? 'Best ' + a.longest + ' days' : a.streak >= 3 ? 'Your best yet' : 'Log daily to build it' });
    if (da30.completedCount >= 2) tiles.push({ label: da30.gain ? 'On target' : 'Under budget', value: da30.underCount + '/' + da30.completedCount, unit: 'days', cap: 'Last 30 days' });
    if (a.bestWeek && a.dataWeeks.length >= 2) tiles.push({ label: 'Best week', value: M.units.signed(a.bestWeek.change), unit: u, cap: 'Week of ' + U.fmtDate(a.bestWeek.start) });
    if (a.extreme && a.series.length >= 3) tiles.push({ label: a.dir < 0 ? 'Lowest' : 'Highest', value: M.units.n(a.extreme.kg), unit: u, cap: U.relDay(U.keyOf(a.extreme.t)) });
    // BMI entry point (links to #bmi) — added by the BMI builder
    const bmiV = M.calc.bmi ? M.calc.bmi(M.data.currentKg(), +p.heightCm) : null, bmiC = bmiV != null && M.calc.bmiCategory ? M.calc.bmiCategory(Math.round(bmiV * 10) / 10) : null;   // classify the shown value
    if (fin(bmiV) && bmiC) tiles.push({ label: 'BMI', value: bmiV.toFixed(1), unit: '', cap: bmiC.label, href: '#bmi', cat: bmiC.key });
    if (tiles.length < 2) return '';
    return '<section class="section prog-o4 prog-stats" aria-labelledby="prog-st">' +
      '<h2 id="prog-st" class="sr-only">Your stats</h2>' +
      '<div class="grid-stats prog-stat-grid">' + tiles.map(t => t.href
        ? '<a class="stat bmi-stat-link" href="' + t.href + '" aria-label="BMI ' + esc(t.value) + ', ' + esc(t.cap) + '. See BMI details"><p class="stat-label"><span>' + esc(t.label) + '</span>' + M.icon('chevron', 'sm') + '</p>' +
          '<p class="stat-value">' + esc(t.value) + '</p><p class="stat-sub"><span class="bmi-stat-cat bmi-k-' + t.cat + '"><span class="bmi-pill-dot" aria-hidden="true"></span>' + esc(t.cap) + '</span></p></a>'
        : '<div class="stat"><p class="stat-label"><span>' + esc(t.label) + '</span></p>' +
        '<p class="stat-value">' + esc(t.value) + (t.unit ? '<span class="unit">' + esc(t.unit) + '</span>' : '') + '</p>' +
        '<p class="stat-sub' + (t.tone ? ' ' + t.tone : '') + '">' + esc(t.cap) + '</p></div>').join('') +
      '</div></section>';
  }

  /* ================= weekly change ================= */
  function weeklyList(a) { return a.dataWeeks.slice(-13); }
  function weeklyCard(a) {
    const u = unitOf();
    const wk = weeklyList(a);
    if (wk.length < 2) {
      return '<section class="card prog-o5 prog-weekly" aria-labelledby="prog-wc">' +
        '<div class="prog-card-head"><h2 id="prog-wc" class="chart-title">Week by week</h2><p class="card-sub">Your weekly change shows up after two weeks of weigh-ins</p></div>' +
        '<div class="prog-weeks-ghost" aria-hidden="true">' + [40, 62, 30, 55, 48, 70, 36].map(h => '<span style="height:' + h + '%"></span>').join('') + '</div>' +
        '</section>';
    }
    const done = wk.filter(w => !w.partial);
    const toward = done.filter(w => a.toward(w.change) > 0.01).length;
    const title = (a.dir < 0 ? 'Down ' : 'Up ') + toward + ' of the last ' + U.plural(done.length, 'week');
    const best = a.bestWeek && wk.includes(a.bestWeek) ? (a.bestWeek === a.lastWeek ? 'best week was last week' : 'best week was ' + U.fmtDate(a.bestWeek.start)) : '';
    const sub = 'Weekly change in ' + u + (best ? ' · ' + best : '');
    return '<section class="card prog-o5 prog-weekly" aria-labelledby="prog-wc">' +
      '<div class="prog-card-head"><h2 id="prog-wc" class="chart-title">' + esc(title) + '</h2><p class="card-sub">' + esc(sub) + '</p></div>' +
      '<div class="prog-chart" data-chart="weekly"></div></section>';
  }
  function drawWeekly(el, a) {
    const host = el.querySelector('[data-chart="weekly"]');
    if (!host) return;
    const u = unitOf();
    const wk = weeklyList(a);
    const bars = wk.map(w => ({
      key: w.start,
      label: w.partial ? 'This wk' : U.fmtDate(w.start),
      value: +disp(w.change).toFixed(2),
      muted: w.partial
    }));
    const good = 'var(--d-deficit)', bad = 'var(--d-surplus)';
    const c = M.charts.barChart(host, {
      bars, height: 180,
      posColor: a.dir < 0 ? bad : good, negColor: a.dir < 0 ? good : bad,
      valueFmt: v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1),
      labels: 'auto',
      ariaLabel: 'Weekly weight change: ' + wk.map(w => U.fmtDate(w.start) + ' ' + M.units.signed(w.change) + ' ' + u).join(', '),
      tip: (b, i) => { const w = wk[i]; return { title: 'Week of ' + U.fmtDate(w.start) + (w.partial ? ' (so far)' : ''), rows: [['Change', M.units.signed(w.change) + ' ' + u]].concat(w === a.bestWeek ? [['Best week', '']] : []) }; }
    });
    charts.push(c);
  }

  /* ================= patterns ================= */
  function weekdayPattern(a) {
    // average distance of each day's weight from its trend, grouped by weekday
    const groups = {};
    a.series.forEach(d => {
      if (!fin(d.trend)) return;
      const wd = U.fromKey(d.key).getDay();
      (groups[wd] = groups[wd] || []).push(d.avg - d.trend);
    });
    const ok = Object.keys(groups).filter(k => groups[k].length >= 2);
    if (a.series.length < 14 || ok.length < 4) return null;
    let best = null;
    ok.forEach(k => { const m = U.mean(groups[k]); if (!best || m * a.dir > best.m * a.dir) best = { wd: +k, m }; });
    if (!best || Math.abs(best.m) < 0.05) return null;
    return best;
  }
  function patternsCard(a) {
    const u = unitOf();
    const rows = [];
    if (a.morningVsEvening) {
      const d = a.morningVsEvening.diff;
      rows.push({ icon: 'sun', tone: 'amber', title: d > 0 ? 'Evenings run ' + M.units.abs(d) + ' ' + u + ' heavier' : 'Mornings run ' + M.units.abs(d) + ' ' + u + ' heavier', sub: 'Across ' + a.morningVsEvening.days + ' days with both. Weigh in each morning for the fairest read.' });
    }
    if (a.swing) {
      rows.push({ icon: 'activity', tone: 'teal', title: 'Your weight swings ' + M.units.abs(a.swing.avg) + ' ' + u + ' within a day', sub: 'That is food and water, not fat. The biggest swing was ' + M.units.abs(a.swing.max) + ' ' + u + '.' });
    }
    const wd = weekdayPattern(a);
    if (wd) {
      const name = U.fmtDate(U.addDays('2026-11-01', wd.wd), { weekday: 'long' }); // 2026-11-01 is a Sunday
      rows.push({ icon: 'calendar', tone: 'brand', title: name + 's are your lightest day', sub: 'On average ' + M.units.abs(wd.m) + ' ' + u + ' ' + (wd.m < 0 ? 'under' : 'over') + ' your trend. Weekends usually show the opposite.' });
    }
    if (!rows.length) {
      if (a.series.length < 3) return '';
      return '<section class="card flat prog-o6 prog-patterns" aria-labelledby="prog-pt">' +
        '<div class="prog-card-head"><h2 id="prog-pt" class="card-title">Patterns</h2></div>' +
        '<p class="prog-pt-teaser">' + M.icon('sparkle', 'sm') + '<span>Weigh in morning and evening on a few days and we will show your daily swing, morning-vs-evening gap and lightest weekday here.</span></p></section>';
    }
    return '<section class="card prog-o6 prog-patterns" aria-labelledby="prog-pt">' +
      '<div class="prog-card-head"><h2 id="prog-pt" class="card-title">Patterns in your weigh-ins</h2></div>' +
      '<ul class="prog-pt-list">' + rows.map(r =>
        '<li class="prog-pt"><span class="ic-bubble sm ' + r.tone + '">' + M.icon(r.icon) + '</span><div class="prog-pt-text"><p class="prog-pt-title">' + esc(r.title) + '</p><p class="prog-pt-sub">' + esc(r.sub) + '</p></div></li>').join('') +
      '</ul></section>';
  }

  /* ================= milestones ================= */
  function msSub(m, u) {
    if (m.earned) return m.date ? U.fmtDateY(m.date) : 'Earned';
    if (m.kind === 's') return U.plural(Math.max(1, m.toGo), 'day') + ' to go';
    return M.units.abs(m.toGo) + ' ' + u + ' to go';
  }
  function milestonesCard(a) {
    const u = unitOf();
    const ms = a.milestones;
    const all = ms.weight.concat(ms.streaks);
    if (!all.length) return '';
    let list;
    if (showAllMs) list = all;
    else {
      const nextS0 = ms.streaks.filter(m => !m.earned).length ? 1 : 0;
      const nextW0 = ms.weight.filter(m => !m.earned).slice(0, 2);
      const earned = all.filter(m => m.earned).sort((x, y) => (y.date || '').localeCompare(x.date || '')).slice(0, Math.max(1, 4 - nextS0 - nextW0.length)).reverse();
      const nextW = nextW0.slice(0, 4 - nextS0 - earned.length);
      const nextS = ms.streaks.filter(m => !m.earned).slice(0, 1);
      list = earned.concat(nextW, nextS);
      if (list.length < 4) list = list.concat(all.filter(m => !list.includes(m)).slice(0, 4 - list.length));
      list = list.slice(0, 4);
    }
    const nx = ms.next;
    const earnedN = all.filter(m => m.earned).length;
    const head = '<div class="prog-ms-head"><div class="prog-ms-ht"><h2 id="prog-ms" class="section-title">Milestones</h2>' +
      '<p class="section-sub">' + esc(earnedN ? earnedN + ' of ' + all.length + ' earned' : 'Your first one is close') + '</p></div>' +
      (nx && !a.goalReached ? '<span class="badge brand prog-ms-next">' + M.icon('flag') + '<span>Next: ' + esc(nx.title) + '</span></span>' : '') + '</div>';
    const items = list.map(m => {
      const isNext = nx && m === nx;
      let frac = 0;
      if (!m.earned && m.kind === 'w' && fin(m.targetKg)) {
        const span = Math.abs(m.targetKg - a.startKg);
        frac = span > 0 ? U.clamp(1 - m.toGo / span, 0, 1) : 0;
      } else if (!m.earned && m.kind === 's') frac = U.clamp(a.streak / m.n, 0, 1);
      return '<li class="prog-ms' + (m.earned ? ' is-earned' : '') + (isNext ? ' is-next' : '') + '">' +
        '<span class="prog-ms-badge" aria-hidden="true">' + M.icon(m.earned ? (m.isGoal ? 'trophy' : m.kind === 's' ? 'bolt' : 'trophy') : m.isGoal ? 'target' : m.kind === 's' ? 'bolt' : 'flag') + '</span>' +
        '<span class="prog-ms-name">' + esc(m.title) + '</span>' +
        '<span class="prog-ms-sub">' + esc(msSub(m, u)) + '</span>' +
        (!m.earned ? '<span class="prog-ms-bar" aria-hidden="true"><span style="width:' + (frac * 100).toFixed(0) + '%"></span></span>' : '') +
        '<span class="sr-only">' + (m.earned ? 'Earned' : 'Not yet earned') + '</span></li>';
    }).join('');
    const more = all.length > list.length || showAllMs
      ? '<div class="prog-ms-more"><button type="button" class="link-btn" data-act="ms-toggle" aria-expanded="' + showAllMs + '">' + (showAllMs ? 'Show fewer' : 'See all ' + all.length + ' milestones') + '</button></div>'
      : '';
    return '<section class="card prog-o7 prog-milestones" aria-labelledby="prog-ms">' + head + '<ul class="prog-ms-grid">' + items + '</ul>' + more + '</section>';
  }

  /* ================= render ================= */
  function rangeSeg() {
    return '<div class="seg prog-range" role="group" aria-label="Chart range">' +
      RANGES.map(r => '<button type="button" class="seg-btn" data-range="' + r.v + '" aria-pressed="' + (r.v === range) + '">' + r.label + '</button>').join('') + '</div>';
  }

  M.views.progress = {
    title: 'Progress',
    narrow: false,
    render(el) {
      killCharts();
      const p = M.state.profile || {};
      const a = M.data.analysis();
      const n = deficitDays();
      const da = M.data.deficits(n);
      const da30 = n === 30 ? da : M.data.deficits(30);
      el.innerHTML = '<div class="view prog-view">' +
        '<header class="page-head prog-head"><div class="ph-text"><h1>Progress</h1></div><div class="ph-actions">' + rangeSeg() + '</div></header>' +
        '<div class="prog-layout">' +
        '<div class="prog-col prog-col-main">' + heroCard(a, p) + weightCard(a, p) + deficitCard(da, a) + weeklyCard(a) + '</div>' +
        '<div class="prog-col prog-col-side">' + statsCard(a, da30, p) + patternsCard(a) + milestonesCard(a) + '</div>' +
        '</div></div>';
      drawWeight(el, a);
      drawDeficit(el, da);
      drawWeekly(el, a);
      if (bound !== el) {
        bound = el;
        el.addEventListener('click', e => {
          if (!e.target.closest('.prog-view')) return;
          const r = e.target.closest('[data-range]');
          if (r) { if (range !== r.dataset.range) { range = r.dataset.range; M.render(); } return; }
          const t = e.target.closest('[data-act="ms-toggle"]');
          if (t) { showAllMs = !showAllMs; M.render(); }
        });
      }
    },
    destroy() { killCharts(); }
  };
})();
