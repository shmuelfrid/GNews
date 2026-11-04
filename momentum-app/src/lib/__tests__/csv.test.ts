// @ts-nocheck -- port of the parser assertions in weight-tracker/tests/activity.test.js
import fs from 'fs';
import path from 'path';
import { parseSamsung, parseAppCSV, toAppCSV } from '../csv';
process.env.TZ = 'America/New_York';
const FIX = path.join(__dirname, 'fixtures', 'samsung');
const files = fs.readdirSync(FIX).map(f => ({ name: f, text: fs.readFileSync(path.join(FIX, f), 'utf8') }));

describe('Samsung export parser', () => {
  const parsed = parseSamsung(files);
  test('6 days', () => expect(Object.keys(parsed.days).length).toBe(6));
  test('aggregate (source -2) row wins', () => expect(parsed.days['2026-10-28'].steps).toBe(9120));
  test('kcal + distance (m→km)', () => { expect(parsed.days['2026-10-28'].activeKcal).toBe(402); expect(parsed.days['2026-10-28'].distanceKm).toBe(6.95); });
  test('day_summary calorie + active_time win', () => { expect(parsed.days['2026-11-02'].activeKcal).toBe(628); expect(parsed.days['2026-11-02'].activeMinutes).toBe(60); });
  test('3 exercise rows', () => expect(parsed.workouts.length).toBe(3));
  test('exercise fields', () => {
    const w1 = parsed.workouts.find(w => w.id === 'sh-ex-uuid-1');
    expect(w1).toMatchObject({ type: 'walk', minutes: 35, kcal: 311, distanceKm: 3.3, avgHr: 128, countedInSamsung: true, t: Date.UTC(2026, 10, 1, 22, 5) });
  });
  test('quoted start_time + strength code', () => expect(parsed.workouts.some(w => w.type === 'strength' && w.kcal === 180)).toBe(true));
  test('unrelated file skipped', () => expect(parsed.files.skipped.length).toBe(1));
});

describe('app CSV round-trip', () => {
  test('export then import keeps entries', () => {
    const t = new Date(2026, 10, 3, 7, 12).getTime();
    const days = { '2026-11-03': { date: '2026-11-03', weights: [{ id: 'w1', kg: 87.8, t, tags: ['Morning'], note: 'hi, "there"' }], foods: [{ id: 'f1', t, meal: 'breakfast', name: 'Eggs, toast', kcal: 420, protein: 20, items: [], source: 'text' }], workouts: [{ id: 'x1', t, type: 'run', minutes: 30, kcal: 300, source: 'manual', countedInSamsung: false }], activity: { steps: 8000, activeKcal: 350, source: 'manual', syncedAt: 1 }, planTicks: {}, updatedAt: 1 } };
    const r = parseAppCSV(toAppCSV(days));
    expect(r.weights[0]).toMatchObject({ id: 'w1', kg: 87.8, t, tags: ['Morning'], note: 'hi, "there"' });
    expect(r.foods[0]).toMatchObject({ id: 'f1', name: 'Eggs, toast', kcal: 420, protein: 20, meal: 'breakfast' });
    expect(r.workouts[0]).toMatchObject({ id: 'x1', type: 'run', minutes: 30, kcal: 300 });
    expect(r.activity['2026-11-03']).toMatchObject({ steps: 8000, activeKcal: 350 });
  });
  test('simple weight log in lb', () => {
    const r = parseAppCSV('date,weight\n2026-11-01,200\nbad,1\n', 'lb');
    expect(r.weights.length).toBe(1); expect(r.skipped).toBe(1);
    expect(Math.abs(r.weights[0].kg - 90.718)).toBeLessThan(0.01);
  });
});
