import { describe, expect, it } from '@jest/globals';
import * as C from '@/lib/calc';
import { makeUnits } from '@/lib/format';
import { build, catOf, crossings, milestoneCard, niceTarget, parseWaist, rangeCard, trendView, waistRow, type BmiOk } from '../model';
import { days, LB, NOW, profile, today } from '../../progress/__tests__/fixture';

const U = makeUnits('lb');
const D = days();
const a = C.weightAnalysis(profile, D, NOW);
const kg = C.currentKg(profile, D)!;
const pl = C.balance(profile, D, today, NOW).plan;

describe('bmi model', () => {
  it('classifies the displayed value', () => {
    expect(catOf(24.96)!.key).toBe('over');
    expect(catOf(24.94)!.key).toBe('healthy');
    expect(catOf(18.45)!.key).toBe('healthy');
  });
  it('empty states', () => {
    expect(build({ ...profile, heightCm: undefined } as any, kg, pl, a, today).state).toBe('no-height');
    expect(build(profile as any, null, pl, a, today).state).toBe('no-weight');
  });
  const m = build(profile as any, kg, pl, a, today) as BmiOk;
  it('range card: distance, weeks, goal above range → Set goal to 174 lb', () => {
    expect(m.state).toBe('ok');
    expect(m.cat.key).toBe('over');
    const rc = rangeCard(m, U);
    expect(rc.range).toBe('129–174');
    expect(rc.body.join('')).toMatch(/from the healthy range — about \d+ weeks at your plan pace/);
    expect(rc.setGoal!.label).toBe('Set goal to 174 lb');
    expect(catOf(C.bmi(rc.setGoal!.kg, 178))!.key).toBe('healthy');
  });
  it('milestone: crossed from obese to overweight', () => {
    expect(m.crossings.some(c => c.from.key === 'obese' && c.to.key === 'over')).toBe(true);
    const mc = milestoneCard(m, U);
    expect(mc.title.join('')).toMatch(/You moved from Obese to Overweight on/);
    expect(mc.foot).toMatch(/^Next: healthy BMI at 174 lb$/);
  });
  it('trend view + projection to healthy', () => {
    const tv = trendView(m, 'All');
    expect(tv.proj?.label).toBe('healthy');
    expect(tv.title).toMatch(/^Down \d\.\d points$/);
    expect(trendView(m, '1M').proj).toBeNull();
  });
  it('niceTarget stays inside the range; waist', () => {
    expect(Math.round(niceTarget(C.weightForBmi(24.9, 178)!, 'max', 178, U) / LB)).toBe(174);
    expect(parseWaist('34', U)).toBeCloseTo(86.4, 1);
    expect(parseWaist('5', U)).toBeNaN();
    expect(waistRow({ ...profile, waistCm: 86 } as any, 178, U).good).toBe(true);
    expect(crossings([])).toEqual([]);
  });
});
