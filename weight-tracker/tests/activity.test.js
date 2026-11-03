/* Activity screen + workout / Samsung sheets — Playwright test.
   Run: node tests/activity.test.js [screenshotDir]
   Covers: empty + seeded states at 360/390/1440 light+dark, no overflow, no NaN/undefined,
   workout photo (mock AI) + form + edit/delete/undo, Samsung screenshot (mock AI), export CSV parser
   (fixtures in tests/fixtures/samsung), manual entry, zero console errors. */
'use strict';
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const FIX = path.resolve(__dirname, 'fixtures', 'samsung');
const OUT = process.argv[2] || null;
if (OUT) fs.mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (c, m) => { if (c) console.log('  ok  ' + m); else { failures++; console.log('  FAIL ' + m); } };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGNgYGD4z0AswK4SAFXuAf8EPy+xAAAAAElFTkSuQmCC', 'base64');

const LB = 0.45359237;
function seed(full) {
  const now = new Date();
  const key = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const dayOff = n => { const d = new Date(now); d.setDate(d.getDate() - n); return d; };
  const at = (n, h, m) => { const d = dayOff(n); d.setHours(h, m, 0, 0); return d.getTime(); };
  const days = {};
  const mk = n => { const k = key(dayOff(n)); return days[k] || (days[k] = { date: k, weights: [], foods: [], workouts: [], activity: null, updatedAt: 1 }); };
  const profile = { name: 'Sam', sex: 'male', birthYear: now.getFullYear() - 34, heightCm: 178, unit: 'lb', theme: 'system', startKg: 212 * LB, startDate: key(dayOff(91)), goalKg: 180 * LB, targetDate: key(dayOff(-89)), stepGoal: 10000, createdAt: 1, updatedAt: 1, celebrated: [] };
  for (let i = 30; i >= 0; i--) mk(i).weights.push({ id: 'w' + i, kg: (193.6 + i * 0.15) * LB, t: at(i, 7, 12), tags: ['Morning'], note: '' });
  if (full) {
    const act = [410, 560, 330, 180, 470, 720, 380];
    const steps = [9120, 11240, 6310, 3480, 10050, 12890, 8420];
    for (let i = 6; i >= 0; i--) mk(i).activity = { steps: steps[6 - i], activeKcal: act[6 - i], source: 'samsung-screenshot', syncedAt: i === 0 ? at(0, 14, 14) : at(i, 22, 0) };
    mk(0).workouts.push({ id: 'wo1', t: at(0, 6, 30), type: 'treadmill_walk', name: 'Treadmill walk', minutes: 35, kcal: 310, note: '3.5 mph · 5% incline', source: 'manual', countedInSamsung: false });
    mk(0).workouts.push({ id: 'wo2', t: at(0, 12, 5), type: 'run', name: 'Outdoor run with a very long descriptive name from the watch', minutes: 28, kcal: 342, distanceKm: 5.0, avgHr: 152, source: 'photo', countedInSamsung: true });
    mk(1).workouts.push({ id: 'wo3', t: at(1, 18, 0), type: 'strength', name: 'Strength', minutes: 40, kcal: 220, source: 'manual', countedInSamsung: false });
    mk(0).foods.push({ id: 'f1', t: at(0, 7, 40), meal: 'breakfast', name: 'Greek yogurt', kcal: 320, items: [], source: 'manual' });
    mk(0).foods.push({ id: 'f2', t: at(0, 12, 30), meal: 'lunch', name: 'Burrito bowl', kcal: 1500, items: [], source: 'manual' });
  }
  return { v: 2, profile, days, syncedDays: [], migratedV1: true };
}

const MOCK = () => {
  const workout = { type: 'run', name: 'Outdoor run', minutes: 28.7, kcal: 342, distanceKm: 5.0, avgHr: 152, date: null, time: '18:05', confidence: 'high', note: '' };
  const samsung = { date: null, steps: 8420, activeKcal: 380, totalKcal: 2210, activeMinutes: 62, distanceKm: 6.3, workouts: [{ type: 'walk', minutes: 35, kcal: 180 }], confidence: 'high', note: '' };
  const sample = {
    json: async (prompt) => { await new Promise(r => setTimeout(r, 350)); return /Samsung Health/.test(prompt) ? samsung : workout; },
    limits: async () => ({ images: { mediaTypes: ['image/jpeg', 'image/png', 'image/webp'] } })
  };
  window.claude = { use: async n => n === 'sample' ? sample : null };
};

