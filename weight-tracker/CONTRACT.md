# Momentum v2 — foundation contract

Feature builders work from this file plus the design artboards. **Do not edit foundation files**
(`index.html`, `css/tokens.css`, `css/base.css`, `js/core.js`, `js/calc.js`, `js/charts.js`, `js/ui.js`, `js/ai.js`, `js/app.js`).
If you need something the foundation lacks, build it inside your own file (prefixed, scoped) and note it in your summary.

Vanilla JS, classic `<script>` tags, no modules, no build, no network (except the Google Fonts link).
Everything lives on `window.M`. Load order (already wired in `index.html`):
`core → calc → charts → ui → ai → views/onboarding → today → profile → food → activity → progress → plan → app`.
Views must only *register* at load time; never touch the DOM or `M.state` until `render()` is called.

## 1. File ownership

| File | Owner | Registers |
|---|---|---|
| `css/tokens.css`, `css/base.css`, `js/core.js`, `js/calc.js`, `js/charts.js`, `js/ui.js`, `js/ai.js`, `js/app.js`, `index.html` | foundation | — |
| `js/views/onboarding.js` | onboarding builder | `M.views.onboarding` |
| `js/views/today.js` + `css/today.css` | today builder | `M.views.today` |
| `js/views/food.js` + `css/food.css` | food builder | `M.views.food`, `M.sheets.food`, `M.sheets.foodItem` (optional) |
| `js/views/activity.js` + `css/activity.css` | activity builder | `M.views.activity`, `M.sheets.workout`, `M.sheets.activity` |
| `js/views/progress.js` + `css/progress.css` | progress builder | `M.views.progress` |
| `js/views/plan.js` | plan builder (styles go in `css/progress.css` under `.plan-` prefix, or `css/today.css` if owned by today builder) | `M.views.plan` |
| `js/views/profile.js` | profile builder (styles: `css/activity.css` under `.profile-` prefix) | `M.views.profile` |

CSS rule: feature CSS uses a **file prefix** for every new class (`.today-*`, `.food-*`, `.act-*`, `.prog-*`, `.plan-*`, `.profile-*`, `.ob-*`)
and never restyles a base class globally. Use tokens (`var(--…)`) only — never raw hex.

## 2. Registering a view

```js
(function () {
  'use strict';
  const M = window.M, U = M.util, ui = M.ui;
  M.views.food = {
    title: 'Food',            // used in document.title
    narrow: false,            // true => container max-width 760px (forms/settings)
    render(el, ctx) {         // el = <main id="view" class="container">; ctx = {route, params}
      el.innerHTML = '<div class="view">…</div>';   // ALWAYS wrap in .view (vertical rhythm 32px)
      // bind events on el (it is replaced content each render; use delegation or rebind)
    },
    destroy() {}              // optional: called when navigating away (disconnect observers, abort AI calls)
  };
})();
```

* `app.js` calls `render()` on route change **and on every data change** (coalesced per animation frame). Keep render idempotent.
  Preserve transient UI state (open tab, selected range) in module-level variables. Scroll position is preserved on same-route re-renders.
* While an AI call or a sheet is in progress, data changes still re-render the view; don't keep critical state only in DOM.
* Routes: `#today #food #activity #progress #plan #profile` + sub-screen `#bmi` (`M.views.bmi`, js/views/bmi.js + css/bmi.css, prefix `.bmi-`; not a nav tab — app highlights the tab you came from and sets `M.prevRoute` for its back button; entry points: BMI tile on Progress stats, BMI row in Profile body stats), optional query `#food?date=2026-11-02` → `ctx.params.date`.
  Navigate with `M.go('food', {date:'2026-11-02'})` or plain `<a href="#plan">`. Force a re-render: `M.render()`.
* Onboarding: while `M.store.profileComplete()` is false, app renders `M.views.onboarding.render(el, {route:'onboarding', params:{}, profile})`
  (profile may be partial, e.g. migrated from v1 without sex/birthYear/height — prefill from it). Nav chrome is hidden.
  Finish by calling `M.store.setProfile({...})` (+ optionally `M.store.addItem('weights', …)` for the first weigh-in) and then `location.hash = '#today'`.
  If no onboarding view registers, a built-in fallback form is used.

