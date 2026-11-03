/* Momentum v2 — UI helpers: icons, DOM builders, sheets, toast, confirm, controls, celebration, files/images.
   Owner: foundation. See CONTRACT.md §ui. */
(function () {
  'use strict';
  const M = window.M;
  const esc = M.util.esc;

  /* ================= icons (inline stroke SVG, 24 grid, currentColor) ================= */
  const ICONS = {
    today: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/>',
    food: '<path d="M7 3v8a2 2 0 0 0 2 2v8"/><path d="M5 3v5a2 2 0 0 0 2 2h0M9 3v5a2 2 0 0 1-2 2"/><path d="M17 21V3c-2.2 1.2-3.5 3.8-3.5 7v3H17"/>',
    activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    progress: '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>',
    plan: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
    profile: '<circle cx="12" cy="8.5" r="4"/><path d="M4.5 20.5c1.2-3.8 4.2-5.5 7.5-5.5s6.3 1.7 7.5 5.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    chevron: '<path d="M9 6l6 6-6 6"/>',
    back: '<path d="M15 6l-6 6 6 6"/>',
    down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12.5h10L18 7M9 7V4h6v3"/>',
    edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
    camera: '<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.8l1.4-2h4.6l1.4 2h1.8A2.5 2.5 0 0 1 20 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z"/><circle cx="12" cy="13" r="3.5"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M20.5 16l-5-5-8.5 8.5"/>',
    text: '<path d="M5 6h14M5 11h14M5 16h9"/>',
    form: '<rect x="4" y="3.5" width="16" height="17" rx="3"/><path d="M8 8.5h8M8 12.5h8M8 16.5h5"/>',
    scale: '<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><path d="M8.5 9.5a5 5 0 0 1 7 0"/><path d="M12 12.5l1.5-2.5"/>',
    flame: '<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.4 2.4-5.4 3.6-8.3.5 2 1.6 3.1 2.6 3.6C12 6.8 13.2 4.6 14.9 3c.3 3 4.6 5.9 4.6 11.4 0 3.9-3 6.6-7.5 6.6z"/>',
    steps: '<path d="M8 3.5c1.7 0 2.7 1.8 2.7 4.2S9.6 12 8 12 5.3 10 5.3 7.7 6.3 3.5 8 3.5z"/><path d="M5.8 14.5h4.4l-.4 2.6a2 2 0 0 1-3.6 0z"/><path d="M16 7.5c1.7 0 2.7 1.8 2.7 4.2S17.6 16 16 16s-2.7-2-2.7-4.3 1-4.2 2.7-4.2z"/><path d="M13.8 18.5h4.4l-.4 1.6a2 2 0 0 1-3.6 0z"/>',
    dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
    heart: '<path d="M12 20s-7.5-4.4-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.6 12 20 12 20z"/>',
    rest: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    system: '<rect x="3.5" y="4.5" width="17" height="12" rx="2.5"/><path d="M9 20h6M12 16.5V20"/>',
    sparkle: '<path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9-1.9 5.1-1.9-5.1L5 10.5l5.1-1.9z"/><path d="M18.5 16l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
    upload: '<path d="M12 16V5M7 10l5-5 5 5M4 19.5h16"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M4 19.5h16"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
    alert: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17h.01"/>',
    trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5M12 14v3M8.5 20h7M9.5 17h5"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    route: '<circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="6" r="2.2"/><path d="M8.2 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.8"/>',
    phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="3"/><path d="M10.5 18.5h3"/>',
    sync: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20v-4h-4"/>',
    cloud: '<path d="M7 18.5h10.5a4 4 0 0 0 .4-8A6 6 0 0 0 6.3 9 4.8 4.8 0 0 0 7 18.5z"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    bolt: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>',
    more: '<circle cx="5.5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="18.5" cy="12" r="1"/>',
    logo: '<path d="M4 17l5-6 4 4 7-9"/><path d="M15 6h5v5"/>'
  };
  /** M.icon('flame', 'sm') -> '<svg class="ic sm">…</svg>' (sizes: xs 14, sm 16, default 20, lg 24, xl 32) */
  M.icon = function (name, cls) {
    return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (ICONS[name] || ICONS.info) + '</svg>';
  };
  M.ICONS = ICONS;

  /* ================= DOM helpers ================= */
  const RAW = Symbol('raw');
  const ui = M.ui = {};
  ui.$ = (s, r) => (r || document).querySelector(s);
  ui.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  /** mark a string as trusted HTML for ui.html`` */
  ui.raw = s => ({ [RAW]: true, s: String(s == null ? '' : s) });
  /** tagged template: values are escaped unless wrapped in ui.raw(); arrays are joined */
  ui.html = function (strings) {
    let out = '';
    for (let i = 0; i < strings.length; i++) {
      out += strings[i];
      if (i + 1 < arguments.length) out += ui._v(arguments[i + 1]);
    }
    return out;
  };
  ui._v = v => v == null || v === false ? '' : Array.isArray(v) ? v.map(ui._v).join('') : (v && v[RAW]) ? v.s : esc(v);
  /** h('button', {class:'btn', onclick:fn, 'aria-label':'x'}, child, 'text', ...) -> Element */
  ui.h = function (tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(k => {
      const v = attrs[k];
      if (v == null || v === false) return;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    });
    for (let i = 2; i < arguments.length; i++) ui._append(el, arguments[i]);
    return el;
  };
  ui._append = (el, c) => { if (c == null || c === false) return; if (Array.isArray(c)) c.forEach(x => ui._append(el, x)); else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c))); };
  /** parse an HTML string into a single Element (or fragment if many) */
  ui.frag = function (html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.childElementCount === 1 ? t.content.firstElementChild : t.content; };

  /* ---------- markup helpers (return HTML strings) ---------- */
  /** big number + small unit. size: 'sm'|'md'|'lg'|'xl' */
  ui.val = (n, unit, size) => '<span class="val' + (size ? ' ' + size : '') + '"><span class="val-n">' + esc(n) + '</span>' + (unit ? '<span class="val-u">' + esc(unit) + '</span>' : '') + '</span>';
  ui.pageHead = o => '<header class="page-head"><div class="ph-text">' + (o.over ? '<p class="ph-over">' + esc(o.over) + '</p>' : '') + '<h1>' + esc(o.title) + '</h1>' + (o.sub ? '<p class="ph-sub">' + (o.subHtml ? o.sub : esc(o.sub)) + '</p>' : '') + '</div>' + (o.actions ? '<div class="ph-actions">' + o.actions + '</div>' : '') + '</header>';
  ui.sectionHead = o => '<div class="section-head"><div class="sh-text"><h2 class="section-title">' + esc(o.title) + '</h2>' + (o.sub ? '<p class="section-sub">' + esc(o.sub) + '</p>' : '') + '</div>' + (o.action ? '<div class="sh-action">' + o.action + '</div>' : '') + '</div>';
  ui.empty = o => '<div class="empty' + (o.compact ? ' compact' : '') + '"><div class="empty-art">' + M.icon(o.icon || 'sparkle') + '</div><p class="empty-title">' + esc(o.title) + '</p>' + (o.body ? '<p class="empty-body">' + esc(o.body) + '</p>' : '') + (o.actions ? '<div class="empty-actions">' + o.actions + '</div>' : '') + '</div>';
  ui.badge = (text, tone, icon) => '<span class="badge' + (tone ? ' ' + tone : '') + '">' + (icon ? M.icon(icon) : '') + esc(text) + '</span>';
  ui.progress = (fraction, tone, label) => '<div class="progress' + (tone ? ' ' + tone : '') + '" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(M.util.clamp(fraction || 0, 0, 1) * 100) + '"' + (label ? ' aria-label="' + esc(label) + '"' : '') + '><div class="bar" style="width:' + (M.util.clamp(fraction || 0, 0, 1) * 100).toFixed(1) + '%"></div></div>';

  /* ================= layers: sheet ================= */
  const layers = [];   // stack of open sheets/dialogs
  function layerRoot() { return document.getElementById('layers') || document.body; }
  function focusables(el) { return ui.$$('a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])', el).filter(x => x.offsetParent !== null || x === document.activeElement); }
  function trap(e, el) {
    if (e.key !== 'Tab') return;
    const f = focusables(el); if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  document.addEventListener('keydown', e => {
    const top = layers[layers.length - 1]; if (!top) return;
    if (e.key === 'Escape' && !top.opts.noEscape) { e.preventDefault(); top.close(); }
    else trap(e, top.el);
  });
  let ignorePops = 0;
  window.addEventListener('popstate', () => {
    if (ignorePops > 0) { ignorePops--; return; }
    const top = layers[layers.length - 1];
    if (top && top.pushed) top.close({ fromHistory: true });
  });
  function pushLayer(layer) {
    layers.push(layer);
    try { history.pushState({ momentumLayer: layers.length }, ''); layer.pushed = true; } catch (e) {}
    document.documentElement.style.overflow = 'hidden';
  }
  function popLayer(layer, fromHistory) {
    const i = layers.indexOf(layer); if (i < 0) return false;
    layers.splice(i, 1);
    if (layer.pushed && !fromHistory) { ignorePops++; try { history.back(); } catch (e) { ignorePops--; } }
    if (!layers.length) document.documentElement.style.overflow = '';
    return true;
  }

  /**
   * ui.sheet({title, sub, body: html|Node, foot: html|Node, wide, onClose, initialFocus: selector, label})
   * -> {el, body, foot, close(), setTitle(t), setBody(x), setFoot(x)}
   * Bottom sheet on phones, centered 560px modal ≥768px. Body scrolls; foot is sticky.
   */
  ui.sheet = function (opts) {
    opts = opts || {};
    const prevFocus = document.activeElement;
    const id = 'sh-' + M.util.uid();
    const root = ui.h('div', { class: 'layer', role: 'presentation' });
    const scrim = ui.h('div', { class: 'scrim' });
    const sheet = ui.h('section', { class: 'sheet' + (opts.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id + '-t' });
    const head = ui.h('header', { class: 'sheet-head' });
    const titleBox = ui.h('div', { class: 'sh-text' });
    const titleEl = ui.h('h2', { class: 'sheet-title', id: id + '-t' }, opts.title || '');
    titleBox.appendChild(titleEl);
    const subEl = ui.h('p', { class: 'sheet-sub' }, opts.sub || ''); if (!opts.sub) subEl.hidden = true; titleBox.appendChild(subEl);
    const closeBtn = ui.h('button', { class: 'btn-icon filled', type: 'button', 'aria-label': 'Close', html: M.icon('close') });
    head.append(titleBox, closeBtn);
    const body = ui.h('div', { class: 'sheet-body' });
    const foot = ui.h('footer', { class: 'sheet-foot' });
    sheet.append(head, body, foot);
    root.append(scrim, sheet);
    const set = (el, x) => { el.innerHTML = ''; if (x == null) return; if (typeof x === 'string') el.innerHTML = x; else el.appendChild(x); };
    set(body, opts.body); set(foot, opts.foot); foot.hidden = !opts.foot;
    let closed = false;
    const api = {
      el: sheet, root, body, foot, opts,
      setTitle(t, s) { titleEl.textContent = t; if (s != null) { subEl.textContent = s; subEl.hidden = !s; } },
      setBody(x) { set(body, x); },
      setFoot(x) { set(foot, x); foot.hidden = !x; },
      close(o) {
        if (closed) return; closed = true;
        popLayer(api, o && o.fromHistory);
        root.classList.remove('open');
        const done = () => { root.remove(); };
        if (M.util.reduceMotion()) done(); else setTimeout(done, 320);
        try { if (prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true }); } catch (e) {}
        if (opts.onClose) try { opts.onClose(o || {}); } catch (e) { console.error(e); }
      },
      get closed() { return closed; }
    };
    closeBtn.addEventListener('click', () => api.close());
    scrim.addEventListener('click', () => api.close());
    layerRoot().appendChild(root);
    pushLayer(api);
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('open')));
    setTimeout(() => {
      const t = (opts.initialFocus && sheet.querySelector(opts.initialFocus)) || sheet.querySelector('[autofocus]') || closeBtn;
      try { t.focus({ preventScroll: true }); } catch (e) {}
    }, 60);
    return api;
  };
  /** close every open sheet/dialog */
  ui.closeAll = o => layers.slice().reverse().forEach(l => l.close(o && o.keepHistory ? { fromHistory: true } : undefined));
  ui.topLayer = () => layers[layers.length - 1] || null;

  /* ================= confirm dialog ================= */
  /** ui.confirm({title, body, ok='Confirm', cancel='Cancel', danger=false}) -> Promise<boolean> */
  ui.confirm = function (o) {
    return new Promise(resolve => {
      const prevFocus = document.activeElement;
      const id = 'dlg-' + M.util.uid();
      const root = ui.h('div', { class: 'layer dialog' });
      const card = ui.h('div', { class: 'dialog-card', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': id + '-t', 'aria-describedby': id + '-b' });
      card.innerHTML = '<h2 class="t-h2" id="' + id + '-t">' + esc(o.title || 'Are you sure?') + '</h2>' + (o.body ? '<p class="ink-2" id="' + id + '-b">' + esc(o.body) + '</p>' : '') +
        '<div class="dialog-actions"><button type="button" class="btn btn-secondary" data-a="0">' + esc(o.cancel || 'Cancel') + '</button><button type="button" class="btn ' + (o.danger ? 'btn-danger' : 'btn-tonal') + '" data-a="1">' + esc(o.ok || 'Confirm') + '</button></div>';
      root.append(ui.h('div', { class: 'scrim' }), card);
      let done = false;
      const layer = {
        el: card, opts: {}, close(x) {
          if (done) return; done = true; popLayer(layer, x && x.fromHistory); root.classList.remove('open');
          setTimeout(() => root.remove(), M.util.reduceMotion() ? 0 : 220);
          try { prevFocus && prevFocus.focus && prevFocus.focus({ preventScroll: true }); } catch (e) {}
          resolve(!!(x && x.ok));
        }
      };
      card.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b) layer.close({ ok: b.dataset.a === '1' }); });
      root.querySelector('.scrim').addEventListener('click', () => layer.close());
      layerRoot().appendChild(root);
      pushLayer(layer);
      requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('open')));
      setTimeout(() => { try { card.querySelector('[data-a="1"]').focus(); } catch (e) {} }, 40);
    });
  };

  /* ================= toast ================= */
  /** ui.toast(message, {action:{label, fn}, duration=4500}) — e.g. undo. Returns {dismiss()} */
  ui.toast = function (msg, o) {
    o = o || {};
    let host = document.getElementById('toasts');
    if (!host) { host = ui.h('div', { id: 'toasts', class: 'toasts', 'aria-live': 'polite' }); document.body.appendChild(host); }
    while (host.children.length >= 2) host.firstElementChild.remove();
    const el = ui.h('div', { class: 'toast', role: 'status' }, ui.h('span', { class: 'toast-msg' }, msg));
    let timer;
    const dismiss = () => { clearTimeout(timer); el.classList.add('out'); setTimeout(() => el.remove(), 180); };
    if (o.action) {
      const b = ui.h('button', { type: 'button', class: 'toast-act' }, o.action.label || 'Undo');
      b.addEventListener('click', () => { dismiss(); try { o.action.fn(); } catch (e) { console.error(e); } });
      el.appendChild(b);
    }
    host.appendChild(el);
    timer = setTimeout(dismiss, o.duration || (o.action ? 6000 : 3500));
    return { dismiss };
  };

  /* ================= controls ================= */
  /**
   * ui.segmented({options:[{value,label}], value, onChange(value), block, size:'lg', ariaLabel}) -> Element
   * el.value getter/setter.
   */
  ui.segmented = function (o) {
    const el = ui.h('div', { class: 'seg' + (o.block ? ' block' : '') + (o.size === 'lg' ? ' lg' : ''), role: 'group', 'aria-label': o.ariaLabel || '' });
    let value = o.value;
    const paint = () => ui.$$('.seg-btn', el).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === String(value))));
    o.options.forEach(opt => {
      const b = ui.h('button', { type: 'button', class: 'seg-btn', 'data-v': String(opt.value) }, opt.label);
      b.addEventListener('click', () => { if (String(value) === String(opt.value)) return; value = opt.value; paint(); o.onChange && o.onChange(opt.value); });
      el.appendChild(b);
    });
    paint();
    Object.defineProperty(el, 'value', { get: () => value, set: v => { value = v; paint(); } });
    return el;
  };
  /**
   * ui.chips({options:[{value,label,icon?}]|string[], value: v | v[], multi, onChange(value), scroll, tap, ariaLabel}) -> Element
   */
  ui.chips = function (o) {
    const el = ui.h('div', { class: 'chips' + (o.scroll ? ' scroll' : ''), role: 'group', 'aria-label': o.ariaLabel || '' });
    const opts = o.options.map(x => typeof x === 'string' ? { value: x, label: x } : x);
    let value = o.multi ? (Array.isArray(o.value) ? o.value.slice() : []) : o.value;
    const isOn = v => o.multi ? value.includes(v) : value === v;
    const paint = () => ui.$$('.chip', el).forEach((b, i) => b.setAttribute('aria-pressed', String(isOn(opts[i].value))));
    opts.forEach(opt => {
      const b = ui.h('button', { type: 'button', class: 'chip' + (o.tap ? ' tap' : ''), html: (opt.icon ? M.icon(opt.icon) : '') + '<span>' + esc(opt.label) + '</span>' });
      b.addEventListener('click', () => {
        if (o.multi) { value = isOn(opt.value) ? value.filter(v => v !== opt.value) : value.concat([opt.value]); }
        else value = opt.value;
        paint(); o.onChange && o.onChange(o.multi ? value.slice() : value);
      });
      el.appendChild(b);
    });
    paint();
    Object.defineProperty(el, 'value', { get: () => o.multi ? value.slice() : value, set: v => { value = o.multi ? (v || []).slice() : v; paint(); } });
    return el;
  };
  /** number helpers for <input>: read a number (NaN if empty/invalid), and prepare decimal keyboard */
  ui.readNum = input => M.util.parseNum(input && input.value);
  ui.numeric = (input, decimals) => { input.setAttribute('inputmode', decimals === 0 ? 'numeric' : 'decimal'); input.setAttribute('autocomplete', 'off'); input.classList.add('num-input'); return input; };
  /** field markup: ui.field({id, label, hint, optional, input: html}) -> html */
  ui.field = o => '<div class="field"><label class="label" for="' + esc(o.id) + '">' + esc(o.label) + (o.optional ? ' <span class="opt">(optional)</span>' : '') + '</label>' + o.input + (o.hint ? '<p class="hint">' + esc(o.hint) + '</p>' : '') + '<p class="error-text" id="' + esc(o.id) + '-err" hidden></p></div>';
  ui.fieldError = (input, msg) => { const e = document.getElementById(input.id + '-err'); input.setAttribute('aria-invalid', msg ? 'true' : 'false'); if (e) { e.textContent = msg || ''; e.hidden = !msg; } };

  /* ================= celebration ================= */
  /** ui.celebrate({title, sub, kind:'w'|'s'|'goal', cta='Keep going'}) -> Promise (resolves when dismissed) */
  ui.celebrate = function (o) {
    return new Promise(resolve => {
      const colors = ['#4F46E5', '#14B8A6', '#F59E0B', '#8B87FF', '#2DD4BF'];
      const root = ui.h('div', { class: 'celebrate', role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title });
      const confetti = ui.h('div', { class: 'confetti', 'aria-hidden': 'true' });
      if (!M.util.reduceMotion()) for (let i = 0; i < 70; i++) {
        const c = ui.h('i');
        c.style.left = (Math.random() * 100) + '%';
        c.style.background = colors[i % colors.length];
        c.style.animationDuration = (2.2 + Math.random() * 1.8) + 's';
        c.style.animationDelay = (Math.random() * 0.6) + 's';
        c.style.setProperty('--dx', (Math.random() * 160 - 80) + 'px');
        c.style.setProperty('--rot', (360 + Math.random() * 540) + 'deg');
        if (i % 3 === 0) { c.style.width = '10px'; c.style.height = '10px'; c.style.borderRadius = '50%'; }
        confetti.appendChild(c);
      }
      const medal = '<svg class="medal" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="54" fill="var(--brand-tint)"/><circle cx="60" cy="60" r="42" fill="var(--brand)"/><circle cx="60" cy="60" r="34" fill="none" stroke="var(--on-brand)" stroke-opacity=".35" stroke-width="2" stroke-dasharray="3 5"/>' +
        '<g transform="translate(36 36) scale(2)" fill="none" stroke="var(--on-brand)" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[o.kind === 's' ? 'flame' : o.kind === 'goal' ? 'flag' : 'trophy']) + '</g></svg>';
      const card = ui.h('div', { class: 'celebrate-card', html: medal + '<p class="t-over">Milestone reached</p><h2 class="t-h1">' + esc(o.title) + '</h2>' + (o.sub ? '<p class="ink-2">' + esc(o.sub) + '</p>' : '') });
      const btn = ui.h('button', { type: 'button', class: 'btn btn-primary btn-block' }, o.cta || 'Keep going');
      card.appendChild(btn);
      root.append(ui.h('div', { class: 'scrim' }), confetti, card);
      const layer = { el: card, opts: {}, close(x) { popLayer(layer, x && x.fromHistory); root.remove(); resolve(); } };
      btn.addEventListener('click', () => layer.close());
      root.querySelector('.scrim').addEventListener('click', () => layer.close());
      document.body.appendChild(root);
      pushLayer(layer);
      setTimeout(() => btn.focus(), 50);
    });
  };

  /* ================= files & images ================= */
  /**
   * ui.pickFiles({accept='image/*', multiple=false, capture, directory=false}) -> Promise<File[]> (empty if cancelled)
   * Must be called from a user gesture (click handler).
   */
  ui.pickFiles = function (o) {
    o = o || {};
    return new Promise(resolve => {
      const input = ui.h('input', { type: 'file', accept: o.accept || 'image/*', style: { position: 'fixed', left: '-9999px', opacity: '0' } });
      if (o.multiple) input.multiple = true;
      if (o.capture) input.setAttribute('capture', o.capture);
      if (o.directory) { input.setAttribute('webkitdirectory', ''); input.multiple = true; }
      let settled = false;
      const finish = files => { if (settled) return; settled = true; input.remove(); resolve(files); };
      input.addEventListener('change', () => finish(Array.from(input.files || [])));
      input.addEventListener('cancel', () => finish([]));
      document.body.appendChild(input);
      input.click();
    });
  };
  function loadImage(blob) {
    return new Promise((resolve, reject) => {
      if (window.createImageBitmap) {
        createImageBitmap(blob, { imageOrientation: 'from-image' }).then(resolve, () => fallback());
      } else fallback();
      function fallback() {
        const url = URL.createObjectURL(blob); const img = new Image();
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image_decode')); };
        img.src = url;
      }
    });
  }
  function drawScaled(img, maxSide) {
    const w = img.width || img.naturalWidth, h = img.height || img.naturalHeight;
    const k = Math.min(1, maxSide / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }
  /** ui.downscale(file, maxSide=1600, quality=0.85) -> Promise<Blob image/jpeg> (for AI) */
  ui.downscale = async function (file, maxSide, quality) {
    const img = await loadImage(file);
    const c = drawScaled(img, maxSide || 1600);
    return await new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('encode')), 'image/jpeg', quality || 0.85));
  };
  /** ui.thumb(file, maxSide=160) -> Promise<string data:image/jpeg;base64,…> kept ≲ 8 KB */
  ui.thumb = async function (file, maxSide) {
    const img = await loadImage(file);
    let side = maxSide || 160, q = 0.72, url = '';
    for (let i = 0; i < 6; i++) {
      url = drawScaled(img, side).toDataURL('image/jpeg', q);
      if (url.length <= 11000) break; // ~8 KB binary
      if (q > 0.5) q -= 0.1; else side = Math.round(side * 0.8);
    }
    return url;
  };
  /** object URL preview helper; remember to revoke */
  ui.previewURL = file => { try { return URL.createObjectURL(file); } catch (e) { return ''; } };
})();
