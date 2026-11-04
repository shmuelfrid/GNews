/* node tests for js/calc.js — no deps. Run: node tests/calc.test.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
process.env.TZ = process.env.TZ || 'America/New_York';
const ctx = { window: {}, console, Date, Math, JSON, Intl };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'calc.js'), 'utf8'), ctx);
const C = ctx.window.M.calc;
const LB = 0.45359237;
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } }
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' expected ' + b + ' ± ' + tol + ', got ' + a);

const NOW = new Date(2026, 10, 3, 15, 0).getTime(); // Tue Nov 3 2026, 3:00 PM local
const TODAY = '2026-11-03';
const profile = { name: 'Sam', sex: 'male', birthYear: 1992, heightCm: 178, unit: 'lb', startKg: 212 * LB, startDate: '2026-08-04', goalKg: 180 * LB, targetDate: '2027-01-31', celebrated: [] };

// build a gently declining weight history ending at ~193.6 lb trend
function makeDays() {
  const days = {};
  let lb = 212;
  for (let k = '2026-08-04'; k <= TODAY; k = C.addDays(k, 1)) {
    const n = C.diffDays('2026-08-04', k);
    lb = 212 - n * (18.6 / 91) + (n % 3 === 0 ? 0.3 : -0.1);
    const t = C.fromKey(k).getTime() + 7 * 3600e3;
    days[k] = { date: k, weights: [{ id: 'w' + n, kg: lb * LB, t, tags: [], note: '' }], foods: [], workouts: [], activity: null, updatedAt: 1 };
  }
  // today: food 1420, steps/active, a workout + one already counted
  days[TODAY].foods = [{ id: 'f1', t: NOW - 7 * 3600e3, meal: 'breakfast', name: 'Yogurt', kcal: 320, items: [] },
    { id: 'f2', t: NOW - 3 * 3600e3, meal: 'lunch', name: 'Burrito bowl', kcal: 680, items: [] },
    { id: 'f3', t: NOW - 3600e3, meal: 'snacks', name: 'Apple + almonds', kcal: 210, items: [] },
    { id: 'f4', t: NOW - 1800e3, meal: 'snacks', name: 'Latte', kcal: 210, items: [] }];
  days[TODAY].activity = { steps: 8420, activeKcal: 380, source: 'samsung-screenshot', syncedAt: NOW };
  days[TODAY].workouts = [{ id: 'x1', t: NOW, type: 'treadmill_walk', minutes: 35, kcal: 310, countedInSamsung: false },
    { id: 'x2', t: NOW, type: 'run', minutes: 20, kcal: 250, countedInSamsung: true }];
  // previous 6 days: activity + food
  const eaten = [1500, 1400, 1650, 2600, 1300, 1200];
  for (let i = 1; i <= 6; i++) {
    const k = C.addDays(TODAY, -i);
    days[k].activity = { steps: 9000, activeKcal: 400, source: 'manual', syncedAt: 1 };
    days[k].foods = [{ id: 'p' + i, t: C.fromKey(k).getTime() + 12 * 3600e3, meal: 'lunch', name: 'Meal', kcal: eaten[i - 1], items: [] }];
  }
  return days;
}
const days = makeDays();

console.log('calc.js');
t('age from birth year', () => assert.strictEqual(C.age(1992, NOW), 34));
t('BMR Mifflin–St Jeor male sample = 1,826', () => assert.strictEqual(C.bmr('male', 87.8, 178, 34), 1826));
t('BMR female is 166 lower', () => assert.strictEqual(C.bmr('male', 70, 165, 30) - C.bmr('female', 70, 165, 30), 166));
t('BMR missing inputs -> null', () => assert.strictEqual(C.bmr('male', NaN, 178, 34), null));
t('dayFraction today/past/future', () => {
  near(C.dayFraction(TODAY, NOW), 15 / 24, 0.001);
  assert.strictEqual(C.dayFraction('2026-11-01', NOW), 1);
  assert.strictEqual(C.dayFraction('2026-11-05', NOW), 0);
});
t('bmrSoFar prorates', () => near(C.bmrSoFar(1826, TODAY, NOW), 1826 * 15 / 24, 0.5));
t('date helpers local + DST-safe', () => {
  assert.strictEqual(C.addDays('2026-11-01', 1), '2026-11-02'); // US DST ends Nov 1 2026
  assert.strictEqual(C.diffDays('2026-10-31', '2026-11-02'), 2);
  assert.strictEqual(C.weekStartKey('2026-11-03'), '2026-11-02');
});
t('daily trend = 7-day MA of daily means', () => {
  const d = { '2026-01-01': { weights: [{ kg: 80, t: 1 }, { kg: 82, t: 2 }] }, '2026-01-02': { weights: [{ kg: 80, t: 3 }] }, '2026-01-10': { weights: [{ kg: 70, t: 4 }] } };
  const s = C.dailyWeights(d);
  assert.strictEqual(s[0].avg, 81); assert.strictEqual(s[1].trend, 80.5); assert.strictEqual(s[2].trend, 70);
});
t('active: activeKcal preferred, steps fallback', () => {
  assert.strictEqual(C.activeFor({ activity: { activeKcal: 380, steps: 8420 } }, 87.8).kcal, 380);
  const a = C.activeFor({ activity: { steps: 2000 } }, 87.8);
  assert.strictEqual(a.kcal, 88); assert.ok(a.estimated);
  assert.strictEqual(C.activeFor(null, 80).kcal, 0);
});
t('workouts exclude countedInSamsung', () => { const w = C.workoutsFor(days[TODAY]); assert.strictEqual(w.kcal, 310); assert.strictEqual(w.excludedKcal, 250); });
t('balance today', () => {
  const b = C.balance(profile, days, TODAY, NOW);
  assert.ok(b.isToday);
  assert.strictEqual(b.eaten, 1420);
  assert.strictEqual(b.workouts, 310);
  assert.strictEqual(b.active, 380);
  assert.strictEqual(b.activeAvg7, 400);
  near(b.bmr, 1826, 15, 'bmr');
  assert.strictEqual(b.burnSoFar, Math.round(b.resting + 380 + 310));
  assert.strictEqual(b.burnExpected, b.bmr + 400 + 310);          // max(380, avg 400)
  assert.strictEqual(b.deficitSoFar, b.burnSoFar - 1420);
  near(b.targetDeficit, 535, 15, 'targetDeficit');
  assert.strictEqual(b.budget, b.burnExpected - b.targetDeficit);
  assert.strictEqual(b.left, b.budget - 1420);
});
t('balance past day = full actual burn', () => {
  const k = C.addDays(TODAY, -2);
  const b = C.balance(profile, days, k, NOW);
  assert.ok(b.isPast); assert.strictEqual(b.resting, b.bmr); assert.strictEqual(b.burnExpected, b.bmr + 400); assert.strictEqual(b.burnSoFar, b.burnExpected);
});
t('balance with no data never NaN', () => {
  const b = C.balance({ sex: 'female', birthYear: 1990, heightCm: 165, startKg: 70, goalKg: 65, unit: 'kg' }, {}, TODAY, NOW);
  Object.keys(b).forEach(k => { if (typeof b[k] === 'number') assert.ok(isFinite(b[k]), k + ' is ' + b[k]); });
});
t('plan math: sample ≈ 1.07 lb/wk, ≈ 535 kcal/day', () => {
  const pl = C.plan(profile, { currentKg: 193.6 * LB, now: NOW, typicalBurn: 1826 + 400 });
  assert.strictEqual(pl.daysLeft, 89);
  near(pl.kgPerWeek / LB, 1.07, 0.01, 'lb/wk');
  near(pl.kcalPerDay, 535, 6, 'kcal/day');
  assert.strictEqual(pl.budget, 1826 + 400 - pl.targetDeficit);
  assert.ok(pl.safe); assert.strictEqual(pl.scenarios.length, 3);
  near(pl.progress, 18.4 / 32, 0.01, 'progress');
});
t('plan safety: too fast + low budget + safe date', () => {
  const pl = C.plan(Object.assign({}, profile, { targetDate: '2026-11-24' }), { currentKg: 193.6 * LB, now: NOW, typicalBurn: 2200 });
  assert.ok(pl.tooFast); assert.ok(pl.lowBudget); assert.ok(pl.safeDate > '2026-11-24');
  assert.ok(pl.safeKgPerWeek <= 0.01 * 193.6 * LB + 1e-9);
});
t('plan female floor 1200', () => assert.strictEqual(C.plan({ sex: 'female', startKg: 80, goalKg: 70 }, { currentKg: 80, now: NOW, typicalBurn: 1800 }).minKcal, 1200));
t('plan gain goal symmetric (surplus)', () => {
  const pl = C.plan({ sex: 'male', startKg: 60, goalKg: 66, targetDate: '2027-05-03', unit: 'kg' }, { currentKg: 61, now: NOW, typicalBurn: 2400 });
  assert.strictEqual(pl.dir, 1); assert.ok(pl.targetDeficit < 0); assert.ok(pl.budget > 2400); assert.ok(!pl.lowBudget);
});
t('plan pace-only profile derives date', () => {
  const pl = C.plan({ sex: 'male', startKg: 90, goalKg: 85, paceKgPerWeek: 0.5, unit: 'kg' }, { currentKg: 90, now: NOW });
  assert.strictEqual(pl.daysLeft, 70); assert.strictEqual(pl.targetDate, C.addDays(TODAY, 70));
});
t('plan goal reached -> maintain', () => { const pl = C.plan(profile, { currentKg: 179 * LB, now: NOW, typicalBurn: 2200 }); assert.ok(pl.goalReached); assert.strictEqual(pl.targetDeficit, 0); });
t('equivalents: 300 kcal ≈ 33 min treadmill at 87.8 kg', () => {
  const e = C.equivalents(300, 87.8);
  near(e.perMin.treadmill, 9.2, 0.05); assert.strictEqual(e.treadmillMin, 33);
  near(C.equivalents(88, 87.8).steps, 2000, 100);
});
t('workout type matching + MET estimate', () => {
  assert.strictEqual(C.workoutType('Treadmill walk').id, 'treadmill_walk');
  assert.strictEqual(C.workoutType('Outdoor running').id, 'run');
  assert.strictEqual(C.workoutType('spin class').id, 'cycling');
  assert.strictEqual(C.estimateWorkoutKcal('treadmill_walk', 35, 87.8), Math.round(6 * 3.5 * 87.8 / 200 * 35));
});
t('weight analysis: trend, streak, weeks, projection', () => {
  const a = C.weightAnalysis(profile, days, NOW);
  assert.ok(a.series.length > 80);
  assert.strictEqual(a.streak, a.series.length);
  assert.ok(a.lastWeek && a.lastWeek.change < 0);
  assert.ok(a.pace4 < 0); assert.ok(a.projKey);
  assert.ok(a.progress > 0.4 && a.progress < 0.7);
  assert.ok(a.milestones.weight.some(m => m.earned)); assert.ok(a.milestones.next);
});
t('milestones newly crossed respects celebrated', () => {
  const a = C.weightAnalysis(profile, days, NOW);
  const all = C.newlyCrossed(a.milestones, []);
  assert.ok(all.length > 0);
  assert.strictEqual(C.newlyCrossed(a.milestones, all.map(m => m.id)).length, 0);
});
t('gain-goal analysis symmetric', () => {
  const d = {}; for (let i = 0; i < 20; i++) { const k = C.addDays(TODAY, -19 + i); d[k] = { weights: [{ id: 'g' + i, kg: 60 + i * 0.1, t: C.fromKey(k).getTime() + 8 * 3600e3 }] }; }
  const a = C.weightAnalysis({ startKg: 60, goalKg: 66, unit: 'kg', startDate: C.addDays(TODAY, -19) }, d, NOW);
  assert.strictEqual(a.dir, 1); assert.ok(a.progress > 0.2); assert.ok(a.projKey);
});
t('deficit analysis 7 days', () => {
  const da = C.deficitAnalysis(profile, days, NOW, 7);
  assert.strictEqual(da.days.length, 7);
  assert.strictEqual(da.completedCount, 6);
  assert.ok(da.underCount === 5, 'under ' + da.underCount);
  assert.ok(da.total > 0); near(da.expectedKg, da.total / 7700, 1e-9);
  assert.ok(da.today.partial);
});
t('headlines: real sentences, never NaN', () => {
  const H = C.headlines(profile, days, NOW);
  assert.ok(H.length >= 3);
  H.forEach(h => { assert.ok(!/NaN|undefined|null/.test(h.text), h.text); assert.ok(h.html.includes('<b>') || h.text.length > 0); });
  const H0 = C.headlines(profile, {}, NOW);
  assert.strictEqual(H0.length, 1);
});
t('headlines escape html', () => {
  const H = C.headlines(Object.assign({}, profile, { goalKg: 180 * LB }), days, NOW);
  H.forEach(h => assert.ok(!/<(?!\/?b>)/.test(h.html), h.html));
});

/* ---- QA additions: independent hand-computed values + regressions ---- */
t('BMR female hand-computed (Mifflin–St Jeor)', () => {
  // 10×70 + 6.25×163 − 5×41 − 161 = 700 + 1018.75 − 205 − 161 = 1352.75
  assert.strictEqual(C.bmr('female', 70, 163, 41), 1353);
  assert.strictEqual(C.bmrFor({ sex: 'female', heightCm: 163, birthYear: 1985 }, 70, NOW), 1353);
});
t('age clamps and uses calendar year', () => { assert.strictEqual(C.age(2026, NOW), 10); assert.strictEqual(C.age('1990', NOW), 36); assert.strictEqual(C.age(undefined, NOW), null); });
t('dayFraction across DST end (25-hour day)', () => {
  const t = new Date(2026, 10, 1, 12, 0).getTime();   // Nov 1 2026, noon; day has 25 h in America/New_York
  near(C.dayFraction('2026-11-01', t), 13 / 25, 0.001);
});
t('equivalents: walk, run, steps rounding', () => {
  const e = C.equivalents(500, 80);
  assert.strictEqual(e.walkMin, Math.ceil(500 / (4.3 * 3.5 * 80 / 200)));
  assert.strictEqual(e.runMin, Math.ceil(500 / (9.8 * 3.5 * 80 / 200)));
  assert.strictEqual(e.steps, 12500);               // 500 / 0.04 = 12,500
  assert.strictEqual(C.equivalents(-50, 80).treadmillMin, 0);
});
t('plan: needed pace from date is exact', () => {
  const p = { sex: 'male', startKg: 100, goalKg: 90, targetDate: C.addDays(TODAY, 70), unit: 'kg' };
  const pl = C.plan(p, { currentKg: 97, now: NOW, typicalBurn: 2500 });
  near(pl.kgPerWeek, 0.7, 1e-9); near(pl.kgPerDay, 0.1, 1e-9);
  assert.strictEqual(pl.kcalPerDay, 770); assert.strictEqual(pl.targetDeficit, 770); assert.strictEqual(pl.budget, 1730);
  assert.ok(!pl.tooFast);                          // 0.7 ≤ 1% of 97
  assert.ok(C.plan(Object.assign({}, p, { targetDate: C.addDays(TODAY, 35) }), { currentKg: 97, now: NOW, typicalBurn: 2500 }).tooFast);
});
t('plan: target date in the past -> pastTarget + default pace', () => {
  const pl = C.plan(Object.assign({}, profile, { targetDate: '2026-10-01' }), { currentKg: 193.6 * LB, now: NOW, typicalBurn: 2300 });
  assert.ok(pl.pastTarget); near(pl.kgPerWeek, LB, 1e-9); assert.ok(pl.safeDate);
});
t('balance: budget is capped at the safe floor (never "eat under 458")', () => {
  const p = Object.assign({}, profile, { sex: 'female', targetDate: C.addDays(TODAY, 21) });
  const b = C.balance(p, days, TODAY, NOW);
  assert.ok(b.belowFloor); assert.ok(b.rawBudget < 1200); assert.strictEqual(b.budget, 1200);
  assert.strictEqual(b.left, 1200 - b.eaten);
});
t('balance: no activity history uses onboarding baseline for expected burn only', () => {
  const p = { sex: 'male', birthYear: 1992, heightCm: 178, startKg: 90, goalKg: 80, unit: 'kg', activityBaseline: 'high' };
  const b = C.balance(p, {}, TODAY, NOW);
  assert.strictEqual(b.activeExpected, 550); assert.ok(b.activeFromBaseline);
  assert.strictEqual(b.burnExpected, b.bmr + 550); assert.strictEqual(b.burnSoFar, b.resting);   // so-far stays measured
  assert.strictEqual(b.budget, b.bmr + 550 - b.targetDeficit);
  const withData = C.balance(p, { [C.addDays(TODAY, -1)]: { activity: { activeKcal: 200 } } }, TODAY, NOW);
  assert.strictEqual(withData.activeExpected, 200); assert.ok(!withData.activeFromBaseline);
});
t('gain goal: target met = ate at least the budget; no "burn it off" advice', () => {
  const p = { sex: 'male', birthYear: 1992, heightCm: 178, startKg: 60, goalKg: 66, targetDate: C.addDays(TODAY, 120), unit: 'kg' };
  const d = {};
  for (let i = 1; i <= 3; i++) { const k = C.addDays(TODAY, -i); d[k] = { weights: [{ id: 'w' + i, kg: 61, t: C.fromKey(k).getTime() + 7 * 3600e3 }], foods: [{ id: 'f' + i, kcal: i === 1 ? 1500 : 3500, t: C.fromKey(k).getTime() + 12 * 3600e3 }], activity: { activeKcal: 300 } }; }
  d[TODAY] = { foods: [{ id: 'ft', kcal: 3900, t: NOW - 3600e3 }] };
  const b = C.balance(p, d, TODAY, NOW);
  assert.ok(b.gain); assert.ok(b.targetDeficit < 0); assert.ok(b.over);
  assert.strictEqual(C.todayActions(b).burnToFix.kcal, 0);
  const da = C.deficitAnalysis(p, d, NOW, 7);
  assert.ok(da.gain); assert.strictEqual(da.completedCount, 3); assert.strictEqual(da.underCount, 2);   // the 1,500 kcal day missed
  assert.ok(C.headlines(p, d, NOW).some(h => /calorie target/.test(h.text)));
});
t('deficit analysis: expected vs actual, streak under', () => {
  const da = C.deficitAnalysis(profile, days, NOW, 7);
  const s = C.dailyWeights(days);
  near(da.actualKg, C.trendAt(s, TODAY) - C.trendAt(s, C.addDays(TODAY, -7)), 1e-12);
  assert.strictEqual(da.total, da.days.filter(x => x.logged && !x.partial).reduce((a, x) => a + x.deficit, 0));
  assert.strictEqual(da.streakUnder, 3);   // last 3 days under; the 2,600 kcal day 4 days ago was over
});
t('weekly changes chain from start weight and sum to total', () => {
  const a = C.weightAnalysis(profile, days, NOW);
  const sum = a.weeks.reduce((x, w) => x + w.change, 0);
  near(sum, a.current - profile.startKg, 1e-9);
});
t('milestones: every 5 lb, halfway, decades, goal, in journey order', () => {
  const a = C.weightAnalysis(profile, days, NOW);
  const ids = a.milestones.weight.map(m => m.id);
  ['amt-lb-5', 'amt-lb-10', 'amt-lb-15', 'amt-lb-20', 'amt-lb-25', 'amt-lb-30', 'half', 'dec-lb-210', 'dec-lb-200', 'dec-lb-190', 'goal'].forEach(id => assert.ok(ids.includes(id), id));
  assert.strictEqual(ids[ids.length - 1], 'goal');
  const m15 = a.milestones.weight.find(m => m.id === 'amt-lb-15');
  const first = a.series.find(d => d.trend <= (212 - 15) * LB + 1e-9);
  assert.strictEqual(m15.date, first.key);
  const half = a.milestones.weight.find(m => m.id === 'half'); near(half.targetKg, 196 * LB, 1e-9);
});