## 3. Sheets (modals)

Registry: `M.sheets[name] = { open(opts) }`. Open from anywhere with `M.openSheet(name, opts)` or markup
`<button data-open-sheet="workout" data-sheet-opts='{"date":"2026-11-03"}'>` (delegated globally).

| Name | Owner | `open(opts)` |
|---|---|---|
| `quickAdd` | foundation | `{}` — Weigh-in · Food · Workout + "Steps & active calories" row |
| `weighIn` | foundation | `{id?}` edit existing weight; `{date?, kg?}` prefill new |
| `food` | food | `{date?, meal?, mode?:'photo'\|'text'\|'manual', id?}` add/edit food |
| `workout` | activity | `{date?, mode?:'photo'\|'manual', id?}` add/edit workout |
| `activity` | activity | `{date?, mode?:'screenshot'\|'export'\|'manual'}` Samsung Health import / manual steps |

Build a sheet with `M.ui.sheet(...)` (see §6). One primary CTA per sheet, placed in `foot`.
Unregistered names fall back to navigating to the owning route.

## 4. Data — `M.state`, `M.store` (js/core.js)

Canonical units: **kg, kcal, cm, km**, timestamps in **ms**, dates as local `'YYYY-MM-DD'` keys. Never store display units.

```ts
Profile {
  name: string; sex: 'male'|'female'; birthYear: number; heightCm: number;
  unit: 'lb'|'kg'; theme: 'system'|'light'|'dark';
  startKg: number; startDate: 'YYYY-MM-DD'; goalKg: number; targetDate: 'YYYY-MM-DD'|null;
  paceKgPerWeek?: number; stepGoal?: number; activityBaseline?: string; waistCm?: number;   // waist (cm), optional, set on #bmi
  createdAt: number; updatedAt: number; celebrated: string[];   // milestone ids already celebrated
}
DayDoc {                      // one per date, M.state.days['2026-11-03']
  date: 'YYYY-MM-DD'; updatedAt: number;
  weights:  [{ id, kg, t, tags: string[], note }];
  foods:    [{ id, t, meal:'breakfast'|'lunch'|'dinner'|'snacks', name, kcal, protein?, carbs?, fat?,
               items:[{name, portion, kcal}], source:'photo'|'text'|'manual', thumb?: 'data:image/jpeg;base64,…' (≤160px), note? }];
  workouts: [{ id, t, type, name?, minutes, kcal, distanceKm?, avgHr?, note?, source:'photo'|'manual'|'samsung-export',
               countedInSamsung: boolean, thumb? }];
  activity: { steps?, activeKcal?, totalKcal?, activeMinutes?, distanceKm?,
              source:'samsung-screenshot'|'samsung-export'|'manual', syncedAt } | null;
}
```
`type` for workouts is a `M.calc.WORKOUT_TYPES` id: `treadmill_walk treadmill_run walk run cycling strength swim hiit yoga other`.
Items are validated/cleaned on write (`M.clean.food(item)` etc. return `null` when invalid). Unknown fields are dropped.

### Reads
| Call | Returns |
|---|---|
| `M.state.profile` | Profile or `null` |
| `M.store.getDay(key)` | DayDoc (empty template if none) — **read only** |
| `M.store.dayKeys()` | ascending keys with any data |
| `M.store.allWeights() / allFoods() / allWorkouts()` | flattened, ascending by `t` |
| `M.store.recentFoods(limit=12)` | distinct foods by name, newest first (for one-tap re-add) |
| `M.store.findItem(kind, id)` | `{kind, key, item}` or `null` (`kind`: `'weights'\|'foods'\|'workouts'`) |
| `M.store.profileComplete()` | boolean |
| `M.state.sync` | `'local'\|'connecting'\|'cloud'\|'error'` |

