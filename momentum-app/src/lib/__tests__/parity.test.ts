// @ts-nocheck -- uses node built-ins (fs/vm) to load the web calc.js; no @types/node in the app
/* Parity: the TS port must produce identical outputs to the web app's calc.js on the same dataset. */
import { describe, expect, test } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import * as C from '../calc';

const WEB = path.resolve(__dirname, '../../../../weight-tracker/js/calc.js');
const has = fs.existsSync(WEB);
const d = has ? describe : describe.skip;

function loadWeb(): any {
  const ctx: any = { console, Date, Math, Intl };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(WEB, 'utf8'), ctx);
  return ctx.M.calc;
}
// Unearned streak milestones: web leaves `date` undefined, TS sets null (both falsy, same behaviour).
const norm = (v: unknown) => JSON.parse(JSON.stringify(v, (k, x) => (k === 'date' && x == null ? undefined : x)));

function dataset(now: number) {
  const LB = C.LB;
  const today = C.keyOf(now);
  const start = C.addDays(today, -60);
  const profile = { name: 'Sam', sex: 'male', birthYear: 1990, heightCm: 178, unit: 'lb', startKg: 212 * LB, startDate: start, goalKg: 185 * LB, targetDate: C.addDays(today, 120), stepGoal: 10000, activityBaseline: 'some', celebrated: [] as string[] };
  const days: Record<string, any> = {};
  for (let n = 0; n <= 60; n++) {
    const k = C.addDays(start, n);
    const base = C.fromKey(k).getTime();
    const w = n % 4 === 3 ? [] : [{ id: 'w' + n, kg: (212 - n * 0.2 + (n % 3) * 0.4) * LB, t: base + 7 * 3600e3 }, ...(n % 5 === 0 ? [{ id: 'w2' + n, kg: (212.6 - n * 0.2) * LB, t: base + 20 * 3600e3 }] : [])];
    days[k] = {
      date: k, weights: w,
      foods: n % 6 === 5 ? [] : [{ id: 'f' + n, t: base + 9 * 3600e3, meal: 'breakfast', name: 'x', kcal: 500 + (n * 37) % 400 }, { id: 'g' + n, t: base + 19 * 3600e3, meal: 'dinner', name: 'y', kcal: 800 + (n * 53) % 500 }],
      workouts: n % 3 === 0 ? [{ id: 'x' + n, t: base + 18 * 3600e3, type: 'treadmill_walk', name: 'T', minutes: 30, kcal: 250, countedInSamsung: n % 2 === 0 }] : [],
      activity: n % 2 === 0 ? { steps: 6000 + n * 80, activeKcal: 300 + n * 3, source: 'manual' } : (n % 7 === 1 ? { steps: 9000 } : null),
      planTicks: {},
    };
  }
  return { profile, days, today };
}

d('calc parity with web calc.js', () => {
  const W = loadWeb();
  const nows = [new Date(2026, 10, 3, 14, 30).getTime(), new Date(2026, 2, 29, 9, 5).getTime(), new Date(2026, 6, 1, 23, 50).getTime()];
  for (const now of nows) {
    const { profile, days, today } = dataset(now);
    test('balance/plan/analysis/deficit/headlines @' + new Date(now).toISOString(), () => {
      for (const k of [today, C.addDays(today, -1), C.addDays(today, -3), C.addDays(today, -6)]) {
        expect(norm(C.balance(profile as any, days, k, now))).toEqual(norm(W.balance(profile, days, k, now)));
        expect(norm(C.todayActions(C.balance(profile as any, days, k, now)))).toEqual(norm(W.todayActions(W.balance(profile, days, k, now))));
      }
      const cur = C.currentKg(profile as any, days);
      expect(cur).toEqual(W.currentKg(profile, days));
      expect(norm(C.plan(profile as any, { currentKg: cur, now }))).toEqual(norm(W.plan(profile, { currentKg: cur, now })));
      expect(norm(C.plan({ ...profile, targetDate: undefined, paceKgPerWeek: 0.5 } as any, { currentKg: cur, now, typicalBurn: 2600 }))).toEqual(norm(W.plan({ ...profile, targetDate: undefined, paceKgPerWeek: 0.5 }, { currentKg: cur, now, typicalBurn: 2600 })));
      expect(norm(C.plan({ ...profile, goalKg: 230 * C.LB } as any, { currentKg: cur, now }))).toEqual(norm(W.plan({ ...profile, goalKg: 230 * C.LB }, { currentKg: cur, now })));
      expect(norm(C.weightAnalysis(profile as any, days, now))).toEqual(norm(W.weightAnalysis(profile, days, now)));
      expect(norm(C.deficitAnalysis(profile as any, days, now))).toEqual(norm(W.deficitAnalysis(profile, days, now)));
      expect(norm(C.deficitAnalysis(profile as any, days, now, 30))).toEqual(norm(W.deficitAnalysis(profile, days, now, 30)));
      // RN returns parts (odd indexes bold) instead of HTML; rebuild the HTML to compare.
      const toHtml = (h: C.Headline) => ({ text: h.text, html: h.parts.map((p, i) => (i % 2 ? '<b>' + p + '</b>' : p)).join('') });
      expect(norm(C.headlines(profile as any, days, now).map(toHtml))).toEqual(norm(W.headlines(profile, days, now).map((h: any) => ({ text: h.text, html: h.html })))) ;
      expect(norm(C.dailyWeights(days))).toEqual(norm(W.dailyWeights(days)));
      expect(C.avgActive(days, today, cur, 7)).toEqual(W.avgActive(days, today, cur, 7));
      expect(norm(C.equivalents(420, cur))).toEqual(norm(W.equivalents(420, cur)));
    });
  }
  test('BMI', () => {
    for (const [kg, h] of [[80, 178], [50, 170], [120, 165], [0, 170], [70, 0], [NaN, 170]] as const) {
      expect(C.bmi(kg, h)).toEqual(W.bmi(kg, h));
      expect(norm(C.bmiCategory(C.bmi(kg, h)))).toEqual(norm(W.bmiCategory(W.bmi(kg, h))));
      expect(norm(C.healthyWeightRange(h))).toEqual(norm(W.healthyWeightRange(h)));
      expect(C.weightForBmi(22, h)).toEqual(W.weightForBmi(22, h));
    }
    expect(norm(C.BMI_CATS)).toEqual(norm(W.BMI_CATS));
    expect(norm(C.WORKOUT_TYPES)).toEqual(norm(W.WORKOUT_TYPES));
  });
});
