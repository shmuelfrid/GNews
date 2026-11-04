import { describe, expect, it } from '@jest/globals';
import * as C from '@/lib/calc';
import { makeUnits } from '@/lib/format';
import { chartData, everyDay, fieldErrors, goalText, initDraft, planModel, safety, scenarios, takes } from '../model';
import { days, NOW, profile, today } from '../../progress/__tests__/fixture';

const U = makeUnits('lb');
const D = days();
const a = C.weightAnalysis(profile, D, NOW);
const bal = C.balance(profile, D, today, NOW);
const kg = C.currentKg(profile, D);
const mk = (goal: string, date: string) => planModel(profile as any, { goal, date }, kg, bal.bmr, bal.plan.typicalBurn, a, U, today, NOW);

describe('plan model', () => {
  it('draft starts from the saved profile', () => {
    const d = initDraft(profile as any, bal.plan, U, today);
    expect(d.goal).toBe('180');
    expect(d.date).toBe(profile.targetDate);
    expect(mk(d.goal, d.date).dirty).toBe(false);
  });
  it('goal text, takes and every-day numbers', () => {
    const m = mk('180', profile.targetDate);
    const g = goalText(m, U);
    expect(g.goalTxt).toBe('180');
    expect(g.meta).toMatch(/lb to go · 89 days left/);
    expect(g.takeaway).toMatch(/At your recent pace/);
    const tk = takes(m, U);
    expect(+tk.perWeek).toBeGreaterThan(0.5);
    const ev = everyDay(m, U);
    expect(ev.kind).toBe('eat');
    if (ev.kind === 'eat') { expect(ev.alt?.moves).toHaveLength(3); expect(ev.budget).toMatch(/^\d/); }
    expect(scenarios(m, U)).toHaveLength(3);
    const cd = chartData(m, U)!;
    expect(cd.need?.key).toBe(profile.targetDate);
    expect(cd.trend.length).toBeGreaterThan(50);
  });
  it('flags a too-fast date and offers a safer one; edits are dirty', () => {
    const m = mk('170', C.addDays(today, 21));
    expect(m.dirty).toBe(true);
    const s = safety(m, U)!;
    expect(s.text).toMatch(/more than 1% of your body weight|minimum/);
    expect(s.safeDate! > C.addDays(today, 21)).toBe(true);
  });
  it('validates inputs', () => {
    const m = mk('12', C.addDays(today, -1));
    expect(m.goalOk).toBe(false);
    const e = fieldErrors(m, U);
    expect(e.goal).toMatch(/Enter a weight between/);
    expect(e.date).toBe('Pick a date after today.');
    expect(goalText(m, U).takeaway).toMatch(/Pick a target weight/);
  });
});