### Writes (all persist locally at once, sync to cloud debounced, emit `'change'`)
| Call | Notes |
|---|---|
| `M.store.setProfile(patch)` | shallow merge; creates profile if missing; applies theme if `patch.theme` |
| `M.store.addItem(kind, item)` → item | day derived from `item.t`; `id` auto |
| `M.store.updateItem(kind, id, patch)` → item | moves days if `t` changes day |
| `M.store.removeItem(kind, id)` → `undo()` | pair with `M.ui.toast('Deleted', {action:{label:'Undo', fn: undo}})` |
| `M.store.setActivity(key, activityOrNull)` → `undo()` | replaces the day's activity |
| `M.store.setActivityBulk({key: activity}, {merge?})` → count | one change event (Samsung export) |
| `M.store.addItemsBulk(kind, items)` → days touched | dedupes by `id` (give imported items stable ids, e.g. `'sh-' + start_time`) |
| `M.store.updateDay(key, fn)` | low-level atomic edit: `fn(clone)` mutates a clone |
| `M.store.resetAll()` | async; wipes local + cloud |
| `M.store.exportJSON()` | string |
| `M.store.applyTheme(t?)` | `'system'\|'light'\|'dark'` |

Events: `M.on('change', ({keys, v}) => …)` (returns an unsubscribe fn), `'sync'`, `'sync-error'`, `'ai-ready'`, `'ai-unavailable'`.
Views normally don't subscribe — app re-renders them.

Storage: localStorage `'momentum.v2'` renders instantly; when `claude.use('db')` + `claude.use('user')` resolve with an id, profile lives at
`data/users/<uid>/profile`, days at `data/users/<uid>/profile/days/<YYYY-MM-DD>`, per-day last-writer-wins on `updatedAt`.
v1 data (`localStorage 'momentum.v1'` and `…/profile/entries`) is migrated into day docs automatically.
Food/workout photo thumbs must come from `M.ui.thumb(file)` (≤160px JPEG, ~8 KB). Never store full photos.

## 5. Utilities, units, derived data

`M.util` (`U`): `keyOf(t) fromKey(k) addDays(k,n) diffDays(a,b) todayKey() weekStartKey(k) isValidKey(k) timeOn(k,'HH:MM')→ms hhmm(t)`
`fmtDate(k, intlOpts?) fmtDateY(k) fmtDateLong(k) fmtTime(t) relDay(k)` ('Today'/'Yesterday'/'Tue, Nov 3')
`int(n)` '1,420' · `signedInt(n)` '+120'/'−120' · `fixed(n,d)` · `kcal(n)` '1,420 kcal' · `pct(x)` · `minutes(m)` '1 h 5 min'
`uid() esc(s) clamp mean sum parseNum(s) plural(n,'day') greeting() mealForTime(t) debounce(fn,ms) reduceMotion() clone(o)`.
Every formatter returns '–' for non-finite input — **never print NaN**.
`M.MEALS` = `[{id:'breakfast',label:'Breakfast'},…]`, `M.WEIGH_TAGS`.

`M.units`: `unit` ('lb'|'kg' from profile) · `to(kg)` display number · `from(v)` → kg · `n(kg,d=1)` '193.6' · `w(kg)` '193.6 lb' ·
`abs(dKg)` '4.6' · `signed(dKg)` '−4.6' · `dist(km)` '3.3 mi' · `distUnit()` · `distTo(km)` · `distFrom(v)` · `height(cm)` '5′ 10″' · `cmToFtIn(cm)` · `ftInToCm(ft,in)` · `LB`.

`M.data` (memoized per data version + minute — call freely inside render):
| Call | Returns |
|---|---|
| `M.data.balance(key?)` | today's (or key's) energy balance, see below |
| `M.data.plan()` | `calc.plan` for today |
| `M.data.todayActions()` | `{eatUnder, left, overBy, burnToFix: Equivalents, extraBurnForTarget: Equivalents}` |
| `M.data.analysis()` | `calc.weightAnalysis` |
| `M.data.deficits(n=7)` | `calc.deficitAnalysis` |
| `M.data.headlines()` | `[{text, html}]` (html has `<b>` around key numbers, already escaped) |
| `M.data.currentKg()` | trend weight (kg) |
| `M.data.bmr()` | kcal/day |