/* ---------------- BMI ---------------- */
t('bmi: 87.8 kg at 178 cm is 27.7, Overweight', () => {
  near(C.bmi(87.8, 178), 27.71, 0.01);
  assert.strictEqual(C.bmi(87.8, 178).toFixed(1), '27.7');
  assert.strictEqual(C.bmiCategory(C.bmi(87.8, 178)).key, 'over');
  assert.strictEqual(C.bmiCategory(27.7).label, 'Overweight');
  assert.strictEqual(C.bmi(NaN, 178), null); assert.strictEqual(C.bmi(80, 0), null); assert.strictEqual(C.bmiCategory(NaN), null);
});
t('bmi categories: cutoffs 18.5 / 25 / 30 (lower bound inclusive)', () => {
  assert.strictEqual(C.bmiCategory(18.49).key, 'under');
  assert.strictEqual(C.bmiCategory(18.5).key, 'healthy');
  assert.strictEqual(C.bmiCategory(24.99).key, 'healthy');
  assert.strictEqual(C.bmiCategory(25).key, 'over');
  assert.strictEqual(C.bmiCategory(30).key, 'obese');
  const c = C.bmiCategory(22); assert.strictEqual(c.min, 18.5); assert.strictEqual(c.max, 25);
});
t('healthy weight range for 178 cm is 58.6–78.9 kg', () => {
  const r = C.healthyWeightRange(178);
  assert.strictEqual(r.minKg.toFixed(1), '58.6'); assert.strictEqual(r.maxKg.toFixed(1), '78.9');
  assert.strictEqual(C.healthyWeightRange(NaN), null);
});
t('weightForBmi / bmiForWeight round-trip', () => {
  near(C.bmiForWeight(C.weightForBmi(30, 178), 178), 30, 1e-9);
  near(C.weightForBmi(25, 178), 79.21, 0.001);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
