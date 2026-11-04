import { describe, expect, test } from '@jest/globals';
import { atMinFactor, bake, fmtQty, itemTotals, mealHints, nextFactor, parsePortion, reviewTotal, scaledPortion, withKcal, type ReviewItem } from '../portion';

const item = (portion: string, kcal: number, f = 1): ReviewItem => ({ key: 'k', name: 'x', portion, f, base: { kcal, protein: 10, carbs: null, fat: 2 } });

describe('portion parsing', () => {
  test('parses numbers, fractions and unicode fractions', () => {
    expect(parsePortion('4 oz')).toEqual({ q: 4, unit: 'oz' });
    expect(parsePortion('1/2 cup')).toEqual({ q: 0.5, unit: 'cup' });
    expect(parsePortion('½ cup')).toEqual({ q: 0.5, unit: 'cup' });
    expect(parsePortion('2 slices')).toEqual({ q: 2, unit: 'slice' });
    expect(parsePortion('1,5 cups')!.q).toBe(1.5);
    expect(parsePortion('2-3 slices')).toBeNull();
    expect(parsePortion('a bowl')).toBeNull();
  });
  test('formats quantities', () => {
    expect(fmtQty(0.75)).toBe('¾');
    expect(fmtQty(1.5)).toBe('1½');
    expect(fmtQty(12.4)).toBe('12');
    expect(fmtQty(1.3)).toBe('1.3');
  });
  test('scales and re-pluralises', () => {
    expect(scaledPortion('4 oz', 1.5)).toBe('6 oz');
    expect(scaledPortion('1 cup', 2)).toBe('2 cups');
    expect(scaledPortion('1 sandwich', 2)).toBe('2 sandwiches');
    expect(scaledPortion('a bowl', 2)).toBe('2 × a bowl');
    expect(scaledPortion('', 1)).toBe('1 serving');
  });
  test('steps through visible quantities', () => {
    expect(scaledPortion('½ cup', nextFactor({ portion: '½ cup', f: 1 }, 1))).toBe('¾ cup');
    expect(nextFactor({ portion: '4 oz', f: 1 }, 1)).toBe(5 / 4);
    expect(nextFactor({ portion: '¼ cup', f: 1 }, -1)).toBe(1);
    expect(atMinFactor({ portion: '¼ cup', f: 1 })).toBe(true);
    expect(nextFactor({ portion: '100 g', f: 1 }, 1)).toBe(1.25);
    expect(nextFactor({ portion: 'a bowl', f: 1 }, 1)).toBe(1.5);
    expect(nextFactor({ portion: 'a bowl', f: 0.25 }, -1)).toBe(0.25);
  });
});

describe('review totals', () => {
  test('kcal and macros scale with factor', () => {
    const it = item('1 cup', 200, 1.5);
    expect(itemTotals(it)).toEqual({ kcal: 300, protein: 15, carbs: null, fat: 3 });
    const t = reviewTotal([it, item('1', 100)]);
    expect(t.kcal).toBe(400);
    expect(t.protein).toBe(25);
    expect(t.hasMacros).toBe(true);
  });
  test('bake freezes the factor; withKcal rescales macros', () => {
    const b = bake(item('1 cup', 200, 2));
    expect(b.f).toBe(1); expect(b.portion).toBe('2 cups'); expect(b.base.kcal).toBe(400); expect(b.base.protein).toBe(20);
    const w = withKcal(item('1 cup', 200), 100);
    expect(w.base.kcal).toBe(100); expect(w.base.protein).toBe(5);
  });
  test('meal hints split remaining budget across empty meals', () => {
    const h = mealHints({ breakfast: 1, lunch: 1, dinner: 0, snacks: 0 }, 400);
    expect(h).toEqual({ dinner: 300, snacks: 100 });
    expect(mealHints({ breakfast: 0, lunch: 0, dinner: 0, snacks: 0 }, -50).dinner).toBe(0);
  });
});