### How to read today's balance
```js
const b = M.data.balance();          // or M.data.balance('2026-11-02')
b.eaten          // kcal eaten
b.resting        // BMR so far (prorated); b.bmr = full-day BMR
b.active         // Samsung/manual active kcal (or steps estimate: b.activeEstimated)
b.workouts       // manual workouts NOT already counted in Samsung (b.workoutsExcluded = the rest)
b.burnSoFar      // resting + active + workouts
b.burnExpected   // BMR + max(active today, 7-day avg active) + workouts  (past days: actual)
b.deficitSoFar   // burnSoFar − eaten   (positive = deficit)
b.targetDeficit  // from plan (negative for gain goals)
b.budget         // burnExpected − targetDeficit  → "eat under"
b.left           // budget − eaten (negative = over; b.over, b.overBy)
b.belowFloor     // budget below 1,500 (male) / 1,200 (female)
b.steps, b.activeAvg7, b.activeSource, b.hasFood, b.hasActivity, b.kg, b.plan
```

## 6. `M.calc` (pure; tested in `tests/calc.test.js`)
`age(birthYear) bmr(sex,kg,cm,age) bmrFor(profile,kg) dayFraction(key,now) bmrSoFar(bmr,key,now)`
`dailyWeights(days)→[{key,avg,min,max,n,entries,trend}] trendAt(series,key) currentKg(profile,days)`
`activeFor(day,kg)→{kcal,source,steps,estimated} workoutsFor(day)→{kcal,excludedKcal,count,list} eatenFor(day)→{kcal,protein,carbs,fat,count} avgActive(days,key,kg,n)`
`equivalents(kcal,kg)→{kcal,treadmillMin,walkMin,runMin,steps,perMin:{treadmill,walk,run},perStep}` (treadmill 3.5 mph 5% = 6.0 MET; brisk walk 4.3; run 6 mph 9.8)
`kcalPerMin(met,kg) stepKcal(kg) WORKOUT_TYPES:[{id,label,met,hint}] workoutType(idOrText) estimateWorkoutKcal(type,minutes,kg)`
`plan(profile,{currentKg,now,typicalBurn})→{dir(−1 lose/+1 gain), remainingKg, goalReached, targetDate, daysLeft, weeksLeft, kgPerWeek, kgPerDay, kcalPerDay, targetDeficit, budget, minKcal, maxSafeKgPerWeek, tooFast, lowBudget, pastTarget, safe, safeKgPerWeek, safeDate, scenarios:[{id:'relaxed'|'steady'|'ambitious', label, kgPerWeek, kcalPerDay, budget, days, date, safe}], progress(0–1), changeKg, startKg, goalKg, currentKg}`
`balance(profile,days,key,now)` (above) · `todayActions(balance)`
`weightAnalysis(profile,days,now)→{series, current, latest, totalChange, progress, remaining, goalReached, weeks:[{start,end,change,hasData,partial}], lastWeek, thisWeek, bestWeek, change7, paceAll, pace4 (kg/week), projKey, projDays, scheduleDays(+ahead), neededPace, streak, longest, extreme, best30, morningVsEvening, swing, daysSinceLog, milestones:{weight,streaks,all,next}, toward(d), dir, unit}`
`milestones(profile,analysis) newlyCrossed(ms, celebrated)`
`deficitAnalysis(profile,days,now,n)→{days:[{key,logged,partial,eaten,burn,budget,deficit,under,target}], completedCount, underCount, total, avg, expectedKg, actualKg, streakUnder, best, today}`
`headlines(profile,days,now)→[{text,html}]` · `KCAL_PER_KG = 7700` · date helpers re-exported.
**BMI** (shared; callers in feature files should guard with `M.calc.bmi ? … : fallback`):
`bmi(kg, heightCm)` → kg/m² unrounded (`null` for invalid input) · `bmiCategory(bmi)` → `{key:'under'|'healthy'|'over'|'obese', label:'Underweight'|'Healthy'|'Overweight'|'Obese', min, max}` (cutoffs 18.5 / 25 / 30, lower bound inclusive; `null` for non-finite) ·
`healthyWeightRange(heightCm)` → `{minKg, maxKg}` (BMI 18.5 and 24.9) · `bmiForWeight(kg, heightCm)` · `weightForBmi(bmi, heightCm)` → kg · `BMI_CATS`.
Example: 87.8 kg @ 178 cm → 27.7 (Overweight); healthy range for 178 cm → 58.6–78.9 kg.
Celebrations of newly crossed milestones are handled by `app.js` — views just list milestones.

