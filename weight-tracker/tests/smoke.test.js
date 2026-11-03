/* Playwright smoke test. Run: node tests/smoke.test.js [outDir]
   Checks: no console errors, onboarding renders + completes, every route renders (placeholders OK),
   quick-add + weigh-in sheet work, v1 data migrates, charts render, no horizontal overflow. */
'use strict';
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const OUT = process.argv[2] || null;
if (OUT) fs.mkdirSync(OUT, { recursive: true });
let failures = 0;
const ok = (cond, msg) => { if (cond) console.log('  ok  ' + msg); else { failures++; console.log('  FAIL ' + msg); } };

(async () => {
  const browser = await chromium.launch();
  for (const [w, h, tag, scheme] of [[390, 844, 'phone', 'light'], [1440, 900, 'desktop', 'light'], [360, 740, 'small', 'dark']]) {
    console.log('\n' + tag + ' ' + w + 'x' + h + ' ' + scheme);
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', m => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text()) && !/net::ERR/.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', e => errors.push(String(e)));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await page.goto(URL);
    await page.waitForTimeout(300);
    const overflow = async () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

    // 1. onboarding
    const h1 = await page.textContent('h1').catch(() => '');
    ok(/set up|welcome|plan|momentum/i.test(h1 || ''), 'onboarding renders ("' + (h1 || '').trim() + '")');
    ok(await page.evaluate(() => document.getElementById('app').classList.contains('is-onboarding')), 'nav hidden during onboarding');
    ok((await overflow()) <= 0, 'no horizontal overflow on onboarding');
    if (OUT) await page.screenshot({ path: path.join(OUT, tag + '-onboarding.png'), fullPage: true });

    // complete onboarding (fallback form, or registered view via store API)
    const hasFallback = await page.$('#ob-form');
    if (hasFallback) {
      await page.fill('#ob-name', 'Sam');
      await page.fill('#ob-age', '34');
      await page.fill('#ob-height', "5'10");
      await page.fill('#ob-weight', '193.6');
      await page.fill('#ob-goal', '180');
      await page.fill('#ob-date', '2027-01-31');
      await page.click('#ob-form button[type=submit]');
    } else {
      await page.evaluate(() => { const LB = 0.45359237; M.store.setProfile({ name: 'Sam', sex: 'male', birthYear: 1992, heightCm: 178, unit: 'lb', startKg: 212 * LB, startDate: '2026-08-04', goalKg: 180 * LB, targetDate: '2027-01-31' }); M.store.addItem('weights', { kg: 193.6 * LB, t: Date.now() }); location.hash = '#today'; M.render(); });
    }
    await page.waitForTimeout(400);
    ok(await page.evaluate(() => M.store.profileComplete()), 'profile complete after onboarding');
    ok(await page.evaluate(() => !document.getElementById('app').classList.contains('is-onboarding')), 'app shell shown');

    // 2. every route
    for (const r of ['today', 'food', 'activity', 'progress', 'plan', 'profile']) {
      await page.evaluate(r => { location.hash = '#' + r; }, r);
      await page.waitForTimeout(250);
      const txt = await page.textContent('#view');
      ok(txt && txt.trim().length > 0, 'route #' + r + ' renders');
      ok((await overflow()) <= 0, 'route #' + r + ' no horizontal overflow');
    }
    await page.evaluate(() => { location.hash = '#today'; });
    await page.waitForTimeout(200);
    if (OUT) await page.screenshot({ path: path.join(OUT, tag + '-today.png') });

    // 3. quick add -> weigh-in
    await page.click('[data-action="quick-add"]:visible');
    await page.waitForSelector('.layer.open .quick-grid');
    ok(true, 'quick-add sheet opens');
    await page.waitForTimeout(400);
    if (OUT) await page.screenshot({ path: path.join(OUT, tag + '-quickadd.png') });
    await page.click('[data-open="weighIn"]');
    await page.waitForSelector('.layer.open #wi-kg');
    await page.fill('#wi-kg', '192.8');
    await page.waitForTimeout(400);
    if (OUT) await page.screenshot({ path: path.join(OUT, tag + '-weighin.png') });
    await page.click('.layer.open [data-save]');
    await page.waitForTimeout(450);
    const n = await page.evaluate(() => M.store.allWeights().length);
    ok(n === 2, 'weigh-in saved (' + n + ' weights)');
    ok(await page.evaluate(() => !document.querySelector('.layer.open')), 'sheet closed after save');
    // Escape closes a sheet
    await page.click('[data-action="quick-add"]:visible');
    await page.waitForSelector('.layer.open');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    ok(await page.evaluate(() => !document.querySelector('.layer.open')), 'Escape closes sheet');

    // 4. calc + data API sanity in page
    const bal = await page.evaluate(() => { const b = M.data.balance(); return [b.bmr, b.budget, b.left, b.burnExpected].every(Number.isFinite); });
    ok(bal, 'M.data.balance() finite');

    // 5. charts render
    const charts = await page.evaluate(() => {
      const box = document.createElement('div'); box.style.width = '340px'; document.getElementById('view').appendChild(box);
      const a = document.createElement('div'), b = document.createElement('div'), c = document.createElement('div');
      box.append(a, b, c);
      const k = M.util.todayKey();
      const pts = Array.from({ length: 30 }, (_, i) => ({ key: M.util.addDays(k, -29 + i), y: 90 - i * 0.1 + Math.sin(i) * 0.4 }));
      M.charts.lineChart(a, { dots: pts, line: pts, goal: 86, goalLabel: 'Goal', projection: [{ key: k, y: 87 }, { key: M.util.addDays(k, 20), y: 86 }], latestLabel: '87.1', yFmt: v => v.toFixed(0) });
      M.charts.barChart(b, { bars: [620, 810, 450, -120, 540, 900, 1096].map((v, i) => ({ label: 'MTWTFSS'[i], value: v, highlight: i === 6 })), ref: { value: 535, label: 'Target 535' } });
      M.charts.stackedBar(c, { segments: [{ label: 'Resting', value: 1826, color: 'var(--d-rest)', textColor: '#12141C' }, { label: 'Active', value: 380, color: 'var(--d-active)' }, { label: 'Workouts', value: 310, color: 'var(--d-workout)' }] });
      const r = M.charts.ring({ size: 120, value: 0.7, center: { value: '561', label: 'kcal left' } }) + M.charts.sparkline({ values: [1, 3, 2, 4] });
      const res = [a.querySelectorAll('svg path').length > 0, b.querySelectorAll('svg path').length === 7, c.querySelectorAll('.sb-seg').length === 3, r.includes('<svg')];
      box.remove();
      return res;
    });
    ok(charts.every(Boolean), 'charts render (line, bar, stacked, ring/spark) ' + JSON.stringify(charts));

    ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    await ctx.close();
  }

  // 6. v1 migration
  console.log('\nv1 migration');
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await page.goto(URL);
    await page.evaluate(() => {
      localStorage.clear();
      const LB = 0.45359237, entries = [];
      for (let i = 0; i < 40; i++) { const d = new Date(); d.setDate(d.getDate() - 40 + i); d.setHours(7, 10); entries.push({ id: 'e' + i, kg: (205 - i * 0.3) * LB, t: d.getTime(), tags: ['Morning'], note: '' }); }
      localStorage.setItem('momentum.v1', JSON.stringify({ v: 1, profile: { name: 'Sam', unit: 'lb', startKg: 212 * LB, startDate: '2026-08-04', goalKg: 180 * LB, targetDate: '2027-01-31', paceKg: LB, celebrated: [], updatedAt: 1 }, entries }));
    });
    await page.reload();
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({ n: M.store.allWeights().length, name: M.state.profile && M.state.profile.name, complete: M.store.profileComplete(), pace: M.state.profile && M.state.profile.paceKgPerWeek, saved: !!localStorage.getItem('momentum.v2') }));
    ok(r.n === 40, 'v1 weigh-ins migrated into day docs (' + r.n + ')');
    ok(r.name === 'Sam' && r.pace > 0, 'v1 profile carried over');
    ok(!r.complete, 'migrated profile asks for missing body details (onboarding)');
    ok(r.saved, 'v2 cache written');
    ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    await ctx.close();
  }
  await browser.close();
  console.log('\n' + (failures ? failures + ' FAILED' : 'all smoke checks passed'));
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
