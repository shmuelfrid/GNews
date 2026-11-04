import { describe, expect, it } from '@jest/globals';
import * as C from '@/lib/calc';
import { makeUnits } from '@/lib/format';
import { deficitCard, headline, milestoneList, patterns, rangeWindow, statTiles, weeklyCard, weightCard } from '../model';
import { days, NOW, profile, today } from './fixture';

const U = makeUnits('lb');
const D = days();
const a = C.weightAnalysis(profile, D, NOW);
const noNaN = (s: unknown) => expect(JSON.stringify(s)).not.toMatch(/NaN|undefined/);

describe('progress model', () => {
  it('headline tells last week\'s loss with goal progress', () => {
    const h = headline(a, U)!;
    expect(h.over).toMatch(/^Last week · /);
    expect(h.pre).toBe('You lost ');
    expect(h.num).toMatch(/^\d+\.\d lb$/);
    expect(h.frac).toBeGreaterThan(0.4);
    expect(h.frac).toBeLessThan(0.8);
    noNaN(h);
  });
  it('headline is null with no weigh-ins', () => {
    expect(headline(C.weightAnalysis(profile, {}, NOW), U)).toBeNull();
  });
  it('range windows', () => {
    expect(rangeWindow(a, '1W', today).from).toBe(C.addDays(today, -6));
    expect(rangeWindow(a, 'All', today).from).toBe(profile.startDate);
  });
  it('weight card: title, projection, goal', () => {
    const w = weightCard(a, '3M', U, today);
    expect(w.title).toMatch(/On pace for 180 lb by|to go to 180 lb/);
    expect(w.line.length).toBeGreaterThan(80);
    expect(w.sub).toMatch(/in the last 3 months/);
    const w1 = weightCard(a, '1W', U, today);
    expect(w1.projection).toHaveLength(0);
    noNaN({ ...w, tip: null });
  });
  it('deficit card: 30 bars, takeaway, compare', () => {
    const da = C.deficitAnalysis(profile, D, NOW, 30);
    const d = deficitCard(da, a, '3M', U);
    expect(d.empty).toBe(false);
    if (d.empty) return;
    expect(d.bars).toHaveLength(30);
    expect(d.bars[29].muted).toBe(true);
    expect(d.bars.filter(b => b.label).length).toBe(4);
    expect(d.title).toMatch(/^Under budget \d+ of \d+ days$/);
    expect(d.compare).not.toBeNull();
    const empty = deficitCard(C.deficitAnalysis(profile, {}, NOW, 7), a, '1W', U);
    expect(empty.empty).toBe(true);
  });
  it('stats include BMI tile and at most sensible values', () => {
    const tiles = statTiles(a, C.deficitAnalysis(profile, D, NOW, 30), profile as any, U, C.currentKg(profile, D), today);
    expect(tiles.find(t => t.label === 'BMI')?.bmi?.key).toBe('over');
    expect(tiles.find(t => t.label === 'Total lost')).toBeTruthy();
    noNaN(tiles);
  });
  it('weekly, patterns and milestones', () => {
    const w = weeklyCard(a, U);
    expect(w.empty).toBe(false);
    if (!w.empty) { expect(w.bars.length).toBeGreaterThanOrEqual(13); expect(w.title).toMatch(/^Down \d+ of the last \d+ weeks$/); }
    const p = patterns(a, U)!;
    expect(p.rows.some(r => /Evenings run/.test(r.title))).toBe(true);
    const ms = milestoneList(a, U, false)!;
    expect(ms.items).toHaveLength(4);
    expect(milestoneList(a, U, true)!.items.length).toBe(ms.total);
    noNaN(ms.items.map(i => i.sub));
  });
});
