import { describe, expect, it } from '@jest/globals';
import * as C from '@/lib/calc';
import { makeUnits } from '@/lib/format';
import { climbLayout } from '../climbLayout';
import { climbData, heroCenters, heroModel, planTasks, weekModel } from '../model';

const LB = C.LB;
const NOW = new Date(2026, 10, 3, 18, 0).getTime();
const today = C.keyOf(NOW);
const profile = { name: 'Sam', sex: 'male' as const, birthYear: 1992, heightCm: 178, unit: 'lb' as const, startKg: 212 * LB, startDate: C.addDays(today, -60), goalKg: 180 * LB, stepGoal: 10000, celebrated: [] };
function days() {
  const d: Record<string, any> = {};
  for (let i = 60; i >= 0; i--) {
    const k = C.addDays(today, -i);
    d[k] = { date: k, weights: [{ id: 'w' + i, kg: (212 - (60 - i) * 0.2) * LB, t: C.fromKey(k).getTime() + 7 * 3600e3, tags: [], note: '' }], foods: i < 7 ? [{ id: 'f' + i, t: C.fromKey(k).getTime() + 12 * 3600e3, meal: 'dinner', name: 'Meal', kcal: 1600, items: [], source: 'manual' }] : [], workouts: [], activity: { steps: 9000, activeKcal: 400, source: 'manual', syncedAt: NOW }, planTicks: {}, updatedAt: 0 };
  }
  return d;
}

describe('today model', () => {
  const D = days();
  const b = C.balance(profile, D, today, NOW);
  const h = heroModel(profile, b, C.todayActions(b));
  it('hero numbers are finite and centre text never NaN', () => {
    expect(h.stepGoal).toBe(10000);
    expect(h.steps).toBe(9000);
    expect(h.moveGoal).toBeGreaterThanOrEqual(50);
    const c = heroCenters(b, h);
    Object.values(c).forEach(x => { expect(x.big).not.toMatch(/NaN|–/); expect(x.unit.length).toBeGreaterThan(0); });
  });
  it('week strip has 7 cells ending today', () => {
    const w = weekModel(C.deficitAnalysis(profile, D, NOW, 7));
    expect(w.cells).toHaveLength(7);
    expect(w.cells[6].today).toBe(true);
    expect(w.cells[6].label).toBe('Today');
    expect(w.title).toMatch(/of the last 6 days|of 6 logged days/);
  });
  it('plan ticks: auto from data, manual override from day.planTicks', () => {
    const day = { ...D[today], planTicks: { steps: true, weigh: false } };
    const t = planTasks(b, h, day, NOW);
    expect(t.map(x => x.id)).toEqual(['eat', 'move', 'steps', 'weigh']);
    expect(t.find(x => x.id === 'steps')!.done).toBe(true);
    expect(t.find(x => x.id === 'weigh')!.done).toBe(false);
    expect(planTasks(b, h, D[today], NOW).find(x => x.id === 'weigh')!.done).toBe(true);
  });
  it('climb places passed flags behind you and lays out inside the map', () => {
    const a = C.weightAnalysis(profile, D, NOW);
    const U = makeUnits('lb');
    const cd = climbData(profile, a, C.headlines(profile, D, NOW), U, today);
    expect(cd.valid).toBe(true);
    expect(cd.f).toBeGreaterThan(0.3);
    expect(cd.flags.some(f => f.passed)).toBe(true);
    expect(cd.flags.filter(f => f.passed).every(f => f.frac <= cd.f + 1e-6)).toBe(true);
    [280, 350, 720].forEach(w => {
      const L = climbLayout(cd, w, U, today);
      expect(L.W).toBe(Math.max(280, w));
      L.pills.forEach(p => { expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x + p.w).toBeLessThanOrEqual(L.W); });
      expect(L.targets.map(x => x.id)).toEqual(expect.arrayContaining(['start', 'you', 'goal']));
      expect(L.trail).not.toMatch(/NaN/);
    });
  });
});
