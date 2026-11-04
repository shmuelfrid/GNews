import { describe, expect, it } from '@jest/globals';
import { finishPatch, heightCm, initDraft, preview, switchUnit, validate, weightNotes, type Draft } from '../model';

const NOW = new Date(2026, 10, 3, 9, 0).getTime();
const base = (): Draft => ({ ...initDraft(null, null, NOW), sex: 'male', age: '34', ft: '5', inch: '10', weight: '212', goal: '180' });

describe('onboarding model', () => {
  it('validates step 1 and 2', () => {
    expect(validate({ ...initDraft(null, null, NOW), step: 1 }, NOW)).toMatchObject({ sex: expect.any(String), age: expect.any(String), height: expect.any(String) });
    expect(validate({ ...base(), step: 1 }, NOW)).toEqual({});
    expect(validate({ ...base(), step: 2, goal: '212.2' }, NOW).goal).toMatch(/0.5 lb/);
  });
  it('converts units both ways', () => {
    const d = switchUnit(base(), 'kg');
    expect(d.unit).toBe('kg');
    expect(+d.weight).toBeCloseTo(96.2, 1);
    expect(+d.cm).toBe(178);
    expect(heightCm(switchUnit(d, 'lb'))).toBeCloseTo(177.8, 0);
  });
  it('preview + finish produce a complete profile', () => {
    const d = { ...base(), step: 3 as const };
    const pv = preview(d, NOW)!;
    expect(pv.bmr).toBeGreaterThan(1500);
    expect(pv.pl.kgPerWeek).toBeGreaterThan(0);
    const r = finishPatch(d, null, false, NOW)!;
    expect(r.patch.sex).toBe('male');
    expect(r.patch.birthYear).toBe(1992);
    expect(r.patch.startDate).toBe('2026-11-03');
    expect(r.patch.paceKgPerWeek).toBeGreaterThan(0);
    expect(r.kg).toBeCloseTo(96.16, 1);
  });
  it('flags too-low goal', () => {
    expect(weightNotes({ ...base(), goal: '110' }).lowGoal).toMatch(/lb/);
    expect(weightNotes(base()).amount).toBe('32 lb to lose');
  });
});
