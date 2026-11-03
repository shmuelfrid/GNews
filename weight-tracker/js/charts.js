/* Momentum v2 — SVG chart primitives (owner: foundation). See CONTRACT.md §charts.
   Colors come from CSS custom properties so light/dark both work. Text never wears data color. */
(function () {
  'use strict';
  const M = window.M;
  const NS = 'http://www.w3.org/2000/svg';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fin = v => typeof v === 'number' && isFinite(v);
  const DAY = 864e5;
  const fromKey = k => { const p = String(k).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  const toMs = x => typeof x === 'number' ? x : fromKey(x).getTime();
  const fmtShort = ms => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const fmtInt = n => fin(n) ? Math.round(n).toLocaleString('en-US') : '–';

  function niceStep(range, count) {
    const raw = range / Math.max(1, count); if (!(raw > 0)) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(raw))); const n = raw / mag;
    return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
  }
  function niceTicks(lo, hi, count) {
    if (!(hi > lo)) { hi = lo + 1; lo = lo - 1; }
    const step = niceStep(hi - lo, count);
    const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step;
    const ticks = []; for (let v = a; v <= b + step * 0.001; v += step) ticks.push(+v.toFixed(6));
    return { lo: a, hi: b, step, ticks };
  }
  /** monotone cubic path through points [{x,y}] */
  function monoPath(pts) {
    if (!pts.length) return '';
    if (pts.length < 3) return 'M' + pts.map(p => p.x.toFixed(1) + ',' + p.y.toFixed(1)).join('L');
    const n = pts.length, dx = [], dy = [], m = [], t = [];
    for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1].x - pts[i].x; dy[i] = pts[i + 1].y - pts[i].y; m[i] = dx[i] ? dy[i] / dx[i] : 0; }
    t[0] = m[0]; t[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    for (let i = 0; i < n - 1; i++) { if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; } const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b; if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; } }
    let d = 'M' + pts[0].x.toFixed(1) + ',' + pts[0].y.toFixed(1);
    for (let i = 0; i < n - 1; i++) { const h = dx[i] / 3; d += 'C' + (pts[i].x + h).toFixed(1) + ',' + (pts[i].y + t[i] * h).toFixed(1) + ' ' + (pts[i + 1].x - h).toFixed(1) + ',' + (pts[i + 1].y - t[i + 1] * h).toFixed(1) + ' ' + pts[i + 1].x.toFixed(1) + ',' + pts[i + 1].y.toFixed(1); }
    return d;
  }
  /** date ticks thinned to fit width (≈ 1 label per 72px) */
  function dateTicks(startMs, endMs, width) {
    const days = Math.max(1, (endMs - startMs) / DAY);
    const maxLabels = Math.max(2, Math.floor(width / 72));
    const steps = [1, 2, 3, 7, 14, 30, 61, 91, 182, 365];
    let step = steps.find(s => days / s <= maxLabels - 1) || 365;
    const out = [];
    const d = new Date(startMs); d.setHours(0, 0, 0, 0);
    if (step >= 30) { d.setDate(1); if (d.getTime() < startMs) d.setMonth(d.getMonth() + 1); }
    else if (step === 7 || step === 14) { while (d.getDay() !== 1) d.setDate(d.getDate() + 1); }
    let guard = 0;
    while (d.getTime() <= endMs + 1 && guard++ < 400) {
      out.push(d.getTime());
      if (step >= 30) d.setMonth(d.getMonth() + Math.round(step / 30)); else d.setDate(d.getDate() + step);
    }
    const fmt = step >= 30 ? (ms => new Date(ms).toLocaleDateString('en-US', { month: 'short' })) : fmtShort;
    return out.map(ms => ({ ms, label: fmt(ms) }));
  }
  const css = name => `var(${name})`;

  /* ---------- shared responsive host ---------- */
  function host(el, draw) {
    el.classList.add('chart');
    let lastW = -1, opts = null, raf = 0;
    const tip = document.createElement('div'); tip.className = 'chart-tip'; tip.setAttribute('role', 'status');
    const render = () => {
      raf = 0;
      const w = Math.round(el.clientWidth);
      if (!w || !opts) return;
      lastW = w;
      draw(el, w, opts, tip);
      if (!tip.isConnected) el.appendChild(tip);
    };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { if (Math.round(el.clientWidth) !== lastW && !raf) raf = requestAnimationFrame(render); }) : null;
    if (ro) ro.observe(el);
    return {
      update(o) { opts = o; render(); if (!el.clientWidth && !raf) raf = requestAnimationFrame(render); return this; },
      destroy() { if (ro) ro.disconnect(); if (raf) cancelAnimationFrame(raf); el.innerHTML = ''; }
    };
  }
  function showTip(el, tip, x, y, html) {
    tip.innerHTML = html;
    tip.classList.add('on');
    const W = el.clientWidth, tw = tip.offsetWidth, th = tip.offsetHeight;
    let left = x - tw / 2; left = Math.max(0, Math.min(W - tw, left));
    let top = y - th - 14; if (top < -8) top = y + 16;
    tip.style.left = left + 'px'; tip.style.top = top + 'px';
  }
  function tipHTML(t) {
    if (!t) return '';
    if (typeof t === 'string') return t;
    return (t.title ? '<div class="tt-title">' + esc(t.title) + '</div>' : '') +
      (t.rows || []).map(r => '<div class="tt-row"><span>' + (r[2] ? '<span class="dot" style="background:' + r[2] + ';margin-right:6px"></span>' : '') + esc(r[0]) + '</span><b>' + esc(r[1]) + '</b></div>').join('');
  }

  /* ================= line chart ================= */
  /**
   * lineChart(el, {
   *   dots:[{key|x, y}], line:[{key|x, y}], goal:number|null, goalLabel, projection:[{key,y},...]|null, projectionLabel,
   *   domain:{from:key|ms, to:key|ms}?, height=240, yFmt:v=>string, latestLabel:string?, ariaLabel,
   *   tip:(key)=>({title, rows:[[label, value, color?]]}) | string
   * }) -> {update(opts), destroy()}
   */
  function lineChart(el, opts) {
    const h = host(el, (el, W, o, tip) => {
      const H = o.height || 240;
      const yFmt = o.yFmt || (v => v.toFixed(1));
      const dots = (o.dots || []).filter(p => fin(p.y)).map(p => ({ ms: toMs(p.key != null ? p.key : p.x), y: p.y, key: p.key }));
      const line = (o.line || []).filter(p => fin(p.y)).map(p => ({ ms: toMs(p.key != null ? p.key : p.x), y: p.y, key: p.key }));
      const proj = (o.projection || []).filter(p => fin(p.y)).map(p => ({ ms: toMs(p.key != null ? p.key : p.x), y: p.y }));
      el.querySelectorAll('svg, .chart-empty').forEach(n => n.remove());
      if (!dots.length && !line.length) { el.insertAdjacentHTML('afterbegin', '<div class="chart-empty" style="min-height:' + Math.round(H * 0.8) + 'px">' + esc(o.emptyText || 'Not enough data yet') + '</div>'); return; }
      const all = dots.concat(line, proj);
      let x0 = o.domain && o.domain.from != null ? toMs(o.domain.from) : Math.min.apply(null, all.map(p => p.ms));
      let x1 = o.domain && o.domain.to != null ? toMs(o.domain.to) : Math.max.apply(null, all.map(p => p.ms));
      if (x1 - x0 < DAY) { x0 -= DAY * 3; x1 += DAY * 3; }
      const inRange = all.filter(p => p.ms >= x0 - DAY && p.ms <= x1 + DAY);
      const ys = inRange.map(p => p.y).concat(fin(o.goal) ? [o.goal] : []);
      let lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys);
      const padY = Math.max((hi - lo) * 0.12, 0.5); lo -= padY; hi += padY;
      const yt = niceTicks(lo, hi, H < 200 ? 3 : 4);
      // left gutter fits widest tick label (≈7px/char @12px)
      const gut = Math.max(28, Math.max.apply(null, yt.ticks.map(v => yFmt(v).length)) * 7 + 10);
      const pad = { l: gut, r: o.latestLabel ? 54 : 14, t: 16, b: 28 };
      const iw = Math.max(40, W - pad.l - pad.r), ih = H - pad.t - pad.b;
      const sx = ms => pad.l + (x1 === x0 ? iw / 2 : (ms - x0) / (x1 - x0) * iw);
      const sy = v => pad.t + (1 - (v - yt.lo) / (yt.hi - yt.lo)) * ih;
      let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(o.ariaLabel || 'Line chart') + '">';
      s += '<defs><clipPath id="clip-' + (el._cid = el._cid || Math.random().toString(36).slice(2)) + '"><rect x="' + pad.l + '" y="0" width="' + iw + '" height="' + (H - pad.b + 2) + '"/></clipPath></defs>';
      yt.ticks.forEach(v => { const y = sy(v).toFixed(1); s += '<line class="ch-grid" x1="' + pad.l + '" x2="' + (pad.l + iw) + '" y1="' + y + '" y2="' + y + '"/><text x="' + (pad.l - 8) + '" y="' + y + '" dy="4" text-anchor="end">' + esc(yFmt(v)) + '</text>'; });
      dateTicks(x0, x1, iw).forEach(t => { const x = sx(t.ms); if (x < pad.l - 1 || x > pad.l + iw + 1) return; s += '<text x="' + x.toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(t.label) + '</text>'; });
      const clip = ' clip-path="url(#clip-' + el._cid + ')"';
      if (fin(o.goal) && o.goal >= yt.lo && o.goal <= yt.hi) {
        const gy = sy(o.goal).toFixed(1);
        s += '<line x1="' + pad.l + '" x2="' + (pad.l + iw) + '" y1="' + gy + '" y2="' + gy + '" stroke="' + css('--d-goal') + '" stroke-width="2" stroke-dasharray="6 5" stroke-linecap="round"/>';
        if (o.goalLabel) s += '<text class="ch-label" x="' + (pad.l + 6) + '" y="' + gy + '" dy="-7">' + esc(o.goalLabel) + '</text>';
      }
      s += '<g' + clip + '>';
      dots.forEach(p => { s += '<circle cx="' + sx(p.ms).toFixed(1) + '" cy="' + sy(p.y).toFixed(1) + '" r="3" fill="' + css('--d-dot') + '"/>'; });
      if (proj.length >= 2) s += '<path d="M' + proj.map(p => sx(p.ms).toFixed(1) + ',' + sy(p.y).toFixed(1)).join('L') + '" fill="none" stroke="' + css('--d-proj') + '" stroke-width="2" stroke-dasharray="2 6" stroke-linecap="round"/>';
      if (line.length) s += '<path d="' + monoPath(line.map(p => ({ x: sx(p.ms), y: sy(p.y) }))) + '" fill="none" stroke="' + css('--d-trend') + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';
      s += '</g>';
      if (proj.length >= 2 && o.projectionLabel) { const pe = proj[proj.length - 1]; const px = sx(pe.ms); if (px <= pad.l + iw + 1) s += '<text class="ch-label" x="' + Math.min(px, pad.l + iw).toFixed(1) + '" y="' + sy(pe.y).toFixed(1) + '" dy="18" text-anchor="end">' + esc(o.projectionLabel) + '</text>'; }
      const lastP = line.length ? line[line.length - 1] : dots[dots.length - 1];
      if (lastP && lastP.ms >= x0 && lastP.ms <= x1) {
        const lx = sx(lastP.ms), ly = sy(lastP.y);
        s += '<circle cx="' + lx.toFixed(1) + '" cy="' + ly.toFixed(1) + '" r="6" fill="' + css('--d-trend') + '" stroke="' + css('--surface') + '" stroke-width="2.5"/>';
        if (o.latestLabel) {
          const tw = o.latestLabel.length * 7.4 + 16, bx = Math.min(lx + 10, W - tw - 2), by = Math.max(2, Math.min(ly - 13, H - pad.b - 26));
          s += '<rect x="' + bx.toFixed(1) + '" y="' + by.toFixed(1) + '" width="' + tw.toFixed(1) + '" height="26" rx="13" fill="' + css('--ink') + '"/>';
          s += '<text x="' + (bx + tw / 2).toFixed(1) + '" y="' + (by + 17).toFixed(1) + '" text-anchor="middle" style="fill:var(--surface);font-weight:700">' + esc(o.latestLabel) + '</text>';
        }
      }
      // hover layer
      s += '<line class="ch-cross" x1="0" x2="0" y1="' + pad.t + '" y2="' + (pad.t + ih) + '" stroke="' + css('--line-strong') + '" stroke-width="1" opacity="0"/>';
      s += '<circle class="ch-hot" r="6" fill="' + css('--brand') + '" stroke="' + css('--surface') + '" stroke-width="2.5" opacity="0"/>';
      s += '<rect class="ch-hit" x="' + pad.l + '" y="0" width="' + iw + '" height="' + H + '" fill="transparent" style="cursor:crosshair;touch-action:pan-y"/>';
      s += '</svg>';
      el.insertAdjacentHTML('afterbegin', s);
      const svg = el.querySelector('svg'), cross = svg.querySelector('.ch-cross'), hot = svg.querySelector('.ch-hot'), hit = svg.querySelector('.ch-hit');
      const targets = (line.length ? line : dots).filter(p => p.ms >= x0 - DAY / 2 && p.ms <= x1 + DAY / 2);
      const move = ev => {
        if (!targets.length) return;
        const r = svg.getBoundingClientRect();
        const px = (ev.clientX - r.left) * (W / r.width);
        let best = targets[0], bd = Infinity;
        targets.forEach(p => { const d = Math.abs(sx(p.ms) - px); if (d < bd) { bd = d; best = p; } });
        const x = sx(best.ms), y = sy(best.y);
        cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.setAttribute('opacity', '1');
        hot.setAttribute('cx', x); hot.setAttribute('cy', y); hot.setAttribute('opacity', '1');
        const key = best.key != null ? best.key : M.util ? M.util.keyOf(best.ms) : best.ms;
        const content = o.tip ? o.tip(key, best) : { title: fmtShort(best.ms), rows: [['Value', yFmt(best.y)]] };
        showTip(el, tip, x * (r.width / W), y * (r.height / H), tipHTML(content));
      };
      const leave = () => { tip.classList.remove('on'); cross.setAttribute('opacity', '0'); hot.setAttribute('opacity', '0'); };
      hit.addEventListener('pointermove', move); hit.addEventListener('pointerdown', move); hit.addEventListener('pointerleave', leave);
    });
    return h.update(opts);
  }

  /* ================= bar chart ================= */
  /**
   * barChart(el, {
   *   bars:[{key?, label, value, highlight?, muted?, color?}], height=200,
   *   ref:{value, label}?, valueFmt:v=>string, labels:'auto'|'all'|'none', posColor, negColor, ariaLabel,
   *   tip:(bar, i)=>({title, rows}) | string
   * }) -> {update, destroy}. Positive bars use posColor (teal), negative negColor (amber).
   */
  function barChart(el, opts) {
    const h = host(el, (el, W, o, tip) => {
      const H = o.height || 200;
      const bars = (o.bars || []).map(b => Object.assign({}, b, { value: fin(b.value) ? b.value : 0 }));
      const vf = o.valueFmt || (v => fmtInt(v));
      el.querySelectorAll('svg, .chart-empty').forEach(n => n.remove());
      if (!bars.length) { el.insertAdjacentHTML('afterbegin', '<div class="chart-empty" style="min-height:' + Math.round(H * 0.8) + 'px">' + esc(o.emptyText || 'No data yet') + '</div>'); return; }
      const vals = bars.map(b => b.value).concat(o.ref && fin(o.ref.value) ? [o.ref.value] : []).concat([0]);
      let lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
      if (hi === lo) hi = lo + 1;
      const span = hi - lo;
      const hasNeg = lo < 0;
      const pad = { l: 8, r: 8, t: 26, b: 28 };
      const refLabelW = o.ref && o.ref.label ? o.ref.label.length * 7 + 12 : 0;
      const refRight = refLabelW && W >= 480;
      if (refRight) pad.r = refLabelW + 8; else if (refLabelW) pad.t = 44;
      const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b - (hasNeg ? 18 : 0);
      const sy = v => pad.t + (hi - v) / span * ih;
      const slot = iw / bars.length;
      const bw = Math.max(4, Math.min(24, slot * 0.62));
      const pos = o.posColor || css('--d-deficit'), neg = o.negColor || css('--d-surplus');
      const showAll = o.labels === 'all' || (o.labels !== 'none' && slot >= 34);
      const labelEvery = Math.max(1, Math.ceil(46 / slot));
      let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(o.ariaLabel || 'Bar chart') + '">';
      const y0 = sy(0);
      s += '<line class="ch-axis" x1="' + pad.l + '" x2="' + (pad.l + iw) + '" y1="' + y0.toFixed(1) + '" y2="' + y0.toFixed(1) + '"/>';
      bars.forEach((b, i) => {
        if (!b.highlight) return;
        const cx = pad.l + slot * i + slot / 2;
        s += '<rect x="' + (cx - slot / 2 + 2).toFixed(1) + '" y="' + (pad.t - 22) + '" width="' + (slot - 4).toFixed(1) + '" height="' + (H - pad.t + 22 - 4) + '" rx="10" fill="' + css('--brand') + '" opacity=".08"/>';
      });
      bars.forEach((b, i) => {
        const cx = pad.l + slot * i + slot / 2;
        const top = sy(Math.max(0, b.value)), bot = sy(Math.min(0, b.value));
        const hgt = Math.max(b.value === 0 ? 0 : 2, bot - top);
        const color = b.color || (b.value < 0 ? neg : pos);
        const r = Math.min(4, bw / 2, hgt / 2);
        // rounded data-end, square at baseline
        const x = cx - bw / 2;
        let d;
        if (b.value >= 0) d = 'M' + x + ',' + (top + hgt) + 'V' + (top + r) + 'Q' + x + ',' + top + ' ' + (x + r) + ',' + top + 'H' + (x + bw - r) + 'Q' + (x + bw) + ',' + top + ' ' + (x + bw) + ',' + (top + r) + 'V' + (top + hgt) + 'Z';
        else d = 'M' + x + ',' + top + 'V' + (top + hgt - r) + 'Q' + x + ',' + (top + hgt) + ' ' + (x + r) + ',' + (top + hgt) + 'H' + (x + bw - r) + 'Q' + (x + bw) + ',' + (top + hgt) + ' ' + (x + bw) + ',' + (top + hgt - r) + 'V' + top + 'Z';
        if (hgt > 0) s += '<path d="' + d + '" fill="' + color + '" opacity="' + (b.muted ? 0.45 : 1) + '"/>';
        const showVal = showAll || b.highlight || i === bars.length - 1;
        if (showVal && o.labels !== 'none' && b.value !== 0) {
          const ty = b.value >= 0 ? top - 7 : top + hgt + 15;
          s += '<text class="' + (b.highlight ? 'ch-strong' : 'ch-label') + '" x="' + cx.toFixed(1) + '" y="' + ty.toFixed(1) + '" text-anchor="middle" style="paint-order:stroke;stroke:var(--surface);stroke-width:4px;stroke-linejoin:round">' + esc(vf(b.value)) + '</text>';
        }
        if (b.label && (i % labelEvery === 0 || b.highlight || i === bars.length - 1)) {
          s += '<text x="' + cx.toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle"' + (b.highlight ? ' class="ch-strong"' : '') + '>' + esc(b.label) + '</text>';
        }
      });
      if (o.ref && fin(o.ref.value)) {
        const ry = sy(o.ref.value).toFixed(1);
        s += '<line x1="' + pad.l + '" x2="' + (pad.l + iw) + '" y1="' + ry + '" y2="' + ry + '" stroke="' + css('--ink-2') + '" stroke-width="1.5" stroke-dasharray="5 5"/>';
        if (o.ref.label && refRight) s += '<text class="ch-label" x="' + (pad.l + iw + 8) + '" y="' + ry + '" dy="4">' + esc(o.ref.label) + '</text>';
        else if (o.ref.label) s += '<line x1="' + pad.l + '" x2="' + (pad.l + 18) + '" y1="10" y2="10" stroke="' + css('--ink-2') + '" stroke-width="1.5" stroke-dasharray="4 3"/><text class="ch-label" x="' + (pad.l + 24) + '" y="14">' + esc(o.ref.label) + '</text>';
      }
      bars.forEach((b, i) => { s += '<rect class="ch-hitbar" data-i="' + i + '" x="' + (pad.l + slot * i).toFixed(1) + '" y="0" width="' + slot.toFixed(1) + '" height="' + H + '" fill="transparent"/>'; });
      s += '</svg>';
      el.insertAdjacentHTML('afterbegin', s);
      const svg = el.querySelector('svg');
      svg.querySelectorAll('.ch-hitbar').forEach(r => {
        const show = () => {
          const i = +r.dataset.i, b = bars[i];
          const rr = svg.getBoundingClientRect();
          const cx = (pad.l + slot * i + slot / 2) * (rr.width / W), cy = sy(Math.max(0, b.value)) * (rr.height / H);
          const content = o.tip ? o.tip(b, i) : { title: b.label, rows: [['Value', vf(b.value)]] };
          showTip(el, tip, cx, cy, tipHTML(content));
        };
        r.addEventListener('pointerenter', show); r.addEventListener('pointerdown', show);
        r.addEventListener('pointerleave', () => tip.classList.remove('on'));
      });
    });
    return h.update(opts);
  }

  /* ================= stacked horizontal bar (HTML) ================= */
  /**
   * stackedBar(el, {segments:[{label, value, color, textColor?}], max?, legend=true, valueFmt, ariaLabel})
   * Labels print inside a segment only when they fit; legend below lists name + value.
   */
  function stackedBar(el, opts) {
    const h = host(el, (el, W, o) => {
      const segs = (o.segments || []).filter(s => fin(s.value) && s.value > 0);
      const total = segs.reduce((a, s) => a + s.value, 0);
      const max = Math.max(o.max || 0, total) || 1;
      const vf = o.valueFmt || fmtInt;
      el.querySelectorAll('.stack-bar').forEach(n => n.remove());
      let html = '<div class="stack-bar" role="img" aria-label="' + esc(o.ariaLabel || segs.map(s => s.label + ' ' + vf(s.value)).join(', ')) + '"><div class="sb-track">';
      segs.forEach(sg => {
        if (!sg.textColor) sg = Object.assign({}, sg, { textColor: autoText(el, sg.color) });
        const px = sg.value / max * W;
        const txt = vf(sg.value);
        const fits = px - 16 >= txt.length * 7.2;
        html += '<div class="sb-seg" title="' + esc(sg.label + ': ' + txt) + '" style="width:' + (sg.value / max * 100).toFixed(3) + '%;background:' + sg.color + ';color:' + (sg.textColor || '#fff') + '">' + (fits && o.inlineLabels !== false ? esc(txt) : '') + '</div>';
      });
      html += '</div>';
      if (o.legend !== false) html += '<div class="legend">' + segs.map(sg => '<span class="legend-item"><span class="dot sq" style="background:' + sg.color + '"></span><span>' + esc(sg.label) + '</span><span class="lv">' + esc(vf(sg.value)) + '</span></span>').join('') + '</div>';
      html += '</div>';
      el.insertAdjacentHTML('afterbegin', html);
    });
    return h.update(opts);
  }

  /** white or near-black text for a fill (resolves CSS vars via computed style) */
  function autoText(el, color) {
    try {
      const probe = document.createElement('span'); probe.style.color = color; probe.style.display = 'none'; el.appendChild(probe);
      const m = getComputedStyle(probe).color.match(/[\d.]+/g); probe.remove();
      if (!m) return '#fff';
      const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
      const L = 0.2126 * lin(+m[0]) + 0.7152 * lin(+m[1]) + 0.0722 * lin(+m[2]);
      return L > 0.32 ? '#12141C' : '#fff';
    } catch (e) { return '#fff'; }
  }

  /* ================= ring (returns HTML string) ================= */
  /**
   * ring({size=160, stroke=14, value?, max=1, segments?:[{value, color}], track, color, center:{value, label, size?}, ariaLabel})
   * Single: value/max fills `color` (default brand). Multi: segments drawn in order with 2px gaps.
   * Over-full single rings show the overflow part in --d-surplus.
   */
  function ring(o) {
    const size = o.size || 160, sw = o.stroke || 14, r = (size - sw) / 2, C = 2 * Math.PI * r;
    const max = o.max || 1;
    let arcs = '';
    const arc = (from, len, color) => {
      if (len <= 0) return '';
      const gap = o.segments && o.segments.length > 1 ? Math.min(3, len * C * 0.3) : 0;
      return '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="' + sw + '" stroke-linecap="' + (gap ? 'butt' : 'round') + '" stroke-dasharray="' + Math.max(0.01, len * C - gap).toFixed(2) + ' ' + C.toFixed(2) + '" stroke-dashoffset="' + (-from * C).toFixed(2) + '"/>';
    };
    if (o.segments && o.segments.length) {
      let acc = 0;
      o.segments.forEach(sg => { const f = Math.max(0, Math.min(1 - acc, (sg.value || 0) / max)); arcs += arc(acc, f, sg.color); acc += f; });
    } else {
      const f = Math.max(0, (o.value || 0) / max);
      arcs += arc(0, Math.min(1, f), o.color || css('--brand'));
      if (f > 1) arcs += arc(0, Math.min(1, f - 1), o.overColor || css('--d-surplus'));
    }
    const c = o.center || {};
    return '<div class="ring" style="width:' + size + 'px;height:' + size + 'px" role="img" aria-label="' + esc(o.ariaLabel || ((c.value || '') + ' ' + (c.label || ''))) + '">' +
      '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" aria-hidden="true"><circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + (o.track || css('--d-track')) + '" stroke-width="' + sw + '"/>' + arcs + '</svg>' +
      (c.value != null || c.label ? '<div class="ring-center">' + (c.over ? '<div class="t-cap muted">' + esc(c.over) + '</div>' : '') + (c.value != null ? '<div class="ring-value" style="font-size:' + (c.size || Math.round(size * 0.2)) + 'px">' + c.value + '</div>' : '') + (c.label ? '<div class="ring-label">' + esc(c.label) + '</div>' : '') + '</div>' : '') +
      '</div>';
  }

  /* ================= sparkline (returns SVG string) ================= */
  /** sparkline({values:[number|null], width=96, height=32, color, highlightLast=true, area=false, ariaLabel}) */
  function sparkline(o) {
    const W = o.width || 96, H = o.height || 32, vals = (o.values || []);
    const pts = vals.map((v, i) => ({ i, v })).filter(p => fin(p.v));
    if (pts.length < 2) return '<svg class="spark" width="' + W + '" height="' + H + '" aria-hidden="true"></svg>';
    let lo = Math.min.apply(null, pts.map(p => p.v)), hi = Math.max.apply(null, pts.map(p => p.v));
    if (hi === lo) { hi += 1; lo -= 1; }
    const sx = i => 3 + i / Math.max(1, vals.length - 1) * (W - 6), sy = v => 3 + (1 - (v - lo) / (hi - lo)) * (H - 6);
    const P = pts.map(p => ({ x: sx(p.i), y: sy(p.v) }));
    const color = o.color || css('--d-trend');
    let s = '<svg class="spark" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.ariaLabel || 'Trend') + '">';
    if (o.area) s += '<path d="' + monoPath(P) + 'L' + P[P.length - 1].x + ',' + H + 'L' + P[0].x + ',' + H + 'Z" fill="' + color + '" opacity=".1"/>';
    s += '<path d="' + monoPath(P) + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
    if (o.highlightLast !== false) { const l = P[P.length - 1]; s += '<circle cx="' + l.x + '" cy="' + l.y + '" r="3.5" fill="' + color + '" stroke="' + css('--surface') + '" stroke-width="2"/>'; }
    return s + '</svg>';
  }

  M.charts = { lineChart, barChart, stackedBar, ring, sparkline, niceTicks, dateTicks, monoPath };
})();