## 7. `M.charts` (js/charts.js) — load the dataviz rules: one takeaway title per chart, direct labels, few gridlines

```js
const c = M.charts.lineChart(el, {
  dots:[{key, y}], line:[{key, y}],            // y in DISPLAY units (convert with M.units.to)
  goal: 180, goalLabel:'Goal 180',             // dashed amber
  projection:[{key, y}, {key, y}], projectionLabel:'Dec 18',   // dashed brand
  domain:{from:key, to:key},                   // optional x range
  height:240, yFmt:v => v.toFixed(0), latestLabel:'193.6',
  tip:(key, point) => ({title: U.fmtDate(key), rows:[['Trend','193.6 lb'], ['Weigh-ins','2']]}),
  ariaLabel:'Weight trend', emptyText:'Log a few weigh-ins to see your trend'
});
c.update(newOpts); c.destroy();              // call destroy() in view.destroy()
M.charts.barChart(el, {bars:[{label:'Tue', value:1096, highlight:true, muted?, color?}], ref:{value:535, label:'Target'},
  valueFmt:U.int, labels:'auto'|'all'|'none', height:200, posColor, negColor, tip:(bar,i)=>({title, rows})});
M.charts.stackedBar(el, {segments:[{label:'Resting', value:1826, color:'var(--d-rest)'}, …], max?, legend:true, valueFmt, inlineLabels:true});
el.innerHTML = M.charts.ring({size:168, stroke:14, value:0.72, max:1, color:'var(--d-eaten)',
  segments?:[{value, color}], center:{value:'561', label:'kcal left', over?:'Eat under'}, ariaLabel});
el.innerHTML = M.charts.sparkline({values:[…], width:96, height:32, color:'var(--d-trend)', area:false});
```
All are responsive (ResizeObserver, 12px labels, thinned ticks). Positive bars = teal (deficit), negative = amber (surplus).
Data colors (CSS vars, both themes): `--d-eaten --d-rest --d-active --d-workout --d-deficit --d-surplus --d-trend --d-dot --d-goal --d-proj --d-grid --d-track`.
Inline segment text color is picked automatically (white or near-black by fill luminance, per theme); override with `textColor`.
Bar `ref` label sits in a right gutter at ≥480px wide, otherwise as a dashed key above the plot.

## 8. `M.ui` + icons (js/ui.js)

`M.icon(name, size?)` → SVG string. Sizes: `'xs'` 14 · `'sm'` 16 · default 20 · `'lg'` 24 · `'xl'` 32. Names:
`today food activity progress plan target profile plus minus close check chevron back down up trash edit camera image text form scale
flame steps dumbbell heart rest moon sun system sparkle upload download info alert trophy clock calendar route phone sync cloud gear flag bolt more logo`.

| Helper | Use |
|---|---|
| `ui.html\`…${v}…\`` | escapes `v` unless `ui.raw(str)`; arrays joined |
| `ui.h(tag, attrs, ...children)` | element builder (`onclick`, `class`, `html`, `dataset`, `style` obj) |
| `ui.frag(html)` · `ui.$(sel, root)` · `ui.$$(sel, root)` | |
| `ui.val(n, unit, 'sm'\|'md'\|'lg'\|'xl')` | big number + small muted unit |
| `ui.pageHead({over, title, sub, actions})` | page header HTML |
| `ui.sectionHead({title, sub, action})` | section header HTML |
| `ui.empty({icon, title, body, actions, compact})` | empty state HTML |
| `ui.badge(text, 'brand'\|'good'\|'warn'\|'danger', icon?)` · `ui.progress(fraction, 'teal'\|'amber', label)` | |
| `ui.field({id, label, hint, optional, input: html})` · `ui.fieldError(inputEl, msg\|'')` | |
| `ui.sheet({title, sub, body, foot, wide, onClose, initialFocus})` → `{el, body, foot, close(), setTitle(t,sub), setBody(x), setFoot(x)}` | `body/foot` = HTML string or Node (use a DocumentFragment for several footer buttons). Focus trap, Esc, Android back button, scrim click close it. |
| `ui.confirm({title, body, ok, cancel, danger})` → `Promise<boolean>` | |
| `ui.toast(msg, {action:{label, fn}, duration})` | undo pattern |
| `ui.segmented({options:[{value,label}], value, onChange, block, size:'lg', ariaLabel})` → Element (`.value`) | |
| `ui.chips({options, value, multi, onChange, scroll, tap, ariaLabel})` → Element (`.value`) | |
| `ui.readNum(input)` · `ui.numeric(input, decimals?)` | |
| `ui.celebrate({title, sub, kind, cta})` → Promise | (app handles milestones) |
| `ui.pickFiles({accept, multiple, capture:'environment', directory})` → `Promise<File[]>` | call inside a click handler |
| `ui.downscale(file, 1600, .85)` → `Promise<Blob>` · `ui.thumb(file, 160)` → `Promise<dataURL>` (~8 KB) · `ui.previewURL(file)` | |
| `ui.closeAll()` · `ui.topLayer()` | |

