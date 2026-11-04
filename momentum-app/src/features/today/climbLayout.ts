/* "Your climb" mountain geometry (port of today.js climbSvg). Pure: returns shapes + label boxes; ClimbMap.tsx draws them. */
import { clamp, diffDays, fmtDate, type Units } from '@/lib/format';
import type { ClimbData } from './model';

type Pt = [number, number];
export interface Rect { x: number; y: number; w: number; h: number }
export interface Pill extends Rect { text: string; kind: 'pill' | 'next' | 'goal' }
export interface FlagShape { id: string; x: number; y: number; passed: boolean }
export interface ClimbLayout {
  W: number; H: number;
  start: { x: number; y: number }; summit: { x: number; y: number };
  me: { x: number; y: number };
  trail: string; done: string | null; ahead: string | null;
  far: string; mid: string; near: string; snow: string; snow2: string;
  trees: string; clouds: { cx: number; cy: number; rx: number; ry: number }[]; stars: { cx: number; cy: number }[];
  sunR: number; trailY0: number; trailY1: number;
  flags: FlagShape[]; pills: Pill[]; goalPill: Pill; youTip: Rect & { text: string; below: boolean };
  /** tap targets (centre points) in left→right story order */
  targets: { id: string; x: number; y: number }[];
  aria: string;
}

