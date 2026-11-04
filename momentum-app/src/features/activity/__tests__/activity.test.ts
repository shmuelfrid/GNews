import { describe, expect, it } from '@jest/globals';
import { addDays } from '@/lib/calc';
import type { DayDoc } from '@/lib/types';
import {
  buildActivity, filterExport, joinNote, kcalPerMinFor, overlapping, splitNote, validateActivity, weekData, weekSummary,
} from '../model';

const emptyDay = (key: string): DayDoc => ({ date: key, weights: [], foods: [], workouts: [], activity: null, planTicks: {}, updatedAt: 0 });
const int = (n: number) => Math.round(n).toLocaleString('en-US');
const keyOf = (t: number) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

describe('treadmill note round-trip', () => {
  it('joins and splits speed / incline / note', () => {
    const n = joinNote('treadmill_walk', 3.5, 5, 'felt good', 'mph');
    expect(n).toBe('3.5 mph · 5% incline · felt good');
    expect(splitNote(n)).toEqual({ speed: 3.5, unit: 'mph', incline: 5, note: 'felt good' });
  });
  it('ignores speed for non-treadmill types and keeps plain notes', () => {
    expect(joinNote('run', 6, 1, ' tempo ', 'mph')).toBe('tempo');
    expect(splitNote('just a note')).toEqual({ speed: null, unit: null, incline: null, note: 'just a note' });
  });
});

describe('kcal estimate', () => {
  it('uses ACSM walking equation for treadmill walk (3.5 mph, 5%, 90 kg)', () => {
    const v = kcalPerMinFor({ type: 'treadmill_walk', speed: 3.5, incline: 5 }, 90, 'mph');
    // m = 93.88 m/min; vo2 = 9.388 + 8.449 + 3.5 = 21.34 → ×90/1000×5 ≈ 9.6
    expect(v).toBeCloseTo(9.6, 1);
    // same speed in km/h gives the same answer
    expect(kcalPerMinFor({ type: 'treadmill_walk', speed: 3.5 * 1.609344, incline: 5 }, 90, 'km/h')).toBeCloseTo(v, 5);
  });
  it('intensity scales MET-based types', () => {
    const mod = kcalPerMinFor({ type: 'strength', intensity: 'moderate' }, 80, 'mph');
    expect(kcalPerMinFor({ type: 'strength', intensity: 'hard' }, 80, 'mph')).toBeCloseTo(mod * 1.2, 5);
  });
});

describe('week summary', () => {
  const today = '2026-11-03';
  const days: Record<string, DayDoc> = {};
  const mk = (k: string, active: number, wk = 0, counted = false) => {
    const d = emptyDay(k);
    d.activity = { activeKcal: active, steps: 8000, source: 'manual', syncedAt: 1 };
    if (wk) d.workouts = [{ id: 'w' + k, t: Date.parse(k + 'T18:00:00'), type: 'run', minutes: 30, kcal: wk, source: 'manual', countedInSamsung: counted }];
    days[k] = d;
  };
  mk(addDays(today, -3), 400, 300);       // 700
  mk(addDays(today, -2), 450, 500, true); // counted → 450
  mk(addDays(today, -1), 350);
  mk(today, 200);
  const wk = weekData(k => days[k] || emptyDay(k), today, 80);
  it('never adds workouts already counted in Samsung Health', () => {
    expect(wk.find(d => d.key === addDays(today, -2))!.total).toBe(450);
    expect(wk.find(d => d.key === addDays(today, -3))!.total).toBe(700);
  });
  it('titles the most active day and compares today to the average', () => {
    const s = weekSummary(wk, today, () => 'Saturday', int);
    expect(s.avg).toBe(500);
    expect(s.bestKey).toBe(addDays(today, -3));
    expect(s.title).toBe('Most active: Saturday, 700 kcal');
    expect(s.takeaway?.bold).toBe('300 kcal below');
  });
  it('empty week', () => {
    const s = weekSummary(weekData(k => emptyDay(k), today, 80), today, () => 'x', int);
    expect(s.any).toBe(false);
    expect(s.takeaway).toBeNull();
  });
});

describe('export filter', () => {
  it('limits to the range and averages', () => {
    const today = '2026-11-03';
    const r = {
      days: { [today]: { steps: 1000, activeKcal: 100 }, [addDays(today, -5)]: { steps: 3000 }, [addDays(today, -40)]: { steps: 9000, activeKcal: 500 } },
      workouts: [{ t: Date.parse(addDays(today, -1) + 'T10:00:00'), kcal: 200 }, { t: Date.parse(addDays(today, -50) + 'T10:00:00'), kcal: 200 }],
    };
    const s7 = filterExport(r, '7', today, keyOf);
    expect(s7.dayCount).toBe(2);
    expect(s7.avgSteps).toBe(2000);
    expect(s7.avgKcal).toBe(100);
    expect(s7.workouts).toHaveLength(1);
    expect(filterExport(r, 'all', today, keyOf).dayCount).toBe(3);
  });
});

describe('double-count guard + manual activity', () => {
  it('matches a manual workout to an overlapping Health Connect session', () => {
    const t = Date.parse('2026-11-03T07:00:00');
    expect(overlapping({ t: t + 10 * 60000, countedInSamsung: false, source: 'manual' }, { t })).toBe(true);
    expect(overlapping({ t: t + 90 * 60000, countedInSamsung: false, source: 'manual' }, { t })).toBe(false);
    expect(overlapping({ t, countedInSamsung: true, source: 'manual' }, { t })).toBe(false);
  });
  it('validates and builds activity', () => {
    expect(validateActivity({ steps: null, activeKcal: null }).steps).toMatch(/steps, active calories/);
    expect(validateActivity({ steps: 300000, activeKcal: null }).steps).toMatch(/200,000/);
    expect(validateActivity({ steps: 5000, activeKcal: null })).toEqual({});
    expect(buildActivity({ steps: 5000.4, activeKcal: null, totalKcal: 2500, distanceKm: 0 }, 'manual', 5)).toEqual({ source: 'manual', syncedAt: 5, steps: 5000 });
    expect(buildActivity({ steps: 5000, activeKcal: 300, totalKcal: 2500 }, 'samsung-screenshot', 5)).toMatchObject({ totalKcal: 2500, activeKcal: 300 });
  });
});
