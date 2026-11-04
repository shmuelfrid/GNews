/* Dev-only test data: ~13 weeks of history for "Sam" (212 → ~193.6 lb), today's meals, activity and workouts.
   Call seedDemoData() (Profile dev section, or on web: open with ?seed=1, or run momentumSeed() in the console). */
import { addDays, diffDays, fromKey, keyOf, LB } from './calc';
import { store } from './store';
import type { DayDoc } from './types';

export function seedDemoData(opts?: { now?: number }): void {
  const now = opts?.now ?? Date.now();
  const today = keyOf(now);
  const start = addDays(today, -91);
  const year = new Date(now).getFullYear();
  store.setProfile({
    name: 'Sam', sex: 'male', birthYear: year - 34, heightCm: 178, unit: 'lb', theme: store.getState().profile?.theme || 'system',
    startKg: 212 * LB, startDate: start, goalKg: 180 * LB, targetDate: addDays(today, 89), stepGoal: 10000, activityBaseline: 'some', celebrated: [],
  });
  const days: Record<string, Partial<DayDoc>> = {};
  for (let k = start; k <= today; k = addDays(k, 1)) {
    const n = diffDays(start, k);
    const lb = 212 - n * (18.6 / 91) + (n % 3 === 0 ? 0.3 : -0.1);
    const t = fromKey(k).getTime() + 7 * 3600e3 + (n % 5) * 60e3;
    days[k] = { date: k, weights: [{ id: 'seed-w' + n, kg: lb * LB, t, tags: ['Morning'], note: '' }], foods: [], workouts: [], activity: null, planTicks: {} };
  }
  const at = (k: string, h: number, m = 0) => fromKey(k).getTime() + (h * 60 + m) * 60e3;
  const eaten = [1500, 1400, 1650, 2600, 1300, 1200, 1550, 1700, 1450, 1800, 1500, 1350, 1600, 1900];
  for (let i = 1; i <= 14; i++) {
    const k = addDays(today, -i);
    const d = days[k]; if (!d) continue;
    d.activity = { steps: 7000 + (i * 733) % 5000, activeKcal: 320 + (i * 37) % 180, source: 'manual', syncedAt: now };
    const total = eaten[i - 1];
    d.foods = [
      { id: 'seed-b' + i, t: at(k, 8), meal: 'breakfast', name: 'Greek yogurt + berries', kcal: Math.round(total * 0.22), protein: 24, carbs: 30, fat: 6, items: [], source: 'manual' },
      { id: 'seed-l' + i, t: at(k, 12, 30), meal: 'lunch', name: 'Chicken burrito bowl', kcal: Math.round(total * 0.38), protein: 42, carbs: 70, fat: 18, items: [], source: 'manual' },
      { id: 'seed-d' + i, t: at(k, 19), meal: 'dinner', name: 'Salmon, rice and greens', kcal: total - Math.round(total * 0.22) - Math.round(total * 0.38), protein: 38, carbs: 55, fat: 22, items: [], source: 'manual' },
    ];
    if (i % 2 === 0) d.workouts = [{ id: 'seed-x' + i, t: at(k, 18), type: 'treadmill_walk', name: 'Treadmill walk', minutes: 35, kcal: 310, source: 'manual', countedInSamsung: false }];
  }
  const td = days[today]!;
  const h = new Date(now).getHours();
  td.foods = [
    { id: 'seed-tf1', t: at(today, Math.min(8, h), 0), meal: 'breakfast', name: 'Greek yogurt + granola', kcal: 320, protein: 22, carbs: 38, fat: 8, items: [{ name: 'Greek yogurt', portion: '200 g', kcal: 190 }, { name: 'Granola', portion: '30 g', kcal: 130 }], source: 'manual' },
    { id: 'seed-tf2', t: at(today, Math.min(12, h), 30), meal: 'lunch', name: 'Chicken burrito bowl', kcal: 680, protein: 45, carbs: 72, fat: 20, items: [], source: 'text' },
    { id: 'seed-tf3', t: at(today, Math.min(15, h), 0), meal: 'snacks', name: 'Apple + almonds', kcal: 210, protein: 6, carbs: 22, fat: 12, items: [], source: 'manual' },
  ];
  td.activity = { steps: 8420, activeKcal: 380, source: 'samsung-screenshot', syncedAt: now };
  td.workouts = [{ id: 'seed-tx1', t: at(today, Math.min(7, h), 0), type: 'treadmill_walk', name: 'Treadmill walk', minutes: 35, kcal: 310, source: 'manual', countedInSamsung: false }];
  store.importDays(days, { replace: true });
}

export function clearDemoData(): Promise<void> { return store.resetAll(); }