export function catmull(pts: Pt[], n: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    for (let s = 0; s < n; s++) {
      const t = s / n, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push([pts[pts.length - 1][0], pts[pts.length - 1][1]]);
  return out;
}
export function measure(pts: Pt[]): number[] {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return cum;
}
export function pointAt(pts: Pt[], cum: number[], frac: number) {
  const L = cum[cum.length - 1], d = clamp(frac, 0, 1) * L;
  let i = 1; while (i < cum.length - 1 && cum[i] < d) i++;
  const seg = cum[i] - cum[i - 1] || 1, t = (d - cum[i - 1]) / seg;
  return { x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, y: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t, i, d };
}
const f1 = (n: number) => n.toFixed(1);
const pathOf = (pts: Pt[]) => pts.map((p, i) => (i ? 'L' : 'M') + f1(p[0]) + ' ' + f1(p[1])).join('');
/** 12px/700 label pill width */
export const tw = (s: string) => Math.round(String(s).length * 7.1 + 18);
const hit = (r: Rect, list: Rect[]) => list.some(o => r.x < o.x + o.w + 3 && r.x + r.w + 3 > o.x && r.y < o.y + o.h + 3 && r.y + r.h + 3 > o.y);

export function climbLayout(cd: ClimbData, width: number, U: Units, today: string): ClimbLayout {
  const W = Math.max(280, Math.round(width));
  const H = Math.round(clamp(W * 0.74, 256, 330));
  const X = (fx: number) => 16 + fx * (W - 32), Y = (fy: number) => 48 + fy * (H - 72);
  const way: Pt[] = [[0.06, 1.0], [0.32, 0.97], [0.62, 0.91], [0.86, 0.80], [0.80, 0.69], [0.54, 0.63], [0.24, 0.55], [0.09, 0.45], [0.20, 0.35], [0.47, 0.30], [0.64, 0.21], [0.72, 0.10], [0.77, 0.0]];
  const pts = catmull(way.map(p => [X(p[0]), Y(p[1])] as Pt), 14);
  const cum = measure(pts);
  const P = (fr: number) => pointAt(pts, cum, fr);
  const S = pts[0], G = pts[pts.length - 1];
  const sx = G[0], sy = G[1];
  const me = P(cd.f);

  const far: Pt[] = [[0, Y(0.42)], [X(0.07), Y(0.30)], [X(0.17), Y(0.37)], [X(0.33), Y(0.13)], [X(0.47), Y(0.29)], [X(0.6), Y(0.15)], [sx, sy - 4], [Math.min(W, sx + W * 0.13), Y(0.22)], [W, Y(0.17)]];
  const farD = 'M' + far.map(p => f1(p[0]) + ' ' + f1(p[1])).join(' L') + ' L' + W + ' ' + H + ' L0 ' + H + 'Z';
  const snow = 'M' + f1(sx) + ' ' + f1(sy - 4) + ' L' + f1(sx - 20) + ' ' + f1(sy + 12) + ' L' + f1(sx - 12) + ' ' + f1(sy + 14) + ' L' + f1(sx - 6) + ' ' + f1(sy + 9) + ' L' + f1(sx) + ' ' + f1(sy + 15) + ' L' + f1(sx + 6) + ' ' + f1(sy + 10) + ' L' + f1(sx + 15) + ' ' + f1(sy + 12) + 'Z';
  const p2: Pt = [X(0.33), Y(0.13)];
  const snow2 = 'M' + f1(p2[0]) + ' ' + f1(p2[1]) + ' l-12 11 l7 1 l5 -4 l6 5 l5 -3Z';
  const mid = 'M0 ' + f1(Y(0.60)) + ' C' + X(0.17) + ' ' + Y(0.52) + ' ' + X(0.31) + ' ' + Y(0.57) + ' ' + X(0.46) + ' ' + Y(0.52) + ' C' + X(0.63) + ' ' + Y(0.46) + ' ' + X(0.8) + ' ' + Y(0.53) + ' ' + W + ' ' + f1(Y(0.45)) + ' L' + W + ' ' + H + ' L0 ' + H + 'Z';
  const near = 'M0 ' + f1(Y(0.84)) + ' C' + X(0.23) + ' ' + Y(0.77) + ' ' + X(0.46) + ' ' + Y(0.88) + ' ' + X(0.69) + ' ' + Y(0.81) + ' C' + X(0.83) + ' ' + Y(0.77) + ' ' + X(0.91) + ' ' + Y(0.80) + ' ' + W + ' ' + f1(Y(0.74)) + ' L' + W + ' ' + H + ' L0 ' + H + 'Z';
  const tree = (fx: number, fy: number, s: number) => { const x = X(fx), y = Y(fy); return 'M' + f1(x - s * 0.45) + ' ' + f1(y) + ' L' + f1(x) + ' ' + f1(y - s) + ' L' + f1(x + s * 0.45) + ' ' + f1(y) + 'Z'; };
  const trees = tree(0.9, 0.98, 16) + tree(0.94, 1.02, 18) + tree(0.98, 0.95, 13) + tree(0.43, 0.79, 13) + tree(0.46, 0.80, 11) + tree(0.03, 0.58, 13);
  const clouds = [
    { cx: X(0.13), cy: Y(0.02), rx: 26, ry: 7 }, { cx: X(0.13) + 16, cy: Y(0.02) - 6, rx: 14, ry: 8 },
    { cx: X(0.94), cy: Y(0.33), rx: 20, ry: 5 }, { cx: X(0.94) + 10, cy: Y(0.33) - 5, rx: 10, ry: 6 },
  ];
  const stars = [[0.04, -0.05], [0.3, -0.12], [0.46, 0.02], [0.92, -0.08], [0.58, -0.1], [0.98, 0.12], [0.36, 0.14]].map(s => ({ cx: X(s[0]), cy: Y(s[1]) }));

  const done = cd.f > 0.002 ? pathOf(pts.slice(0, me.i).concat([[me.x, me.y]])) : null;
  const ahead = cd.f < 0.998 ? pathOf(([[me.x, me.y]] as Pt[]).concat(pts.slice(me.i))) : null;

  // ---- labels, collision-aware ----
  const placed: Rect[] = [];
  const items: Record<string, { x: number; y: number }> = {};
  const pills: Pill[] = [];
  const projTxt = cd.proj ? (diffDays(today, cd.proj) > 300 ? fmtDate(cd.proj, true) : fmtDate(cd.proj)) : '';
  const goalTxt = (isFinite(cd.goalKg) ? U.n(cd.goalKg, cd.unit === 'lb' ? 0 : 1).replace(/\.0$/, '') + ' ' + cd.unit : 'Goal') + (projTxt ? ' · ' + projTxt : '');
  const gw = tw(goalTxt) + 4;
  const goalPill: Pill = { x: clamp(sx - gw - 10, 4, W - gw - 4), y: Math.max(4, sy - 40), w: gw, h: 22, text: goalTxt, kind: 'goal' };
  placed.push(goalPill, { x: sx - 2, y: sy - 34, w: 26, h: 16 });
  items.goal = { x: sx, y: sy - 14 };
  const youTxt = U.n(cd.cur) + ' ' + cd.unit;
  const yw = tw(youTxt);
  const meDot: Rect = { x: me.x - 12, y: me.y - 12, w: 24, h: 24 };
  items.you = { x: me.x, y: me.y };
  if (cd.f > 0.05) {
    const sTxt = 'Start ' + U.n(cd.startKg, cd.unit === 'lb' ? 0 : 1);
    const sw = tw(sTxt);
    const r: Pill = { x: clamp(S[0] - 14, 4, W - sw - 4), y: S[1] - 34, w: sw, h: 20, text: sTxt, kind: 'pill' };
    placed.push(r); pills.push(r);
  }
  items.start = { x: S[0], y: S[1] };
  placed.push({ x: S[0] - 9, y: S[1] - 9, w: 18, h: 18 });
  const L = cum[cum.length - 1];
  const kept: (typeof cd.flags[number] & { x?: number; y?: number })[] = [];
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
  cd.flags.slice().sort((a, b) => a.pr - b.pr || a.frac - b.frac).forEach(fl => {
    if (kept.length >= 9) return;
    const d = fl.frac * L;
    if (d < 26 || L - d < 34 || Math.abs(d - cd.f * L) < 14) return;
    if (kept.some(k => Math.abs(k.frac * L - d) < 24)) return;
    const q = P(fl.frac);
    if (dist(q, { x: S[0], y: S[1] }) < 48 || dist(q, me) < 24) return;
    if (kept.some(k => dist(P(k.frac), q) < 36)) return;
    kept.push({ ...fl });
  });
  const flags: FlagShape[] = [];
  kept.forEach(fl => {
    const pt = P(fl.frac);
    fl.x = pt.x; fl.y = pt.y;
    flags.push({ id: fl.id, x: pt.x, y: pt.y, passed: fl.passed });
    placed.push({ x: pt.x - 2, y: pt.y - 26, w: 17, h: 26 });
    items[fl.id] = { x: pt.x, y: pt.y - 12 };
  });
  // "you" tip goes after the flag glyphs so it never sits on top of one: above, nudged left/right, then below
  const yCands: (Rect & { below: boolean })[] = [0, -0.3, 0.3].map(o => ({ x: clamp(me.x - yw / 2 + o * yw, 4, W - yw - 4), y: me.y - 42, w: yw, h: 24, below: false }))
    .concat([0, -0.3, 0.3].map(o => ({ x: clamp(me.x - yw / 2 + o * yw, 4, W - yw - 4), y: me.y + 18, w: yw, h: 24, below: true })));
  const fits = (r: Rect) => r.y >= 4 && r.y + r.h <= H - 4;
  const yPick = yCands.find(r => fits(r) && !hit(r, placed)) || (fits(yCands[0]) ? yCands[0] : yCands[3]);
  const yRect: Rect = { x: yPick.x, y: yPick.y, w: yw, h: 24 }, below = yPick.below;
  placed.push(yRect, meDot);
  kept.forEach(fl => {
    const w = tw(fl.label), h = 20, x = fl.x as number, y = fl.y as number;
    const cands = [{ x: x + 16, y: y - 26 }, { x: x - w - 6, y: y - 30 }, { x: x + 8, y: y + 6 }, { x: x - w / 2, y: y + 8 }, { x: x - w - 6, y: y - 8 }];
    const c = cands.map(c => ({ x: c.x, y: c.y, w, h })).find(r => r.x >= 4 && r.x + r.w <= W - 4 && r.y >= 4 && r.y + r.h <= H - 4 && !hit(r, placed));
    if (!c) return;
    placed.push(c);
    pills.push({ ...c, text: fl.label, kind: fl.next ? 'next' : 'pill' });
  });
  const passedN = kept.filter(k => k.passed).length;
  const aria = 'Journey map from ' + U.n(cd.startKg) + ' ' + cd.unit + ' at the start to the ' + U.n(cd.goalKg) + ' ' + cd.unit + ' summit. You are at ' + youTxt + ', ' + Math.round(cd.f * 100) + ' percent of the way.' + (passedN ? ' ' + passedN + (passedN === 1 ? ' flag' : ' flags') + ' passed.' : '') + (cd.proj ? ' Projected arrival ' + fmtDate(cd.proj, true) + '.' : '');
  const order = ['start'].concat(kept.slice().sort((x, y) => x.frac - y.frac).map(k => k.id), ['you', 'goal']);
  const targets = order.filter(id => items[id] && cd.stories[id]).map(id => ({ id, ...items[id] }));
  return {
    W, H, start: { x: S[0], y: S[1] }, summit: { x: sx, y: sy }, me: { x: me.x, y: me.y },
    trail: pathOf(pts), done, ahead, far: farD, mid, near, snow, snow2, trees, clouds, stars,
    sunR: Math.round(H * 0.32), trailY0: S[1], trailY1: sy,
    flags, pills, goalPill, youTip: { ...yRect, text: youTxt, below }, targets, aria,
  };
}