## 9. `M.ai` (js/ai.js)

```js
M.ai.state            // {available: bool|null, images: bool|null} — filled after M.ai.ready resolves
// null until known; app re-renders the current view automatically on 'ai-ready' and 'ai-unavailable'
await M.ai.available(); await M.ai.canImages();
M.ai.UNAVAILABLE_TEXT // "Photo & description analysis works when this app is opened in Claude."

const ctl = new AbortController();                   // one per call; abort in destroy()/Cancel
try {
  const r = await M.ai.analyzeFoodPhoto(file, {signal: ctl.signal});
  // {name, items:[{name, portion, kcal, protein, carbs, fat}], kcal, protein, carbs, fat, confidence:'low'|'medium'|'high', note}
} catch (e) {   // e = {code, message (friendly copy), raw}
  if (e.code === 'cancelled') return;
  if (M.ai.isFatal(e.code)) { /* hide AI entry points, show manual form */ }
  ui.toast(e.message);
}
M.ai.analyzeFoodText(text, opts)          // same shape as photo
M.ai.analyzeWorkoutPhoto(file, opts)      // {type, name, minutes, kcal, distanceKm, avgHr, date, time, t, confidence, note} (nulls when not visible)
M.ai.analyzeSamsungScreenshot(file, opts) // {date, steps, activeKcal, totalKcal, activeMinutes, distanceKm, workouts:[{type,minutes,kcal}], confidence, note}
M.ai.json(prompt, {images, signal, onText, modelTier})   // raw strict-JSON escape hatch
```
Rules: AI results ALWAYS go to an editable review card before saving. Show "Thinking…" (`.thinking` + `.spinner`) with a Cancel button
from the call until it resolves (5–60 s is normal). Never call AI from loops/timers. When `M.ai.state.available === false`, entry points for
photo/describe show `M.ai.UNAVAILABLE_TEXT` and route to the manual form. Photo entry points appear only when `M.ai.state.images`.

## 10. CSS primitives (css/base.css)

Layout is mobile-first; **no-smash rules are built in**: flex/grid children get `min-width:0`, numbers `white-space:nowrap` + tabular,
user text `overflow-wrap:anywhere`, grids use `minmax()`. Page padding 20/32/40px, card padding 20/24px, gap 16/20px, sections 32px.
Bottom nav is fixed on phones; the container already pads its bottom (nav + safe-area + 40px). Sidebar ≥1024 (icon rail 1024–1199).

