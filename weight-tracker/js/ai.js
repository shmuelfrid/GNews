/* Momentum v2 — AI (sample capability) wrapper + ready-made strict-JSON prompts. Owner: foundation.
   Everything degrades: when AI is unavailable the UI must offer manual entry. */
(function () {
  'use strict';
  const M = window.M;
  const U = M.util;

  let samplePromise = null, limitsPromise = null, disabled = false;
  const getSample = () => {
    if (!samplePromise) {
      samplePromise = (async () => {
        try { const c = window.claude; if (!c || typeof c.use !== 'function') return null; return await c.use('sample'); }
        catch (e) { return null; }
      })();
    }
    return samplePromise;
  };

  /** friendly copy per error code */
  const COPY = {
    not_granted: 'Photo & description analysis needs permission. You can still enter it manually.',
    sampling_disabled: 'Photo & description analysis isn’t available on this account. You can still enter it manually.',
    not_declared: 'Photo & description analysis isn’t available here. You can still enter it manually.',
    capability_disabled: 'Photo & description analysis isn’t available here. You can still enter it manually.',
    capability_removed: 'Photo & description analysis isn’t available here. You can still enter it manually.',
    rate_limited: 'Too many requests right now. Try again in a minute.',
    image_rejected: 'That photo couldn’t be read. Choose another photo (JPEG, PNG or WebP).',
    images_unavailable: 'Photos can’t be analysed here. Describe it in words or enter it manually.',
    invalid_json: 'The answer came back garbled. Try again.',
    empty_completion: 'No answer came back. Try again.',
    refused: 'That couldn’t be analysed. Try a different photo or description.',
    prompt_too_large: 'That’s too much at once. Shorten the description.',
    session_expired: 'Your session expired. Sign in again, then retry.',
    cancelled: '',
    upstream_error: 'Something went wrong on our side. Try again.',
    unavailable: 'Photo & description analysis works when this app is opened in Claude.'
  };
  const HIDE_CODES = new Set(['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed', 'unavailable']);

  const ai = M.ai = {
    UNAVAILABLE_TEXT: 'Photo & description analysis works when this app is opened in Claude.',
    /** Promise<boolean>: can we ask Claude at all in this view? */
    async available() { if (disabled) return false; return !!(await getSample()); },
    /** Promise<boolean>: can we send images? */
    async canImages() {
      if (disabled) return false;
      const s = await getSample(); if (!s) return false;
      if (!limitsPromise) limitsPromise = (async () => { try { return await s.limits(); } catch (e) { return null; } })();
      const l = await limitsPromise;
      return !!(l && l.images);
    },
    /** accepted image types string for <input accept> */
    async imageAccept() { const s = await getSample(); try { const l = s && await s.limits(); return l && l.images ? l.images.mediaTypes.join(',') : 'image/*'; } catch (e) { return 'image/*'; } },
    /** user-facing message for an error code */
    message(code) { return COPY[code] != null ? COPY[code] : COPY.upstream_error; },
    /** true when this error means "hide AI features for this view" */
    isFatal(code) { return HIDE_CODES.has(code); },
    /**
     * json(prompt, {images, signal, onText, modelTier}) -> Promise<any>
     * Rejects with {code, message (friendly), raw}. Fatal codes flip available() to false for the session.
     */
    async json(prompt, o) {
      o = o || {};
      const s = await getSample();
      if (!s || disabled) throw { code: 'unavailable', message: COPY.unavailable };
      const opts = {};
      if (o.signal) opts.signal = o.signal;
      if (o.onText) opts.onText = o.onText;
      if (o.modelTier) opts.modelTier = o.modelTier;
      if (o.images) {
        if (!(await ai.canImages())) throw { code: 'images_unavailable', message: COPY.images_unavailable };
        const list = Array.isArray(o.images) ? o.images : [o.images];
        opts.images = await Promise.all(list.map(f => (f && f.size > 1.5e6) || (f && !/image\/(jpeg|png|webp|gif)/.test(f.type)) ? M.ui.downscale(f, 1600, 0.86).catch(() => f) : f));
      }
      try { return await s.json(prompt, opts); }
      catch (e) {
        const code = (e && e.code) || 'upstream_error';
        if (HIDE_CODES.has(code)) { disabled = true; M.emit('ai-unavailable', code); }
        throw { code, message: ai.message(code), raw: e && e.text };
      }
    },

    /* ---------- ready-made analyses (all resolve to normalized objects) ---------- */
    /** -> {name, items:[{name, portion, kcal, protein, carbs, fat}], kcal, protein, carbs, fat, confidence, note} */
    async analyzeFoodPhoto(file, o) {
      const prompt = FOOD_RULES + '\n\nThe attached photo shows food or a drink someone is about to eat. Identify each distinct item, estimate a realistic portion from visual cues (plate size, utensils, packaging), and estimate calories and macros per item. If a nutrition label or menu with calories is visible, use those numbers.\n\n' + FOOD_SHAPE;
      return normFood(await ai.json(prompt, Object.assign({ images: file }, o)));
    },
    /** text like "two eggs, toast with butter and a latte" -> same shape as analyzeFoodPhoto */
    async analyzeFoodText(text, o) {
      const prompt = FOOD_RULES + '\n\nThe person described what they ate:\n"""\n' + String(text || '').slice(0, 2000) + '\n"""\nSplit it into items, assume typical portions when unstated (say so in "portion"), and estimate calories and macros per item.\n\n' + FOOD_SHAPE;
      return normFood(await ai.json(prompt, o));
    },
    /** watch/app/treadmill summary photo -> {type, name, minutes, kcal, distanceKm, avgHr, date, time, confidence, note} */
    async analyzeWorkoutPhoto(file, o) {
      const prompt = 'You read workout summary screens (smartwatch, phone fitness app, gym treadmill or bike console). Extract the numbers that are VISIBLE in the attached photo. Do not invent values: use null for anything not shown. Convert units: duration to minutes, distance to kilometres (1 mi = 1.609 km), energy to kcal (1 kJ = 0.239 kcal). Use "active" or "workout" calories when both active and total are shown.\n' +
        'type must be one of: treadmill_walk, treadmill_run, walk, run, cycling, strength, swim, hiit, yoga, other.\n' +
        'Reply with only JSON of this exact shape (numbers as numbers, not strings):\n' +
        '{"type":"treadmill_walk","name":"Treadmill walk","minutes":35,"kcal":310,"distanceKm":3.3,"avgHr":128,"date":"2026-11-03","time":"14:05","confidence":"high","note":"3.5 mph, 5% incline"}';
      const r = await ai.json(prompt, Object.assign({ images: file }, o));
      return normWorkout(r);
    },
    /** Samsung Health screenshot -> {date, steps, activeKcal, totalKcal, activeMinutes, distanceKm, workouts:[…], confidence, note} */
    async analyzeSamsungScreenshot(file, o) {
      const today = U.todayKey();
      const prompt = 'The attached image is a screenshot from Samsung Health (or a similar phone health app): a daily summary, "Today", steps, or activity screen. Extract only numbers that are VISIBLE. Use null for anything not shown; never guess.\n' +
        '- steps: the step count for the day.\n- activeKcal: "active calories" / "activity calories" / calories burned by activity (NOT the total that includes resting).\n- totalKcal: "total calories burned" if shown.\n- activeMinutes: active time in minutes.\n- distanceKm: distance in kilometres (convert miles × 1.609).\n- date: the day the screen is about as YYYY-MM-DD (today is ' + today + '; "Today" means ' + today + '; if no date is visible use ' + today + ').\n- workouts: any individual exercise sessions listed, else [].\n' +
        'Reply with only JSON of this exact shape (numbers as numbers):\n' +
        '{"date":"' + today + '","steps":8420,"activeKcal":380,"totalKcal":2210,"activeMinutes":62,"distanceKm":6.1,"workouts":[{"type":"walk","minutes":35,"kcal":180}],"confidence":"high","note":""}';
      const r = await ai.json(prompt, Object.assign({ images: file }, o));
      return normSamsung(r, today);
    }
  };

  const FOOD_RULES = 'You are a careful nutrition estimator for a calorie-tracking app. Estimate realistic portions as actually served (not tiny "serving size" amounts). Return numbers, not strings or ranges. Give kcal for EVERY item. Round kcal to the nearest 5 and grams to whole numbers. confidence is "low", "medium" or "high".';
  const FOOD_SHAPE = 'Reply with only JSON of this exact shape:\n{"name":"Chicken burrito bowl","items":[{"name":"Grilled chicken","portion":"4 oz","kcal":180,"protein":32,"carbs":0,"fat":5},{"name":"White rice","portion":"1 cup","kcal":205,"protein":4,"carbs":45,"fat":0}],"confidence":"medium","note":"Assumed no sour cream"}\n"name" is a short title for the whole meal (max 5 words). If the image or text contains no food, reply {"name":"","items":[],"confidence":"low","note":"No food found"}.';

  const n = (v, lo, hi) => { v = typeof v === 'string' ? parseFloat(v.replace(/[^\d.\-]/g, '')) : +v; return isFinite(v) && v >= (lo == null ? 0 : lo) && v <= (hi == null ? 1e6 : hi) ? v : null; };
  const conf = c => ['low', 'medium', 'high'].includes(c) ? c : 'medium';
  function normFood(r) {
    r = r && typeof r === 'object' ? r : {};
    const items = (Array.isArray(r.items) ? r.items : []).map(it => ({
      name: String(it && it.name || 'Item').slice(0, 120), portion: String(it && it.portion || '').slice(0, 80),
      kcal: Math.round(n(it && it.kcal, 0, 10000) || 0), protein: n(it && it.protein, 0, 1000), carbs: n(it && it.carbs, 0, 1000), fat: n(it && it.fat, 0, 1000)
    })).filter(it => it.name);
    const sum = k => items.reduce((s, it) => s + (it[k] || 0), 0);
    return {
      name: String(r.name || (items[0] && items[0].name) || '').slice(0, 160), items,
      kcal: Math.round(sum('kcal')), protein: Math.round(sum('protein')), carbs: Math.round(sum('carbs')), fat: Math.round(sum('fat')),
      confidence: conf(r.confidence), note: String(r.note || '').slice(0, 280)
    };
  }
  function normWorkout(r) {
    r = r && typeof r === 'object' ? r : {};
    const type = M.calc.workoutType(r.type || r.name).id;
    const date = U.isValidKey(r.date) ? r.date : null;
    const time = /^\d{1,2}:\d{2}$/.test(r.time || '') ? r.time : null;
    return {
      type, name: String(r.name || M.calc.workoutType(type).label).slice(0, 80),
      minutes: n(r.minutes, 0, 1440), kcal: n(r.kcal, 0, 10000) != null ? Math.round(n(r.kcal, 0, 10000)) : null,
      distanceKm: n(r.distanceKm, 0, 1000), avgHr: n(r.avgHr, 30, 250), date, time,
      t: date ? U.timeOn(date, time || '12:00') : null,
      confidence: conf(r.confidence), note: String(r.note || '').slice(0, 280)
    };
  }
  function normSamsung(r, today) {
    r = r && typeof r === 'object' ? r : {};
    const date = U.isValidKey(r.date) && r.date <= today ? r.date : today;
    const workouts = (Array.isArray(r.workouts) ? r.workouts : []).map(w => ({ type: M.calc.workoutType(w && (w.type || w.name)).id, minutes: n(w && w.minutes, 0, 1440), kcal: n(w && w.kcal, 0, 10000) })).filter(w => w.minutes || w.kcal);
    return {
      date, steps: n(r.steps, 0, 200000) != null ? Math.round(n(r.steps, 0, 200000)) : null,
      activeKcal: n(r.activeKcal, 0, 15000) != null ? Math.round(n(r.activeKcal, 0, 15000)) : null,
      totalKcal: n(r.totalKcal, 0, 20000) != null ? Math.round(n(r.totalKcal, 0, 20000)) : null,
      activeMinutes: n(r.activeMinutes, 0, 1440), distanceKm: n(r.distanceKm, 0, 500),
      workouts, confidence: conf(r.confidence), note: String(r.note || '').slice(0, 280)
    };
  }
  ai._norm = { food: normFood, workout: normWorkout, samsung: normSamsung };

  // warm up availability so views can read it synchronously later
  ai.state = { available: null, images: null };
  ai.ready = (async () => {
    ai.state.available = await ai.available();
    ai.state.images = ai.state.available ? await ai.canImages() : false;
    M.emit('ai-ready', ai.state);
    return ai.state;
  })();
  M.on('ai-unavailable', () => { ai.state.available = false; ai.state.images = false; });
})();
