/* Momentum v2 — FOOD view (#food) + Add food / Edit food sheets.
   Owner: food builder. Registers M.views.food, M.sheets.food (alias M.sheets.addFood), M.sheets.foodItem.
   Styles: css/food.css (every class prefixed .food-). */
(function () {
  'use strict';
  const M = window.M, U = M.util, ui = M.ui;
  const esc = U.esc;

  /* ================= helpers ================= */
  const MEAL_IDS = ['breakfast', 'lunch', 'dinner', 'snacks'];
  const MEAL_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' };
  const MEAL_ICON = { breakfast: 'sun', lunch: 'food', dinner: 'moon', snacks: 'sparkle' };
  const MEAL_TIME = { breakfast: '08:00', lunch: '12:30', dinner: '19:00', snacks: '15:30' };
  /* share of the remaining budget a still-empty meal typically takes */
  const MEAL_SHARE = { breakfast: 0.25, lunch: 0.35, dinner: 0.3, snacks: 0.1 };
  const fin = v => typeof v === 'number' && isFinite(v);
  const r5 = v => Math.max(0, Math.round(v / 5) * 5);
  const mealLabel = m => MEAL_LABEL[m] || 'Snacks';
  const mealLower = m => mealLabel(m).toLowerCase();

  function cssVar(name) {
    try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || ''; } catch (e) { return ''; }
  }
  function validDate(k) { return U.isValidKey(k) && k <= U.todayKey() ? k : U.todayKey(); }
  /** default timestamp for a new item on a day+meal */
  function defaultT(key, meal) {
    if (key === U.todayKey()) return Date.now();
    return U.timeOn(key, MEAL_TIME[meal] || '12:00');
  }
  function mealSelect(id, value) {
    return '<select class="select food-meal-select" id="' + id + '">' +
      MEAL_IDS.map(m => '<option value="' + m + '"' + (m === value ? ' selected' : '') + '>' + MEAL_LABEL[m] + '</option>').join('') + '</select>';
  }
  function kcalVal(n, cls) { return '<span class="food-kv' + (cls ? ' ' + cls : '') + '"><span class="food-kv-n">' + U.int(n) + '</span><span class="food-kv-u">kcal</span></span>'; }

  /* ---- portion parsing / scaling ("4 oz" × 1.5 -> "6 oz") ---- */
  const FRAC = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };
  const NO_PLURAL = /^(oz|g|kg|mg|ml|l|lb|lbs|tbsp|tsp|fl|fl oz|cl|dl|kcal|in|cm|x)$/i;
  function parsePortion(s) {
    s = String(s || '').trim();
    if (!s) return null;
    let m = s.match(/^(\d+)\s*\/\s*(\d+)\s*(.*)$/);
    if (m && +m[2]) return mk(+m[1] / +m[2], m[3]);
    m = s.match(/^(\d+(?:[.,]\d+)?)?\s*([¼½¾⅓⅔])?\s*(.*)$/);
    if (!m || (!m[1] && !m[2])) return null;
    const rest = m[3] || '';
    if (/^[-–—/~]/.test(rest)) return null;          // ranges like "2-3 slices"
    const q = (m[1] ? parseFloat(m[1].replace(',', '.')) : 0) + (m[2] ? FRAC[m[2]] : 0);
    return q > 0 ? mk(q, rest) : null;
    function mk(q, unit) {
      unit = String(unit || '').trim();
      // singularise the unit word so we can re-pluralise after scaling
      const w = unit.split(/\s+/);
      if (q > 1 && w.length && /^[a-z]+$/i.test(w[0]) && !NO_PLURAL.test(w[0])) {
        if (/(ches|shes|sses|xes)$/i.test(w[0])) w[0] = w[0].slice(0, -2);
        else if (/[^s]s$/i.test(w[0])) w[0] = w[0].slice(0, -1);
      }
      return { q, unit: w.join(' ') };
    }
  }
  function fmtQty(v) {
    if (!fin(v) || v <= 0) return '0';
    if (v >= 10) return String(Math.round(v));
    const r = Math.round(v * 4) / 4;
    if (Math.abs(r - v) < 0.02) {
      const whole = Math.floor(r + 1e-9), frac = Math.round((r - whole) * 100) / 100;
      const f = frac === 0.25 ? '¼' : frac === 0.5 ? '½' : frac === 0.75 ? '¾' : '';
      return (whole ? String(whole) : '') + f || '0';
    }
    return String(Math.round(v * 10) / 10);
  }
  function scaledPortion(portion, f) {
    const p = parsePortion(portion);
    if (!p) return f === 1 ? (portion || '1 serving') : fmtQty(f) + ' × ' + (portion || 'serving');
    const q = p.q * f;
    let unit = p.unit;
    const w = unit.split(/\s+/);
    if (q > 1 && w[0] && /^[a-z]+$/i.test(w[0]) && !NO_PLURAL.test(w[0]) && !/s$/i.test(w[0])) {
      w[0] = /(ch|sh|ss|x)$/i.test(w[0]) ? w[0] + 'es' : w[0] + 's';
      unit = w.join(' ');
    }
    return (fmtQty(q) + ' ' + unit).trim();
  }
  const stepFor = (f, dir) => (dir > 0 ? (f >= 1 ? 0.5 : 0.25) : (f > 1 ? 0.5 : 0.25));
  /** next portion factor: steps the visible quantity (½ cup -> ¾ cup), or the multiplier when the portion has no number */
  function nextFactor(it, dir) {
    const p = parsePortion(it.portion);
    if (!p) return dir > 0 ? Math.min(20, Math.round((it.f + stepFor(it.f, 1)) * 100) / 100) : Math.max(0.25, Math.round((it.f - stepFor(it.f, -1)) * 100) / 100);
    const q = p.q * it.f;
    let step, min;
    if (p.q >= 20) { step = Math.max(5, Math.round(p.q * 0.25 / 5) * 5); min = step; }
    else { step = dir > 0 ? (q < 1 ? 0.25 : q < 3 ? 0.5 : 1) : (q <= 1 ? 0.25 : q <= 3 ? 0.5 : 1); min = 0.25; }
    let nq = dir > 0 ? q + step : q - step;
    nq = Math.round(nq / (p.q >= 20 ? 5 : 0.25)) * (p.q >= 20 ? 5 : 0.25);
    if (nq < min - 1e-9) return it.f;
    return Math.min(20, nq / p.q);
  }
  function atMinFactor(it) { return nextFactor(it, -1) === it.f; }

  /* ================= FOOD VIEW ================= */
  let viewDate = null;   // last selected day (module-level so re-renders keep it)
  let weekChart = null;

  function foodSub(f) {
    const parts = [];
    if (f.items && f.items.length > 1) parts.push(U.plural(f.items.length, 'item'));
    else if (f.items && f.items[0] && f.items[0].portion) parts.push(f.items[0].portion);
    if (fin(f.t)) parts.push(U.fmtTime(f.t));
    return parts.join(' · ');
  }
  function foodRow(f) {
    const art = f.thumb
      ? '<img class="row-thumb food-thumb" src="' + esc(f.thumb) + '" alt="">'
      : '<span class="row-thumb food-thumb food-thumb-ic" aria-hidden="true">' + M.icon(f.source === 'photo' ? 'camera' : f.source === 'text' ? 'text' : 'food') + '</span>';
    const tag = f.source === 'photo' ? '<span class="badge brand food-src">' + M.icon('camera') + 'From photo</span>'
      : f.source === 'text' ? '<span class="badge food-src">' + M.icon('text') + 'Described</span>' : '';
    const sub = foodSub(f);
    return '<button type="button" class="food-item" data-food-id="' + esc(f.id) + '" aria-label="Edit ' + esc(f.name) + ', ' + U.int(f.kcal) + ' kcal">' + art +
      '<span class="food-item-main"><span class="food-item-name">' + esc(f.name) + '</span>' +
      ((sub || tag) ? '<span class="food-item-meta">' + (sub ? '<span class="food-item-sub">' + esc(sub) + '</span>' : '') + tag + '</span>' : '') + '</span>' +
      '<span class="food-item-kcal">' + U.int(f.kcal) + '</span></button>';
  }

  /** remaining-budget hint per still-empty meal */
  function mealHints(byMeal, left) {
    const empty = MEAL_IDS.filter(m => !byMeal[m].length);
    const shareSum = empty.reduce((s, m) => s + MEAL_SHARE[m], 0) || 1;
    const out = {};
    empty.forEach(m => { out[m] = left > 0 ? r5(left * MEAL_SHARE[m] / shareSum) : 0; });
    return out;
  }

  function heroHTML(b, key, isToday) {
    const hasBudget = fin(b.budget) && b.budget > 0;
    const left = fin(b.left) ? b.left : 0;
    const gain = !!b.gain;                       // gain goal: the budget is a minimum to reach
    const over = hasBudget && left < 0 && !gain;
    const dayWord = isToday ? 'today' : 'on ' + U.relDay(key);
    let over_ = '', num = '', unit = '';
    if (!hasBudget) { over_ = 'Eaten ' + dayWord; num = U.int(b.eaten); unit = 'kcal'; }
    else if (gain) {
      if (left <= 0) { over_ = 'Target reached ' + dayWord; num = U.int(-left); unit = 'kcal above target'; }
      else { over_ = isToday ? 'Left to eat today' : 'Short of target ' + dayWord; num = U.int(left); unit = isToday ? 'kcal to go' : 'kcal short'; }
    }
    else if (over) { over_ = 'Over budget ' + dayWord; num = U.int(-left); unit = 'kcal over'; }
    else if (isToday) { over_ = 'Left to eat today'; num = U.int(left); unit = 'kcal left'; }
    else { over_ = 'Under budget ' + dayWord; num = U.int(left); unit = 'kcal under'; }

    const frac = hasBudget ? U.clamp(b.eaten / b.budget, 0, 1) : 0;
    let h = '<section class="card hero food-hero' + (over ? ' is-over' : '') + '" aria-label="Calorie budget">';
    h += '<div class="food-hero-top"><p class="t-over">' + esc(over_) + '</p>' +
      '<p class="food-hero-num"><span class="food-hero-n">' + num + '</span><span class="food-hero-u">' + esc(unit) + '</span></p></div>';
    if (hasBudget) {
      h += '<div class="food-hero-bar">' + ui.progress(over ? 1 : frac, over ? 'amber' : null, 'Calories eaten of daily budget') +
        '<div class="food-hero-meta"><span class="nowrap"><b>' + U.int(b.eaten) + '</b> eaten</span><span class="nowrap">of <b>' + U.int(b.budget) + '</b> ' + (gain ? 'target' : 'budget') + '</span></div></div>';
      const burnWord = isToday ? 'expected burn' : 'burned';
      if (fin(b.burnExpected) && fin(b.targetDeficit)) {
        const tgt = b.targetDeficit;
        h += '<p class="food-hero-why">' + M.icon('info', 'sm') + '<span>' + U.int(b.burnExpected) + ' ' + burnWord +
          (tgt > 0 ? ' − ' + U.int(tgt) + ' deficit goal' : tgt < 0 ? ' + ' + U.int(-tgt) + ' surplus goal' : '') + (b.belowFloor ? ' = ' + U.int(b.rawBudget) + ', raised to the <b class="nowrap">' + U.int(b.budget) + ' kcal</b> safe minimum' : ' = <b class="nowrap">' + U.int(b.budget) + ' kcal</b> budget') + '</span></p>';
      }
    }
    const hasMacros = (b.protein || 0) + (b.carbs || 0) + (b.fat || 0) > 0;
    if (hasMacros) {
      h += '<dl class="food-macros">' + [['Protein', b.protein], ['Carbs', b.carbs], ['Fat', b.fat]].map(x =>
        '<div class="food-macro"><dt>' + x[0] + '</dt><dd><span class="food-macro-n">' + U.int(x[1] || 0) + '</span><span class="food-macro-u">g</span></dd></div>').join('') + '</dl>';
    }
    if (over && isToday) {
      const eq = M.calc.equivalents(-left, b.kg);
      if (eq && fin(eq.treadmillMin) && eq.treadmillMin > 0) {
        h += '<div class="notice warn food-hero-note">' + M.icon('flame') + '<div>A <b class="nowrap">' + U.minutes(eq.treadmillMin) + '</b> treadmill walk (' + (M.units.unit === 'kg' ? '5.6 km/h' : '3.5 mph') + ', 5% incline) burns the extra ' + U.int(-left) + ' kcal' +
          (eq.treadmillMin > 60 ? '. Big days happen: easing off a little over the next few days evens it out.' : fin(eq.steps) && eq.steps > 0 ? ', or about <b class="nowrap">' + U.int(Math.round(eq.steps / 100) * 100) + '</b> extra steps.' : '.') + '</div></div>';
      }
    }
    if (b.belowFloor && isToday) {
      h += '<div class="notice warn food-hero-note">' + M.icon('alert') + '<div>Your plan needs more than food alone today: eating under ' + U.int(b.budgetFloor) + ' kcal isn’t safe, so the rest has to come from moving more. <a href="#plan">Pick a gentler pace</a>.</div></div>';
    }
    return h + '</section>';
  }

  function actionsHTML(st) {
    if (st.available === false) {
      return '<div class="food-actions single"><button type="button" class="btn btn-primary btn-block" data-add="manual">' + M.icon('plus') + '<span class="btn-label">Add food</span></button>' +
        '<p class="food-ai-off">' + M.icon('info', 'sm') + '<span>' + esc(M.ai.UNAVAILABLE_TEXT) + ' For now, enter calories yourself.</span></p></div>';
    }
    if (st.images === false && st.available) {
      return '<div class="food-actions"><button type="button" class="btn btn-primary" data-add="describe">' + M.icon('text') + '<span class="btn-label">Describe it</span></button>' +
        '<button type="button" class="btn btn-outline food-btn-alt" data-add="manual">' + M.icon('form') + '<span class="btn-label">Enter manually</span></button></div>';
    }
    return '<div class="food-actions"><button type="button" class="btn btn-primary" data-add="photo">' + M.icon('camera') + '<span class="btn-label">Snap a photo</span></button>' +
      '<button type="button" class="btn btn-outline food-btn-alt" data-add="describe">' + M.icon('text') + '<span class="btn-label">Describe it</span></button></div>';
  }

  function mealCard(m, list, hint, ctx) {
    const sub = list.reduce((s, f) => s + (f.kcal || 0), 0);
    const id = 'food-m-' + m;
    let h = '<section class="card food-meal" aria-labelledby="' + id + '"><div class="food-meal-head"><h2 id="' + id + '" class="food-meal-title">' + mealLabel(m) + '</h2>';
    if (list.length) h += kcalVal(sub) + '</div><div class="food-items">' + list.map(foodRow).join('') + '</div>' +
      '<button type="button" class="link-btn food-add-more" data-add-meal="' + m + '">' + M.icon('plus', 'sm') + 'Add to ' + mealLower(m) + '</button>';
    else {
      h += '<span class="food-meal-none">' + (ctx.isToday ? 'Not logged yet' : 'Nothing logged') + '</span></div>';
      if (ctx.isToday && ctx.hasBudget) {
        const line = hint > 0 ? esc(mealLabel(m) + ' budget: ') + '<span class="nowrap">about ' + U.int(hint) + ' kcal</span>' : esc('You’ve used today’s budget');
        const why = hint > 0
          ? (ctx.target > 0 ? 'Stay at or under it to keep today’s ' + U.int(ctx.target) + ' kcal deficit.' : 'That keeps you on plan for today.')
          : 'If you’re hungry, pick something light — a broth soup or veg is under 100 kcal.';
        h += '<div class="food-meal-empty"><span class="food-meal-empty-ic" aria-hidden="true">' + M.icon(MEAL_ICON[m]) + '</span><div class="food-meal-empty-text"><p class="food-meal-empty-title">' + line + '</p><p class="food-meal-empty-sub">' + esc(why) + '</p></div></div>';
      }
      h += '<button type="button" class="link-btn food-add-more" data-add-meal="' + m + '">' + M.icon('plus', 'sm') + 'Add ' + mealLower(m) + '</button>';
    }
    return h + '</section>';
  }

  function firstRunHTML(b, isToday, key) {
    const hasBudget = fin(b.budget) && b.budget > 0;
    let h = '<section class="card food-first" aria-labelledby="food-first-t">' +
      '<div class="food-first-head"><span class="food-first-art" aria-hidden="true">' + M.icon('food', 'lg') + '</span><div class="food-first-text">' +
      '<h2 id="food-first-t" class="food-first-title">' + (isToday ? 'Log your first meal of the day' : 'Nothing logged on ' + esc(U.relDay(key))) + '</h2>' +
      '<p class="food-first-body">' + (M.ai.state.available === false
        ? 'Enter a name and calories. Adding protein, carbs and fat is optional.'
        : 'Snap a photo or describe it in plain words. You’ll see an estimate of the calories and macros, and you can change anything before it’s saved.') + '</p></div></div>';
    if (hasBudget && isToday) {
      const hints = mealHints({ breakfast: [], lunch: [], dinner: [], snacks: [] }, b.left);
      h += '<div class="food-first-guide"><p class="t-over">A simple way to split ' + U.int(b.budget) + ' kcal</p><div class="food-guide">' +
        MEAL_IDS.map(m => '<button type="button" class="food-guide-row" data-add-meal="' + m + '"><span class="food-guide-ic" aria-hidden="true">' + M.icon(MEAL_ICON[m], 'sm') + '</span><span class="food-guide-name">' + mealLabel(m) + '</span><span class="food-guide-kcal">about <b>' + U.int(hints[m]) + '</b></span>' + M.icon('plus', 'sm') + '</button>').join('') +
        '</div></div>';
    }
    return h + '</section>';
  }

  function recentHTML(recent) {
    if (!recent.length) return '';
    return '<section class="section food-recent" aria-labelledby="food-recent-t"><div class="section-head"><div class="sh-text"><h2 class="food-sec-title" id="food-recent-t">Recent</h2></div><div class="sh-action"><span class="food-sec-hint">Tap to add again</span></div></div>' +
      '<div class="food-recent-row">' + recent.map((f, i) =>
        '<button type="button" class="food-chip" data-recent="' + i + '" aria-label="Add ' + esc(f.name) + ', ' + U.int(f.kcal) + ' kcal">' + M.icon('plus', 'sm') + '<span class="food-chip-name">' + esc(f.name) + '</span><span class="food-chip-kcal">' + U.int(f.kcal) + '</span></button>').join('') +
      '</div></section>';
  }

  function weekData() {
    const da = M.data.deficits(7);
    if (!da || !Array.isArray(da.days)) return null;
    const logged = da.days.filter(d => d.logged);
    if (logged.length < 2) return null;
    return da;
  }

  M.views.food = {
    title: 'Food',
    narrow: false,
    render(el, ctx) {
      if (weekChart) { try { weekChart.destroy(); } catch (e) {} weekChart = null; }
      const today = U.todayKey();
      const key = validDate((ctx && ctx.params && ctx.params.date) || viewDate || today);
      viewDate = key;
      const isToday = key === today;
      const b = M.data.balance(key);
      const day = M.store.getDay(key);
      const foods = (day.foods || []).slice().sort((a, b2) => a.t - b2.t);
      const byMeal = { breakfast: [], lunch: [], dinner: [], snacks: [] };
      foods.forEach(f => (byMeal[f.meal] || byMeal.snacks).push(f));
      const hasBudget = fin(b.budget) && b.budget > 0;
      const hints = mealHints(byMeal, b.left);
      const recent = M.store.recentFoods(8);
      const aiSt = M.ai.state || {};
      const week = weekData();

      const dateLabel = U.relDay(key);
      const switcher = '<div class="food-date" role="group" aria-label="Choose day">' +
        '<button type="button" class="btn-icon food-date-btn" data-day="-1" aria-label="Previous day">' + M.icon('back') + '</button>' +
        '<label class="food-date-label"><span>' + esc(dateLabel) + '</span><input type="date" class="food-date-input" max="' + today + '" value="' + key + '" aria-label="Pick a date"></label>' +
        '<button type="button" class="btn-icon food-date-btn" data-day="1" aria-label="Next day"' + (isToday ? ' disabled' : '') + '>' + M.icon('chevron') + '</button></div>';

      const head = '<header class="page-head food-head"><div class="ph-text"><p class="ph-over">' + esc(U.fmtDate(key, { weekday: 'long', month: 'short', day: 'numeric' })) + '</p><h1>Food</h1></div><div class="ph-actions">' + switcher + '</div></header>';

      const mealsHTML = foods.length
        ? MEAL_IDS.map(m => mealCard(m, byMeal[m], hints[m], { isToday, hasBudget, target: b.targetDeficit })).join('')
        : firstRunHTML(b, isToday, key);

      let weekHTML = '';
      if (week) {
        const comp = week.completedCount;
        const title = comp >= 1 ? (week.gain ? 'Hit your calorie target ' : 'Under budget ') + week.underCount + ' of the last ' + U.plural(comp, 'day') : 'Your eating this week';
        const sub = comp >= 1 && fin(week.total) ? (week.total >= 0 ? U.int(week.total) + ' kcal saved' + (week.total >= 1000 ? ' ≈ ' + M.units.abs(week.total / M.calc.KCAL_PER_KG) + ' ' + M.units.unit + ' of fat' : '') : U.int(-week.total) + ' kcal over in total') : 'Each bar is what you ate that day';
        weekHTML = '<section class="card food-week" aria-labelledby="food-week-t"><div class="card-head"><div class="ch-text"><h2 class="chart-title" id="food-week-t">' + esc(title) + '</h2><p class="card-sub">' + esc(sub) + '</p></div></div>' +
          '<div class="food-week-chart"></div>' + (week.gain ? '' : '<div class="legend"><span class="legend-item"><span class="dot eaten sq"></span>Within that day’s budget</span><span class="legend-item"><span class="dot surplus sq"></span>Over budget</span></div>') + '</section>';
      }

      el.innerHTML = '<div class="view food-view">' + head +
        '<div class="food-layout"><div class="food-side">' + heroHTML(b, key, isToday) + actionsHTML(aiSt) + recentHTML(recent) + weekHTML + '</div>' +
        '<div class="food-main"><div class="food-meals">' + mealsHTML + '</div></div></div></div>';

      // 7-day eaten chart
      if (week) {
        const host = el.querySelector('.food-week-chart');
        const eatenC = cssVar('--d-eaten') || 'currentColor', overC = cssVar('--d-surplus') || 'currentColor';
        if (host) weekChart = M.charts.barChart(host, {
          height: 190,
          bars: week.days.map(d => ({
            label: d.key === today ? 'Today' : U.fmtDate(d.key, { weekday: 'short' }),
            value: d.logged ? d.eaten : 0,
            color: d.logged && !week.gain && d.eaten > d.budget ? overC : eatenC,
            muted: d.partial, highlight: d.key === key
          })),
          valueFmt: U.int, labels: 'auto',
          ariaLabel: 'Calories eaten each of the last 7 days',
          tip: (bar, i) => {
            const d = week.days[i];
            if (!d.logged) return { title: U.fmtDate(d.key, { weekday: 'short', month: 'short', day: 'numeric' }), rows: [['Eaten', 'Not logged']] };
            const diff = d.budget - d.eaten;
            return { title: U.fmtDate(d.key, { weekday: 'short', month: 'short', day: 'numeric' }) + (d.partial ? ' (so far)' : ''), rows: [['Eaten', U.kcal(d.eaten)], ['Budget', U.kcal(d.budget)], [diff >= 0 ? 'Under' : 'Over', U.kcal(Math.abs(diff))]] };
          }
        });
      }

      /* ---- events ---- */
      el.onclick = function (e) {
        const t = e.target;
        const dayBtn = t.closest('[data-day]');
        if (dayBtn && !dayBtn.disabled) {
          const k = U.addDays(key, +dayBtn.dataset.day);
          if (k > today) return;
          viewDate = k; M.go('food', k === today ? null : { date: k }); return;
        }
        const add = t.closest('[data-add]');
        if (add) { openAdd({ date: key, mode: add.dataset.add }); return; }
        const addMeal = t.closest('[data-add-meal]');
        if (addMeal) { openAdd({ date: key, meal: addMeal.dataset.addMeal }); return; }
        const item = t.closest('[data-food-id]');
        if (item) { openEdit({ id: item.dataset.foodId }); return; }
        const rec = t.closest('[data-recent]');
        if (rec) { reAdd(recent[+rec.dataset.recent], key); return; }
      };
      const dateInput = el.querySelector('.food-date-input');
      if (dateInput) {
        dateInput.addEventListener('change', () => {
          const k = dateInput.value;
          if (!U.isValidKey(k)) return;
          const kk = k > today ? today : k;
          viewDate = kk; M.go('food', kk === today ? null : { date: kk });
        });
        const lab = el.querySelector('.food-date-label');
        lab.addEventListener('click', e => { if (e.target === dateInput) return; e.preventDefault(); try { dateInput.showPicker(); } catch (er) { dateInput.focus(); } });
      }
    },
    destroy() { if (weekChart) { try { weekChart.destroy(); } catch (e) {} weekChart = null; } }
  };

  function reAdd(f, key) {
    if (!f) return;
    const isToday = key === U.todayKey();
    const meal = isToday ? U.mealForTime(Date.now()) : f.meal;
    const item = M.store.addItem('foods', {
      t: defaultT(key, meal), meal, name: f.name, kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat,
      items: f.items || [], source: f.source, thumb: f.thumb
    });
    if (item) ui.toast('Added ' + f.name + ' to ' + mealLower(meal), { action: { label: 'Undo', fn: () => M.store.removeItem('foods', item.id) } });
  }

  /* ================= ADD FOOD SHEET ================= */
  function openAdd(opts) {
    opts = opts || {};
    const date = validDate(opts.date || U.todayKey());
    const aiSt = M.ai.state || {};
    const aiOff = () => (M.ai.state || {}).available === false;
    const imgOff = () => aiOff() || (M.ai.state || {}).images === false;
    let mode = opts.mode === 'text' ? 'describe' : opts.mode;
    if (!['photo', 'describe', 'manual'].includes(mode)) mode = aiSt.available === false ? 'manual' : aiSt.images === false ? 'describe' : 'photo';
    if (mode === 'photo' && imgOff()) mode = aiOff() ? 'manual' : 'describe';
    if (mode === 'describe' && aiOff()) mode = 'manual';

    const S = {
      mode, phase: 'input',                 // input | busy | review | error
      meal: MEAL_IDS.includes(opts.meal) ? opts.meal : U.mealForTime(date === U.todayKey() ? Date.now() : U.timeOn(date, '12:30')),
      text: '', file: null, preview: '', thumb: null, thumbP: null,
      ctl: null, review: null, error: '', found: [], manual: { name: '', kcal: '', protein: '', carbs: '', fat: '' }
    };
    if (!opts.meal && date !== U.todayKey()) S.meal = 'lunch';

    const sheet = ui.sheet({
      title: 'Add food', sub: date === U.todayKey() ? '' : 'For ' + U.relDay(date),
      body: '', foot: null,
      onClose() { abort(); if (S.preview) { try { URL.revokeObjectURL(S.preview); } catch (e) {} } }
    });
    sheet.el.classList.add('food-sheet');

    function abort() { if (S.ctl) { try { S.ctl.abort(); } catch (e) {} S.ctl = null; } }

    /* ---------- drawing ---------- */
    function tabsHTML() {
      const tabs = [['photo', 'Photo', imgOff()], ['describe', 'Describe', aiOff()], ['manual', 'Manual', false]];
      return '<div class="seg block lg food-tabs" role="group" aria-label="How to add">' + tabs.map(t =>
        '<button type="button" class="seg-btn" data-mode="' + t[0] + '" aria-pressed="' + (S.mode === t[0]) + '"' + (t[2] ? ' disabled aria-disabled="true"' : '') + '>' + t[1] + '</button>').join('') + '</div>';
    }
    function aiNotice() {
      if (aiOff()) return '<div class="notice brand">' + M.icon('info') + '<div>' + esc(M.ai.UNAVAILABLE_TEXT) + ' You can still add food by hand below.</div></div>';
      if (S.mode !== 'manual' && imgOff() && S.mode === 'describe' && (M.ai.state || {}).images === false) return '<div class="notice">' + M.icon('info') + '<div>Photos can’t be analysed here, but describing your meal works just as well.</div></div>';
      return '';
    }
    function mealRow(id) {
      return '<div class="food-meal-row"><label class="label" for="' + id + '">Add to</label>' + mealSelect(id, S.meal) + '</div>';
    }

    function draw(focusSel) {
      let body = tabsHTML() + aiNotice();
      let foot = null;
      if (S.phase === 'busy') {
        body += busyHTML();
        foot = ui.frag('<button type="button" class="btn btn-secondary btn-block" data-act="stop">Stop</button>');
      } else if (S.phase === 'review') {
        body += reviewHTML();
        const tot = reviewTotal();
        const n = S.review.items.length;
        foot = ui.frag('<button type="button" class="btn btn-primary btn-block" data-act="save-review"' + (n ? '' : ' disabled') + '>' + (n ? 'Add ' + U.int(tot.kcal) + ' kcal' : 'Nothing to add') + '</button>');
      } else if (S.phase === 'error') {
        body += '<div class="food-pane">' + (S.preview ? '<img class="thumb-img food-preview" src="' + esc(S.preview) + '" alt="Your photo">' : '') +
          '<div class="notice warn">' + M.icon('alert') + '<div>' + esc(S.error || 'That didn’t work. Try again.') + '</div></div>' +
          '<div class="food-err-actions"><button type="button" class="btn btn-tonal" data-act="retry">' + M.icon('sync', 'sm') + 'Try again</button><button type="button" class="btn btn-ghost" data-mode="manual">Enter it manually</button></div></div>';
      } else if (S.mode === 'photo') {
        body += photoInputHTML();
      } else if (S.mode === 'describe') {
        body += describeHTML();
        foot = ui.frag('<button type="button" class="btn btn-primary btn-block" data-act="estimate">' + M.icon('sparkle') + '<span class="btn-label">Estimate calories</span></button>');
      } else {
        body += manualHTML();
        foot = ui.frag('<button type="button" class="btn btn-primary btn-block" data-act="save-manual">Add food</button>');
      }
      sheet.setBody('<div class="food-sheet-body">' + body + '</div>');
      sheet.setFoot(foot);
      bindInputs();
      if (focusSel) { const f = sheet.el.querySelector(focusSel); if (f) try { f.focus({ preventScroll: true }); } catch (e) {} }
    }

    function photoInputHTML() {
      return '<div class="food-pane">' +
        '<button type="button" class="dropzone food-drop" data-act="camera"><span class="food-drop-ic" aria-hidden="true">' + M.icon('camera', 'lg') + '</span>' +
        '<span class="food-drop-title">Take a photo of your meal</span><span class="food-drop-sub">I’ll spot each item and estimate its calories. You review everything before it’s saved.</span></button>' +
        '<button type="button" class="btn btn-outline btn-block" data-act="library">' + M.icon('image') + '<span class="btn-label">Choose from your photos</span></button>' +
        '<p class="food-tip">' + M.icon('info', 'sm') + '<span>Tip: shoot from above in good light. A nutrition label works too.</span></p></div>';
    }
    function describeHTML() {
      return '<div class="food-pane"><div class="field"><label class="label" for="food-desc">What did you eat?</label>' +
        '<p class="hint">Plain words are fine. Amounts help: “a handful”, “2 tbsp”, “large”.</p>' +
        '<textarea class="textarea food-desc" id="food-desc" rows="5" maxlength="2000" placeholder="2 eggs scrambled with butter, a slice of sourdough toast and a black coffee">' + esc(S.text) + '</textarea>' +
        '<p class="error-text" id="food-desc-err" hidden></p></div>' + mealRow('food-meal-d') +
        '<p class="food-caption">You’ll review every item before it’s saved.</p></div>';
    }
    function manualHTML() {
      const m = S.manual;
      return '<form class="form food-pane food-manual" novalidate onsubmit="return false">' +
        ui.field({ id: 'food-m-name', label: 'Food name', input: '<input class="input" id="food-m-name" type="text" maxlength="160" autocomplete="off" placeholder="e.g. Turkey sandwich" value="' + esc(m.name) + '">' }) +
        ui.field({ id: 'food-m-kcal', label: 'Calories', input: '<div class="input-wrap"><input class="input num-input" id="food-m-kcal" type="text" inputmode="numeric" autocomplete="off" placeholder="0" value="' + esc(m.kcal) + '"><span class="suffix">kcal</span></div>' }) +
        '<fieldset class="food-macro-fields"><legend class="label">Macros <span class="opt">(optional)</span></legend><div class="food-macro-grid">' +
        [['protein', 'Protein'], ['carbs', 'Carbs'], ['fat', 'Fat']].map(x =>
          '<div class="field"><label class="food-mini-label" for="food-m-' + x[0] + '">' + x[1] + '</label><div class="input-wrap food-g"><input class="input num-input" id="food-m-' + x[0] + '" type="text" inputmode="decimal" autocomplete="off" placeholder="0" value="' + esc(m[x[0]]) + '"><span class="suffix">g</span></div></div>').join('') +
        '</div></fieldset>' + mealRow('food-meal-m') + '</form>';
    }
    function busyHTML() {
      const isPhoto = S.mode === 'photo';
      return '<div class="food-pane food-busy" aria-live="polite">' +
        (isPhoto && S.preview ? '<div class="food-preview-wrap"><img class="thumb-img food-preview" src="' + esc(S.preview) + '" alt="Your photo"><div class="food-scan" aria-hidden="true"></div></div>' : '') +
        (!isPhoto && S.text ? '<blockquote class="food-quote">' + esc(S.text) + '</blockquote>' : '') +
        '<div class="thinking"><span class="spinner" aria-hidden="true"></span><div class="food-think-text"><p>' + (isPhoto ? 'Analysing your photo…' : 'Working out the calories…') + '</p>' +
        '<p class="food-found">' + (S.found.length ? 'Found ' + esc(S.found.slice(0, 4).join(', ')) + (S.found.length > 4 ? ' and more' : '') : 'This usually takes 5–30 seconds.') + '</p></div></div></div>';
    }

    /* ---------- review ---------- */
    function itemTotals(it) {
      const f = it.f;
      return { kcal: Math.round(it.base.kcal * f), protein: fin(it.base.protein) ? it.base.protein * f : null, carbs: fin(it.base.carbs) ? it.base.carbs * f : null, fat: fin(it.base.fat) ? it.base.fat * f : null };
    }
    function reviewTotal() {
      const t = { kcal: 0, protein: 0, carbs: 0, fat: 0, hasMacros: false };
      (S.review ? S.review.items : []).forEach(it => {
        const x = itemTotals(it); t.kcal += x.kcal;
        ['protein', 'carbs', 'fat'].forEach(k => { if (x[k] != null) { t[k] += x[k]; t.hasMacros = true; } });
      });
      return t;
    }
    function reviewHTML() {
      const R = S.review;
      const tot = reviewTotal();
      const low = R.confidence === 'low';
      const art = S.thumb || S.preview
        ? '<img class="food-rev-img" src="' + esc(S.thumb || S.preview) + '" alt="Your photo">'
        : '<span class="food-rev-img food-rev-ic" aria-hidden="true">' + M.icon(R.source === 'photo' ? 'camera' : 'text', 'lg') + '</span>';
      let h = '<div class="food-pane food-review"><div class="food-rev-head">' + art + '<div class="food-rev-text">' +
        '<h3 class="food-rev-title">' + (R.items.length ? (R.source === 'photo' ? 'Here’s what I see' : 'Here’s my estimate') : 'Nothing found') + '</h3>' +
        '<label class="sr-only" for="food-rev-name">Meal name</label><input class="food-rev-name" id="food-rev-name" type="text" maxlength="160" value="' + esc(R.name) + '" placeholder="Name this meal">' +
        '<p class="food-rev-conf' + (low ? ' low' : '') + '">' + M.icon('alert', 'xs') + '<span>' + (low ? 'Rough estimate. Check the portions.' : 'Estimates. Adjust the portions if needed.') + '</span></p></div></div>';
      if (R.note) h += '<p class="food-rev-note">' + esc(R.note) + '</p>';
      if (R.items.length) {
        h += '<ul class="food-rev-list" aria-label="Detected items">' + R.items.map((it, i) => {
          const x = itemTotals(it);
          const atMin = atMinFactor(it);
          if (it.editing) {
            return '<li class="food-rev-item editing"><div class="food-rev-edit">' +
              '<div class="field"><label class="food-mini-label" for="food-ri-n' + i + '">Item</label><input class="input" id="food-ri-n' + i + '" data-ri-name="' + i + '" type="text" maxlength="120" value="' + esc(it.name) + '"></div>' +
              '<div class="food-rev-edit-row"><div class="field"><label class="food-mini-label" for="food-ri-p' + i + '">Portion</label><input class="input" id="food-ri-p' + i + '" data-ri-portion="' + i + '" type="text" maxlength="80" value="' + esc(scaledPortion(it.portion, it.f)) + '"></div>' +
              '<div class="field"><label class="food-mini-label" for="food-ri-k' + i + '">Calories</label><div class="input-wrap"><input class="input num-input" id="food-ri-k' + i + '" data-ri-kcal="' + i + '" type="text" inputmode="numeric" value="' + x.kcal + '"><span class="suffix">kcal</span></div></div></div>' +
              '<button type="button" class="btn btn-tonal btn-sm food-ri-done" data-ri-done="' + i + '">' + M.icon('check', 'sm') + 'Done</button></div></li>';
          }
          return '<li class="food-rev-item"><div class="food-rev-line"><button type="button" class="food-rev-name-btn" data-ri-edit="' + i + '" aria-label="Edit ' + esc(it.name) + '"><span class="food-rev-iname">' + esc(it.name) + '</span>' + M.icon('edit', 'xs') + '</button>' + kcalVal(x.kcal) + '</div>' +
            '<div class="food-rev-ctrl"><div class="food-stepper" role="group" aria-label="' + esc(it.name) + ' portion">' +
            '<button type="button" class="food-step" data-ri-less="' + i + '" aria-label="Less ' + esc(it.name) + '"' + (atMin ? ' disabled' : '') + '>' + M.icon('minus') + '</button>' +
            '<span class="food-step-val" aria-live="polite">' + esc(scaledPortion(it.portion, it.f)) + '</span>' +
            '<button type="button" class="food-step" data-ri-more="' + i + '" aria-label="More ' + esc(it.name) + '">' + M.icon('plus') + '</button></div>' +
            '<button type="button" class="btn-icon food-ri-remove" data-ri-remove="' + i + '" aria-label="Remove ' + esc(it.name) + '">' + M.icon('trash') + '</button></div></li>';
        }).join('') + '</ul>';
      } else if (R.removed && R.removed.length) {
        h += '<p class="food-rev-emptytxt">Everything was removed.</p>';
      } else {
        h += '<div class="notice">' + M.icon('info') + '<div>I couldn’t find any food here. Add the items yourself, or try another ' + (R.source === 'photo' ? 'photo' : 'description') + '.</div></div>';
      }
      if (R.removed && R.removed.length) {
        const last = R.removed[R.removed.length - 1];
        h += '<div class="food-rev-removed" role="status"><span>' + (R.removed.length === 1 ? 'Removed ' + esc(last.name || 'item') : 'Removed ' + R.removed.length + ' items') + '</span><button type="button" class="link-btn" data-act="restore">Undo</button></div>';
      }
      h += '<button type="button" class="link-btn food-rev-additem" data-act="add-item">' + M.icon('plus', 'sm') + 'Add an item</button>';
      h += '<div class="food-rev-total"><span class="food-rev-total-l">Total</span><span class="food-rev-total-r">' + kcalVal(tot.kcal, 'lg') +
        (tot.hasMacros ? '<span class="food-rev-macros">P ' + Math.round(tot.protein) + ' g · C ' + Math.round(tot.carbs) + ' g · F ' + Math.round(tot.fat) + ' g</span>' : '') + '</span></div>';
      h += mealRow('food-meal-r');
      h += '<button type="button" class="link-btn food-startover" data-act="startover">' + M.icon('sync', 'sm') + (R.source === 'photo' ? 'Use a different photo' : 'Change the description') + '</button>';
      return h + '</div>';
    }

    /* ---------- input bindings (inputs keep state without full redraws) ---------- */
    function bindInputs() {
      const b = sheet.body;
      ui.$$('.food-meal-select', b).forEach(s => s.addEventListener('change', () => { S.meal = s.value; }));
      const ta = ui.$('#food-desc', b);
      if (ta) {
        ta.addEventListener('input', () => { S.text = ta.value; ui.fieldError(ta, ''); });
        ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); estimateText(); } });
      }
      ['name', 'kcal', 'protein', 'carbs', 'fat'].forEach(k => {
        const inp = ui.$('#food-m-' + k, b);
        if (inp) inp.addEventListener('input', () => { S.manual[k] = inp.value; if (k === 'name' || k === 'kcal') ui.fieldError(inp, ''); });
      });
      const nm = ui.$('#food-rev-name', b);
      if (nm) nm.addEventListener('input', () => { S.review.name = nm.value; });
      ui.$$('[data-ri-name]', b).forEach(inp => inp.addEventListener('input', () => { S.review.items[+inp.dataset.riName].name = inp.value; }));
      ui.$$('[data-ri-portion]', b).forEach(inp => inp.addEventListener('input', () => { const it = S.review.items[+inp.dataset.riPortion]; it.portion = inp.value; it._portionEdited = true; }));
      ui.$$('[data-ri-kcal]', b).forEach(inp => inp.addEventListener('input', () => {
        const it = S.review.items[+inp.dataset.riKcal]; const v = U.parseNum(inp.value);
        if (fin(v) && v >= 0) { const k = it.f || 1; const ratio = it.base.kcal > 0 ? v / (it.base.kcal * k) : null; it.base.kcal = v / k; if (ratio != null) ['protein', 'carbs', 'fat'].forEach(m => { if (fin(it.base[m])) it.base[m] *= ratio; }); updateFoot(); }
      }));
      const ripEnter = e => { if (e.key === 'Enter') { e.preventDefault(); const i = e.target.closest('[data-ri-name],[data-ri-portion],[data-ri-kcal]'); if (i) finishEdit(); } };
      ui.$$('.food-rev-edit input', b).forEach(i => i.addEventListener('keydown', ripEnter));
      const drop = ui.$('.food-drop', b);
      if (drop) {
        drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
        drop.addEventListener('dragleave', () => drop.classList.remove('over'));
        drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f && /^image\//.test(f.type)) analysePhoto(f); });
      }
      const form = ui.$('.food-manual', b);
      if (form) form.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); saveManual(); } });
    }
    function updateFoot() {
      const btn = sheet.foot.querySelector('[data-act="save-review"]');
      if (btn) { const t = reviewTotal(); btn.textContent = S.review.items.length ? 'Add ' + U.int(t.kcal) + ' kcal' : 'Nothing to add'; }
    }
    function finishEdit() {
      if (!S.review) return;
      S.review.items.forEach(it => {
        if (!it.editing) return;
        it.editing = false;
        if (!String(it.name || '').trim()) it.name = 'Item';
        if (it._portionEdited) { it.base.kcal = it.base.kcal * it.f; ['protein', 'carbs', 'fat'].forEach(m => { if (fin(it.base[m])) it.base[m] *= it.f; }); it.f = 1; it._portionEdited = false; }
      });
    }

    /* ---------- AI calls ---------- */
    function onText(txt) {
      const names = [];
      String(txt || '').replace(/"name"\s*:\s*"([^"]{1,60})"/g, (m, n) => { names.push(n); return m; });
      const items = names.slice(1);   // first "name" is the meal title
      if (items.length !== S.found.length && S.phase === 'busy') {
        S.found = items;
        const p = sheet.body.querySelector('.food-found');
        if (p) p.textContent = 'Found ' + items.slice(0, 4).join(', ') + (items.length > 4 ? ' and more' : '');
      }
    }
    async function run(kind) {
      abort();
      const ctl = new AbortController(); S.ctl = ctl;
      S.phase = 'busy'; S.found = []; S.error = '';
      draw('[data-act="stop"]');
      try {
        const r = kind === 'photo'
          ? await M.ai.analyzeFoodPhoto(S.file, { signal: ctl.signal, onText })
          : await M.ai.analyzeFoodText(S.text, { signal: ctl.signal, onText });
        if (S.ctl !== ctl || sheet.closed) return;
        S.ctl = null;
        S.review = {
          source: kind === 'photo' ? 'photo' : 'text', name: r && r.name ? r.name : '', confidence: (r && r.confidence) || 'medium', note: (r && r.note) || '',
          items: ((r && r.items) || []).map(it => ({ name: it.name || 'Item', portion: it.portion || '', f: 1, base: { kcal: fin(it.kcal) ? it.kcal : 0, protein: it.protein, carbs: it.carbs, fat: it.fat } })),
          removed: []
        };
        S.phase = 'review';
        draw('.food-rev-title');
      } catch (e) {
        if (S.ctl !== ctl || sheet.closed) return;
        S.ctl = null;
        const code = e && e.code;
        if (code === 'cancelled' || (e && e.name === 'AbortError')) { S.phase = 'input'; draw(); return; }
        if (M.ai.isFatal && M.ai.isFatal(code)) {
          S.phase = 'input'; S.mode = 'manual'; draw('#food-m-name');
          ui.toast((e && e.message) || M.ai.UNAVAILABLE_TEXT);
          return;
        }
        if (code === 'images_unavailable') { S.phase = 'input'; S.mode = 'describe'; draw('#food-desc'); ui.toast(e.message); return; }
        S.phase = 'error'; S.error = (e && e.message) || 'Something went wrong. Try again.';
        draw('[data-act="retry"]');
      }
    }
    async function analysePhoto(file) {
      if (!file) return;
      if (S.preview) { try { URL.revokeObjectURL(S.preview); } catch (e) {} }
      S.file = file; S.preview = ui.previewURL(file); S.thumb = null;
      S.thumbP = ui.thumb(file, 160).then(u => { S.thumb = u; return u; }).catch(() => null);
      run('photo');
    }
    function estimateText() {
      const ta = ui.$('#food-desc', sheet.body);
      if (!String(S.text || '').trim() || S.text.trim().length < 2) { if (ta) { ui.fieldError(ta, 'Describe what you ate first.'); ta.focus(); } return; }
      run('text');
    }

    /* ---------- saving ---------- */
    function finish(item, dateKey) {
      if (!item) { ui.toast('That couldn’t be saved. Check the numbers and try again.'); return; }
      sheet.close();
      ui.toast('Added ' + U.int(item.kcal) + ' kcal to ' + mealLower(item.meal), { action: { label: 'Undo', fn: () => M.store.removeItem('foods', item.id) } });
      const route = (location.hash || '').replace(/^#\/?/, '').split('?')[0];
      if (route === 'food' && dateKey !== viewDate) M.go('food', dateKey === U.todayKey() ? null : { date: dateKey });
    }
    async function saveReview() {
      finishEdit();
      const R = S.review; if (!R || !R.items.length) return;
      const tot = reviewTotal();
      const items = R.items.map(it => ({ name: String(it.name || 'Item').trim() || 'Item', portion: scaledPortion(it.portion, it.f), kcal: Math.round(it.base.kcal * it.f) }));
      let thumb = S.thumb;
      if (!thumb && S.thumbP) { try { thumb = await Promise.race([S.thumbP, new Promise(r => setTimeout(() => r(null), 1500))]); } catch (e) { thumb = null; } }
      const name = String(R.name || '').trim() || (items.length === 1 ? items[0].name : items.slice(0, 2).map(i => i.name).join(' & '));
      const rec = { t: defaultT(date, S.meal), meal: S.meal, name, kcal: Math.round(tot.kcal), items, source: R.source };
      if (tot.hasMacros) { rec.protein = Math.round(tot.protein); rec.carbs = Math.round(tot.carbs); rec.fat = Math.round(tot.fat); }
      if (thumb && R.source === 'photo') rec.thumb = thumb;
      if (R.note) rec.note = R.note;
      finish(M.store.addItem('foods', rec), date);
    }
    function saveManual() {
      const b = sheet.body;
      const nameEl = ui.$('#food-m-name', b), kEl = ui.$('#food-m-kcal', b);
      const name = String(S.manual.name || '').trim();
      const kcal = U.parseNum(S.manual.kcal);
      let bad = false;
      if (!name) { ui.fieldError(nameEl, 'Give it a name, like “Turkey sandwich”.'); bad = true; }
      if (!fin(kcal) || kcal < 0 || kcal > 10000) { ui.fieldError(kEl, 'Enter calories between 0 and 10,000.'); bad = true; }
      if (bad) { (name ? kEl : nameEl).focus(); return; }
      const rec = { t: defaultT(date, S.meal), meal: S.meal, name, kcal: Math.round(kcal), items: [], source: 'manual' };
      ['protein', 'carbs', 'fat'].forEach(k => { const v = U.parseNum(S.manual[k]); if (fin(v) && v >= 0) rec[k] = v; });
      finish(M.store.addItem('foods', rec), date);
    }

    /* ---------- one delegated click handler for the whole sheet ---------- */
    sheet.el.addEventListener('click', async e => {
      const t = e.target;
      const modeBtn = t.closest('[data-mode]');
      if (modeBtn && !modeBtn.disabled) {
        const m = modeBtn.dataset.mode;
        if (m === S.mode && S.phase === 'input') return;
        abort(); S.mode = m; S.phase = 'input'; S.review = null;
        draw('[data-mode="' + m + '"]'); return;
      }
      const a = t.closest('[data-act]');
      if (a) {
        const act = a.dataset.act;
        if (act === 'camera' || act === 'library') {
          const files = await ui.pickFiles(act === 'camera' ? { accept: 'image/*', capture: 'environment' } : { accept: 'image/*' });
          if (files && files[0] && !sheet.closed) analysePhoto(files[0]);
        } else if (act === 'stop') { abort(); S.phase = 'input'; draw(); }
        else if (act === 'estimate') estimateText();
        else if (act === 'retry') { S.mode === 'photo' && S.file ? run('photo') : S.mode === 'describe' ? run('text') : (S.phase = 'input', draw()); }
        else if (act === 'save-manual') saveManual();
        else if (act === 'save-review') saveReview();
        else if (act === 'restore') { S.review.removed.slice().reverse().forEach(g => S.review.items.splice(Math.min(g._at || 0, S.review.items.length), 0, g)); S.review.removed = []; draw('[data-act="save-review"]'); }
        else if (act === 'add-item') {
          finishEdit();
          S.review.items.push({ name: '', portion: '1 serving', f: 1, base: { kcal: 0, protein: null, carbs: null, fat: null }, editing: true });
          draw('#food-ri-n' + (S.review.items.length - 1));
        } else if (act === 'startover') { S.phase = 'input'; S.review = null; draw(S.mode === 'describe' ? '#food-desc' : '.food-drop'); }
        return;
      }
      const ri = k => { const el = t.closest('[data-ri-' + k + ']'); return el ? +el.getAttribute('data-ri-' + k) : -1; };
      let i;
      if ((i = ri('less')) >= 0) { const it = S.review.items[i]; it.f = nextFactor(it, -1); draw('[data-ri-less="' + i + '"]:not([disabled]), [data-ri-more="' + i + '"]'); }
      else if ((i = ri('more')) >= 0) { const it = S.review.items[i]; it.f = nextFactor(it, 1); draw('[data-ri-more="' + i + '"]'); }
      else if ((i = ri('remove')) >= 0) {
        const gone = S.review.items.splice(i, 1)[0]; S.review.removed.push(gone);
        gone._at = i;
        draw('[data-act="restore"]');
      }
      else if ((i = ri('edit')) >= 0) { finishEdit(); S.review.items[i].editing = true; draw('#food-ri-k' + i); }
      else if ((i = ri('done')) >= 0) { finishEdit(); draw('[data-ri-edit="' + i + '"]'); }
    });

    draw(S.mode === 'describe' ? '#food-desc' : S.mode === 'manual' ? '#food-m-name' : '.food-drop');

    // availability may still be loading: redraw tabs/notice once known
    if (M.ai.state.available == null && M.ai.ready && M.ai.ready.then) {
      M.ai.ready.then(() => {
        if (sheet.closed || S.phase !== 'input') return;
        if (S.mode === 'photo' && imgOff()) S.mode = aiOff() ? 'manual' : 'describe';
        if (S.mode === 'describe' && aiOff()) S.mode = 'manual';
        draw();
      }).catch(() => {});
    }
    return sheet;
  }

  /* ================= EDIT FOOD SHEET ================= */
  function openEdit(opts) {
    const found = M.store.findItem('foods', opts && opts.id);
    if (!found) { ui.toast('That item no longer exists.'); return; }
    const f = found.item, key = found.key;
    const orig = { kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat };
    let factor = 1;
    const numStr = v => fin(v) ? String(Math.round(v * 10) / 10) : '';
    const thumb = f.thumb ? '<img class="food-rev-img" src="' + esc(f.thumb) + '" alt="">' : '<span class="food-rev-img food-rev-ic" aria-hidden="true">' + M.icon(f.source === 'photo' ? 'camera' : f.source === 'text' ? 'text' : 'food', 'lg') + '</span>';
    const srcTxt = f.source === 'photo' ? 'Estimated from a photo' : f.source === 'text' ? 'Estimated from your description' : 'Entered by hand';
    const items = (f.items || []).filter(it => it && it.name);
    const body = '<div class="food-sheet-body"><div class="food-rev-head">' + thumb + '<div class="food-rev-text"><p class="food-edit-src">' + esc(srcTxt) + '</p><p class="food-edit-when">' + esc(U.relDay(key) + ' · ' + U.fmtTime(f.t)) + '</p></div></div>' +
      (items.length > 1 || (items.length === 1 && items[0].name !== f.name) ? '<div class="food-edit-items"><p class="t-over">Includes</p><ul>' + items.map(it => '<li><span class="food-ei-name">' + esc(it.name) + (it.portion ? ' <span class="muted">· ' + esc(it.portion) + '</span>' : '') + '</span><span class="food-ei-k">' + U.int(it.kcal) + '</span></li>').join('') + '</ul></div>' : '') +
      '<form class="form food-manual" novalidate onsubmit="return false">' +
      ui.field({ id: 'food-e-name', label: 'Name', input: '<input class="input" id="food-e-name" type="text" maxlength="160" value="' + esc(f.name) + '">' }) +
      (orig.kcal > 0 ? '<div class="field"><span class="label" id="food-e-por-l">Portion</span><div class="chips food-por" role="group" aria-labelledby="food-e-por-l">' + [0.5, 0.75, 1, 1.5, 2].map(x => '<button type="button" class="chip tap" data-factor="' + x + '" aria-pressed="' + (x === 1) + '">' + fmtQty(x) + '×</button>').join('') + '</div><p class="hint">Scales the calories and macros below.</p></div>' : '') +
      ui.field({ id: 'food-e-kcal', label: 'Calories', input: '<div class="input-wrap"><input class="input num-input" id="food-e-kcal" type="text" inputmode="numeric" value="' + numStr(f.kcal) + '"><span class="suffix">kcal</span></div>' }) +
      '<fieldset class="food-macro-fields"><legend class="label">Macros <span class="opt">(optional)</span></legend><div class="food-macro-grid">' +
      [['protein', 'Protein'], ['carbs', 'Carbs'], ['fat', 'Fat']].map(x => '<div class="field"><label class="food-mini-label" for="food-e-' + x[0] + '">' + x[1] + '</label><div class="input-wrap food-g"><input class="input num-input" id="food-e-' + x[0] + '" type="text" inputmode="decimal" placeholder="0" value="' + numStr(f[x[0]]) + '"><span class="suffix">g</span></div></div>').join('') +
      '</div></fieldset>' +
      '<div class="food-edit-row"><div class="field"><label class="label" for="food-e-meal">Meal</label>' + mealSelect('food-e-meal', f.meal) + '</div>' +
      '<div class="field"><label class="label" for="food-e-time">Time</label><input class="input" id="food-e-time" type="time" value="' + U.hhmm(f.t) + '"></div></div>' +
      '</form></div>';
    const foot = ui.frag('<div><button type="button" class="btn btn-danger food-del" data-act="delete">' + M.icon('trash', 'sm') + '<span class="btn-label">Delete</span></button><button type="button" class="btn btn-primary" data-act="save">Save changes</button></div>');
    const sheet = ui.sheet({ title: 'Edit food', body, foot, initialFocus: '#food-e-name' });
    sheet.el.classList.add('food-sheet');
    const $ = s => sheet.el.querySelector(s);

    sheet.el.addEventListener('click', async e => {
      const fb = e.target.closest('[data-factor]');
      if (fb) {
        factor = +fb.dataset.factor;
        ui.$$('[data-factor]', sheet.el).forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.factor === factor)));
        $('#food-e-kcal').value = String(Math.round(orig.kcal * factor));
        ['protein', 'carbs', 'fat'].forEach(k => { if (fin(orig[k])) $('#food-e-' + k).value = numStr(orig[k] * factor); });
        return;
      }
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'delete') {
        const undo = M.store.removeItem('foods', f.id);
        sheet.close();
        ui.toast('Deleted ' + f.name, { action: { label: 'Undo', fn: () => { if (typeof undo === 'function') undo(); } } });
      } else if (a.dataset.act === 'save') save();
    });
    sheet.el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); save(); } });
    function save() {
      const nameEl = $('#food-e-name'), kEl = $('#food-e-kcal');
      const name = nameEl.value.trim(), kcal = U.parseNum(kEl.value);
      ui.fieldError(nameEl, ''); ui.fieldError(kEl, '');
      let bad = false;
      if (!name) { ui.fieldError(nameEl, 'Give it a name.'); bad = true; }
      if (!fin(kcal) || kcal < 0 || kcal > 10000) { ui.fieldError(kEl, 'Enter calories between 0 and 10,000.'); bad = true; }
      if (bad) { (name ? kEl : nameEl).focus(); return; }
      const patch = { name, kcal: Math.round(kcal), meal: $('#food-e-meal').value };
      ['protein', 'carbs', 'fat'].forEach(k => { const v = U.parseNum($('#food-e-' + k).value); patch[k] = fin(v) && v >= 0 ? v : undefined; });
      const tm = $('#food-e-time').value;
      if (/^\d{1,2}:\d{2}$/.test(tm)) patch.t = U.timeOn(key, tm);
      if (factor !== 1 && items.length) patch.items = items.map(it => ({ name: it.name, portion: scaledPortion(it.portion, factor), kcal: Math.round(it.kcal * factor) }));
      let res = null; try { res = M.store.updateItem('foods', f.id, patch); } catch (er) { res = null; }
      sheet.close();
      ui.toast(res ? 'Saved' : 'That couldn’t be saved');
    }
    return sheet;
  }

  /* ================= registration ================= */
  const foodSheet = { open(opts) { opts = opts || {}; return opts.id ? openEdit(opts) : openAdd(opts); } };
  M.sheets.food = foodSheet;
  M.sheets.addFood = foodSheet;
  M.sheets.foodItem = { open: openEdit };
})();