```html
<div class="view">                                   <!-- every view root; 32px between sections -->
  <header class="page-head"><div class="ph-text"><p class="ph-over">Tuesday, Nov 3</p><h1>Good afternoon, Sam</h1><p class="ph-sub">…</p></div><div class="ph-actions">…</div></header>

  <section class="section">
    <div class="section-head"><div class="sh-text"><h2 class="section-title">Today</h2><p class="section-sub">…</p></div><div class="sh-action"><a class="link-btn" href="#food">See all</a></div></div>
    <div class="grid grid-2">…</div>                  <!-- 1 col; 2 cols ≥900 -->
  </section>

  <article class="card [hero|flat|tight|pad-0|interactive|tint-brand|tint-teal|tint-amber]">
    <div class="card-head"><div class="ch-text"><h3 class="card-title">Calories</h3><p class="card-sub">…</p></div><div class="ch-action"><button class="btn-icon">…</button></div></div>
    …
    <div class="card-foot">…</div>
  </article>

  <div class="grid-stats">                            <!-- 2 per row on phones, auto-fit ≥768 -->
    <div class="stat [inset]"><p class="stat-label"><span class="dot eaten"></span><span>Eaten</span></p>
      <p class="stat-value">1,420<span class="unit">kcal</span></p><p class="stat-sub [good|warn]">561 left</p></div>
  </div>

  <div class="list [inset]">                          <!-- inside .card: use class="card pad-0" or let .card > .list bleed -->
    <button class="row"><img class="row-thumb" src="…" alt=""><span class="row-main"><span class="row-title">Chicken burrito bowl</span><span class="row-sub">Lunch · 12:30 PM</span></span><span class="row-end"><span class="row-value">680<span class="unit">kcal</span></span><svg class="ic row-chev">…</svg></span></button>
  </div>
</div>
```
Other grids: `.grid` (1 col) + modifiers `.grid-2` `.grid-3` `.grid-main` (1.6fr/1fr ≥900) · `.grid-auto` (auto-fit min 280px) · `.span-all`.
Stacks: `.stack` (gap var) `.stack-sm` 8 `.stack-md` 12 `.stack-lg` 32 · `.cluster` (wrap row) · `.spread` (space-between) · `.grow` · `.divider`.
Type: `.t-hero .t-h1 .t-h2 .t-title .t-body .t-sm .t-cap .t-over .muted .ink-2 .c-brand .c-good .c-warn .c-danger .num .nowrap .wrap-any .truncate .clamp-2 .balance .pretty .sr-only`;
value pairs `.val .val-n .val-u` (+ `.sm .md .lg .xl`).
Buttons: `.btn` + `.btn-primary` (pill 52px, ONE per screen/sheet) `.btn-secondary` `.btn-outline` `.btn-tonal` `.btn-ghost` `.btn-danger` · `.btn-sm` `.btn-block` · `.btn-icon` (44px, `.filled`) · `.link-btn`.
Inside a button put the text in `<span class="btn-label">` when it may be long.
Chips: `.chips [.scroll]` > `button.chip[aria-pressed] [.tap]`. Segmented: `.seg [.block .lg]` > `button.seg-btn[aria-pressed]`.
Forms: `.form` > `.field` (`label.label`, `.input|.select|.textarea`, `.hint`, `.error-text`) · `.field-row` (auto-fit ≥140px) · `.input-wrap` + `.suffix` · `.toggle` (`<label class="toggle"><span>Label</span><input type="checkbox"><span class="track"></span></label>`) · `.dropzone` · `.big-input` · `.stepper`.
Feedback: `.notice [brand|good|warn]` (icon + div) · `.badge [brand|good|warn|danger]` · `.progress [thin teal amber] > .bar` + `.progress-meta` · `.segbar > span` · `.thinking` + `.spinner` · `.skel .line|.block` · `.empty`.
Data: `.legend > .legend-item > .dot.(eaten|rest|active|workout|deficit|surplus)[.sq|.line|.dash] + text + .lv` · `.ring` · `.chart` · `.chart-title` · `.chart-empty` · `.pill-meter > span.on`.
Icon chips: `.ic-bubble [sm] [brand|teal|amber]`. Quick tiles: `.quick-grid > .quick-tile`.
Images: `.thumb-img` (full width preview), `.row-thumb` (44px).
Tokens: see `css/tokens.css` (`--s-1…--s-16`, `--r-*`, `--sh-1..3`, colors). Dark mode is automatic; never hardcode colors.

## 11. Copy & design rules (from spec)
One focal point per screen; summaries first, details behind "See all"/sheets; max 2 stat tiles per row on phones; never 3+ numbers
side by side under 390px unless each column ≥100px. No emoji (use `M.icon`). No gradients, no left-border accent cards.
Every chart has a one-sentence takeaway title computed from data. Be honest about Samsung Health:
"Samsung Health can't connect directly to web apps — import a screenshot or your data export."

## 12. Tests
`node tests/calc.test.js` (pure math) · `node tests/smoke.test.js [screenshotDir]` (Playwright: onboarding, all routes, quick-add, weigh-in, charts, v1 migration, no console errors, no horizontal overflow at 390/1440/360).
