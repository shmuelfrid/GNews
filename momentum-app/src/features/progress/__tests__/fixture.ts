/* shared test fixture: 13 weeks of steady loss (212 → ~193 lb), morning + some evening weigh-ins, food last 10 days */
import * as C from '@/lib/calc';

export const LB = C.LB;
export const NOW = new Date(2026, 10, 3, 18, 0).getTime();
export const today = C.keyOf(NOW);
export const profile = { name: 'Sam', sex: 'male' as const, birthYear: 1992, heightCm: 178, unit: 'lb' as const, startKg: 212 * LB, startDate: C.addDays(today, -91), goalKg: 180 * LB, targetDate: C.addDays(today, 89), stepGoal: 10000, activityBaseline: 'some' as const, celebrated: [] };
export function days(n = 91) {
  const d: Record<string, any> = {};
  for (let i = n; i >= 0; i--) {
    const k = C.addDays(today, -i);
    const lb = 212 - (91 - i) * (18.6 / 91) + (i % 3 === 0 ? 0.3 : -0.1);
    const t = C.fromKey(k).getTime() + 7 * 3600e3;
    const weights = [{ id: 'w' + i, kg: lb * LB, t, tags: [], note: '' }];
    if (i % 4 === 0) weights.push({ id: 'e' + i, kg: (lb + 1.6) * LB, t: t + 13 * 3600e3, tags: [], note: '' });
    d[k] = { date: k, weights, foods: i < 10 ? [{ id: 'f' + i, t: C.fromKey(k).getTime() + 12 * 3600e3, meal: 'dinner', name: 'Meal', kcal: 1700, items: [], source: 'manual' }] : [], workouts: [], activity: i < 10 ? { steps: 9000, activeKcal: 400, source: 'manual', syncedAt: NOW } : null, planTicks: {}, updatedAt: 0 };
  }
  return d;
}