(async () => {
  const browser = await chromium.launch();
  const sizes = [[360, 780, 'xs'], [390, 844, 'phone'], [1440, 900, 'desk']];
  const errors = [];
  async function newPage(w, h, scheme, data, ai) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|net::ERR/.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', e => errors.push(String(e)));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    if (ai) await page.addInitScript(MOCK);
    await page.addInitScript(d => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('momentum.v2', JSON.stringify(d)); sessionStorage.setItem('seeded', '1'); } }, data);
    await page.goto(URL + '#activity');
    await page.waitForTimeout(500);
    return { page, ctx };
  }
  const check = async (page, tag) => {
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(ov <= 0, tag + ' no horizontal overflow (' + ov + ')');
    const txt = await page.evaluate(() => document.body.innerText);
    ok(!/NaN|undefined|Invalid Date|\[object/.test(txt), tag + ' no NaN/undefined text');
    // nothing clipped: text elements wider than their box
    const clipped = await page.evaluate(() => Array.from(document.querySelectorAll('.act-view *, .act-sheet *')).filter(e => {
      if (!e.offsetParent || e.children.length) return false;
      const cs = getComputedStyle(e); if (cs.overflow === 'visible' && e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0 && cs.display !== 'inline') return true;
      const r = e.getBoundingClientRect(); return r.right > window.innerWidth + 1;
    }).map(e => e.className + ':' + e.textContent.slice(0, 30)).slice(0, 5));
    ok(!clipped.length, tag + ' no clipped/overflowing text ' + (clipped.length ? JSON.stringify(clipped) : ''));
  };

  // 1. screens: empty + full, all sizes, light + dark
  for (const full of [false, true]) for (const scheme of ['light', 'dark']) for (const [w, h, tag] of sizes) {
    const name = (full ? 'full' : 'empty') + '-' + tag + '-' + scheme;
    console.log('\n' + name);
    const { page, ctx } = await newPage(w, h, scheme, seed(full), true);
    ok(await page.$('.act-view') != null, name + ' renders');
    await check(page, name);
    if (OUT) await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true });
    await ctx.close();
  }

  // 2. flows (phone, light)
  console.log('\nflows');
  const { page, ctx } = await newPage(390, 844, 'light', seed(true), true);
  await page.evaluate(() => M.ai.ready);
  await page.evaluate(() => M.render()); await page.waitForTimeout(200);

  // 2a. workout photo
  await page.click('.act-add');
  await page.waitForSelector('.layer.open .act-drop');
  let fc = page.waitForEvent('filechooser');
  await page.click('.layer.open .act-drop');
  await (await fc).setFiles({ name: 'watch.png', mimeType: 'image/png', buffer: PNG });
  await page.waitForSelector('.layer.open .thinking');
  if (OUT) await page.screenshot({ path: path.join(OUT, 'sheet-workout-thinking.png') });
  await page.waitForSelector('.layer.open #wp-kcal', { timeout: 5000 });
  ok((await page.inputValue('#wp-kcal')) === '342', 'photo kcal extracted');
  ok((await page.inputValue('#wp-min')) === '29', 'photo minutes extracted');
  ok(/342 kcal workout/.test(await page.textContent('.layer.open [data-slot="cta"]')), 'photo CTA shows kcal');
  await page.waitForTimeout(350);
  await check(page, 'sheet photo review');
  if (OUT) await page.screenshot({ path: path.join(OUT, 'sheet-workout-review.png') });
  await page.click('.layer.open .act-counted .toggle');
  ok(/Save workout/.test(await page.textContent('.layer.open [data-slot="cta"]')), 'counted toggle changes CTA');
  ok(/won’t add/.test(await page.textContent('.layer.open [data-slot="counted-help"]')), 'double-count helper text');
  const before = await page.evaluate(() => M.data.balance().burnSoFar);
  await page.click('.layer.open [data-w="save"]');
  await page.waitForTimeout(400);
  const wo = await page.evaluate(() => M.store.allWorkouts().filter(w => w.source === 'photo' && w.kcal === 342 && w.id !== 'wo2'));
  ok(wo.length === 1 && wo[0].countedInSamsung === true && wo[0].avgHr === 152, 'photo workout saved, counted in Samsung');
  ok(await page.evaluate(b => M.data.balance().burnSoFar === b, before), 'counted workout not added to burn');

  // 2b. form + estimate
  await page.click('.act-add');
  await page.waitForSelector('.layer.open .act-mode');
  await page.click('.layer.open [data-mode="form"]');
  await page.click('.layer.open [data-type="treadmill_walk"]');
  await page.fill('#wf-min', '35');
  await page.waitForTimeout(100);
  const est = +(await page.inputValue('#wf-kcal'));
  ok(est > 250 && est < 400, 'treadmill estimate plausible (' + est + ')');
  await page.click('.layer.open [data-w="more"]');
  await page.waitForTimeout(350);
  await check(page, 'sheet form');
  if (OUT) await page.screenshot({ path: path.join(OUT, 'sheet-workout-form.png') });
  await page.click('.layer.open [data-type="cycling"]');
  await page.click('.layer.open [data-int="hard"]');
  const est2 = +(await page.inputValue('#wf-kcal'));
  ok(est2 > 0 && est2 !== est, 'cycling hard estimate (' + est2 + ')');
  await page.fill('#wf-kcal', '400');
  ok(/400 kcal workout/.test(await page.textContent('.layer.open [data-slot="cta"]')), 'manual kcal updates CTA');
  const b2 = await page.evaluate(() => M.data.balance().burnSoFar);
  await page.click('.layer.open [data-w="save"]');
  await page.waitForTimeout(400);
  ok(await page.evaluate(b => M.data.balance().burnSoFar === b + 400, b2), 'form workout adds 400 to burn');

  // 2c. edit + delete + undo
  await page.click('[data-act-edit="wo1"]');
  await page.waitForSelector('.layer.open #wf-speed');
  ok((await page.inputValue('#wf-speed')) === '3.5' && (await page.inputValue('#wf-incline')) === '5', 'edit restores speed/incline from note');
  await page.waitForTimeout(350);
  if (OUT) await page.screenshot({ path: path.join(OUT, 'sheet-workout-edit.png') });
  await page.click('.layer.open [data-w="delete"]');
  await page.waitForSelector('.dialog-card');
  await page.click('.dialog-card [data-a="1"]');
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => !M.store.findItem('workouts', 'wo1')), 'workout deleted');
  await page.click('.toast-act');
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => !!M.store.findItem('workouts', 'wo1')), 'undo restores workout');

  // 2d. Samsung screenshot
  await page.click('.act-sam [data-sheet-opts*="screenshot"]');
  await page.waitForSelector('.layer.open .act-drop');
  await page.waitForTimeout(350);
  if (OUT) await page.screenshot({ path: path.join(OUT, 'sheet-samsung-pick.png') });
  fc = page.waitForEvent('filechooser');
  await page.click('.layer.open .act-drop');
  await (await fc).setFiles({ name: 'shot.png', mimeType: 'image/png', buffer: PNG });
  await page.waitForSelector('.layer.open #sm-steps', { timeout: 5000 });
  ok((await page.inputValue('#sm-steps')) === '8420' && (await page.inputValue('#sm-active')) === '380', 'screenshot values extracted');
  await check(page, 'sheet samsung review');
  if (OUT) await page.screenshot({ path: path.join(OUT, 'sheet-samsung-review.png'), fullPage: false });
  await page.fill('#sm-steps', '9001');
  await page.click('.layer.open [data-s="save"]');
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => { const a = M.store.getDay(M.util.todayKey()).activity; return a.steps === 9001 && a.activeKcal === 380 && a.source === 'samsung-screenshot'; }), 'screenshot activity saved');
  ok(await page.evaluate(() => M.store.allWorkouts().some(w => /^shs-/.test(w.id) && w.countedInSamsung)), 'screenshot workouts listed as counted');

  // 2e. export parser against fixtures (via the real file chooser)
  await page.click('.act-sam [data-sheet-opts*="export"]');
  await page.waitForSelector('.layer.open [data-s="files"]');
  await page.waitForTimeout(350);
  if (OUT) await page.screenshot({ path: path.join(OUT, 'sheet-export-start.png') });
  fc = page.waitForEvent('filechooser');
  await page.click('.layer.open [data-s="files"]');
  await (await fc).setFiles(fs.readdirSync(FIX).map(f => path.join(FIX, f)));
  await page.waitForSelector('.layer.open .act-exp-sum', { timeout: 5000 });
  const parsed = await page.evaluate(async files => M.samsung.parse(files), fs.readdirSync(FIX).map(f => ({ name: f, text: fs.readFileSync(path.join(FIX, f), 'utf8') })));
  ok(Object.keys(parsed.days).length === 6, 'parser: 6 days (' + Object.keys(parsed.days).length + ')');
  ok(parsed.days['2026-10-28'] && parsed.days['2026-10-28'].steps === 9120, 'parser: aggregate (source -2) row wins');
  ok(parsed.days['2026-10-28'].activeKcal === 402 && parsed.days['2026-10-28'].distanceKm === 6.95, 'parser: kcal + distance (m→km)');
  ok(parsed.days['2026-11-02'].activeKcal === 628 && parsed.days['2026-11-02'].activeMinutes === 60, 'parser: day_summary calorie + active_time win');
  ok(parsed.workouts.length === 3, 'parser: 3 exercise rows');
  const w1 = parsed.workouts.find(w => w.id === 'sh-ex-uuid-1');
  ok(w1 && w1.type === 'walk' && w1.minutes === 35 && w1.kcal === 311 && w1.distanceKm === 3.3 && w1.avgHr === 128 && w1.countedInSamsung, 'parser: exercise fields (ms duration, type code)');
  ok(w1 && w1.t === Date.UTC(2026, 10, 1, 22, 5), 'parser: start_time UTC');
  ok(parsed.workouts.some(w => w.type === 'strength' && w.kcal === 180), 'parser: quoted start_time + strength code');
  ok(parsed.files.skipped.length === 1, 'parser: unrelated file skipped');
  await page.click('.layer.open .seg-btn:has-text("Everything")');
  await page.waitForTimeout(350);
  await check(page, 'sheet export preview');
  if (OUT) await page.screenshot({ path: path.join(OUT, 'sheet-export-preview.png') });
  const cta = await page.textContent('.layer.open [data-slot="cta"]');
  ok(/Import 6 days/.test(cta), 'export CTA "' + cta + '"');
  await page.click('.layer.open [data-s="save"]');
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => { const a = M.store.getDay('2026-10-29').activity; return a && a.steps === 11240 && a.source === 'samsung-export'; }), 'export merged into day docs');
  ok(await page.evaluate(() => M.store.allWorkouts().filter(w => w.source === 'samsung-export').length === 3), 'export workouts added');

  // 2f. manual
  await page.click('.act-sam-manual');
  await page.waitForSelector('.layer.open #sm-steps');
  await page.fill('#sm-date', await page.evaluate(() => M.util.addDays(M.util.todayKey(), -9)));
  await page.dispatchEvent('#sm-date', 'change');
  await page.fill('#sm-steps', '7000');
  await page.waitForTimeout(350);
  if (OUT) await page.screenshot({ path: path.join(OUT, 'sheet-manual.png') });
  await page.click('.layer.open [data-s="save"]');
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => { const a = M.store.getDay(M.util.addDays(M.util.todayKey(), -9)).activity; return a && a.steps === 7000 && a.source === 'manual'; }), 'manual steps saved for past day');
  ok(await page.evaluate(() => /date=/.test(location.hash)), 'view moved to that day');
  await check(page, 'past day view');
  if (OUT) await page.screenshot({ path: path.join(OUT, 'past-day.png'), fullPage: true });
  await ctx.close();

  // 3. AI unavailable: workout sheet falls back to the form
  console.log('\nno AI');
  const n = await newPage(390, 844, 'dark', seed(false), false);
  await n.page.evaluate(() => M.ai.ready);
  await n.page.click('.act-add');
  await n.page.waitForSelector('.layer.open #wf-kcal');
  ok(true, 'no-AI opens form directly');
  await n.page.waitForTimeout(350);
  if (OUT) await n.page.screenshot({ path: path.join(OUT, 'noai-form-dark.png') });
  await n.page.keyboard.press('Escape');
  await n.page.click('.act-sam [data-sheet-opts*="screenshot"]');
  await n.page.waitForSelector('.layer.open [data-s="mode-manual"]');
  ok(/opened in Claude/.test(await n.page.textContent('.layer.open')), 'no-AI screenshot shows honest copy');
  await n.ctx.close();

  ok(!errors.length, 'zero console errors' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
  await browser.close();
  console.log('\n' + (failures ? failures + ' FAILED' : 'all passed'));
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
