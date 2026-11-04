/* Goal-path chart (local: the shared LineChart has only one projection). Trend so far, needed path (teal dashed),
   recent pace (dotted indigo), goal line, today marker, current pill, tap tooltip. Port of plan.js svgFor/wire. */
import { useState } from 'react';
import { type GestureResponderEvent, type LayoutChangeEvent, Pressable, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { Txt } from '@/components';
import { diffDays, fromKey, keyOf } from '@/lib/calc';
import { clamp, fmtDate, relDay } from '@/lib/format';
import { useTheme } from '@/theme';
import type { ChartData, PathPt } from './model';

function niceTicks(lo: number, hi: number, n = 3) {
  const span = hi - lo || 1, raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) || mag * 10;
  const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = a; v <= b + 1e-9; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { lo: a, hi: b, step, ticks };
}
/** monotone-ish smooth path through points (Catmull-Rom → cubic, clamped) */
function smooth(pts: { x: number; y: number }[]) {
  if (pts.length < 3) return pts.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ');
  let d = 'M' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = clamp(p1.y + (p2.y - p0.y) / 6, Math.min(p1.y, p2.y), Math.max(p1.y, p2.y));
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = clamp(p2.y - (p3.y - p1.y) / 6, Math.min(p1.y, p2.y), Math.max(p1.y, p2.y));
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}
const tw = (s: string) => s.length * 6.9 + 8;

export function GoalPathChart({ d }: { d: ChartData }) {
  const t = useTheme();
  const [W, setW] = useState(0);
  const [sel, setSel] = useState<{ key: string; x: number; rows: [string, string, string?][] } | null>(null);
  const H = W && W < 480 ? 220 : 250;
  const onLayout = (e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width));

  const ms = (k: string) => fromKey(k).getTime();
  const ys = d.trend.map(p => p.y).concat([d.cur]);
  if (d.goal != null) ys.push(d.goal);
  if (d.proj) ys.push(d.proj.y);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  const padY = Math.max((hi - lo) * 0.1, 1); lo -= padY; hi += padY;
  const yt = niceTicks(lo, hi, 3);
  const yd = d.unit === 'kg' && yt.step < 1 ? 1 : 0;
  const gut = Math.max(30, Math.max(...yt.ticks.map(v => v.toFixed(yd).length)) * 7 + 12);
  const pad = { l: gut, r: 16, t: 18, b: 30 };
  const iw = Math.max(10, W - pad.l - pad.r), ih = H - pad.t - pad.b;
  const x0 = ms(d.from), x1 = ms(d.to);
  const sx = (k: string) => pad.l + (x1 === x0 ? iw / 2 : (ms(k) - x0) / (x1 - x0) * iw);
  const sy = (v: number) => pad.t + (1 - (v - yt.lo) / (yt.hi - yt.lo)) * ih;
  const f = (n: number) => +n.toFixed(1);
  const font = t.type.sm.fontFamily, bold = t.type.over.fontFamily;

  // x labels, de-collided by priority
  type XL = { x: number; t: string; strong?: boolean; color?: string; pr: number; anchor?: 'start' | 'middle' | 'end'; l?: number; r?: number };
  const xl: XL[] = [{ x: sx(d.today), t: 'Today', strong: true, pr: 0 }];
  if (d.need) xl.push({ x: sx(d.need.key), t: fmtDate(d.need.key), color: t.c.teal, pr: 1 });
  if (d.proj && d.proj.reaches) xl.push({ x: sx(d.proj.key), t: fmtDate(d.proj.key), color: t.c.dProj, pr: 2 });
  xl.push({ x: pad.l, t: fmtDate(d.from), pr: 3 });
  if (!d.need || d.to !== d.need.key) xl.push({ x: pad.l + iw, t: fmtDate(d.to), pr: 4 });
  const kept: XL[] = [];
  xl.sort((p, q) => p.pr - q.pr).forEach(l => {
    const w = tw(l.t);
    l.anchor = l.x - w / 2 < pad.l - 6 ? 'start' : l.x + w / 2 > W - 2 ? 'end' : 'middle';
    l.l = l.anchor === 'start' ? l.x : l.anchor === 'end' ? l.x - w : l.x - w / 2; l.r = l.l + w;
    if (kept.every(k => (l.r as number) < (k.l as number) || (l.l as number) > (k.r as number))) kept.push(l);
  });

  const cx = sx(d.today), cy = sy(d.cur);
  const lbl = d.cur.toFixed(1), pw = lbl.length * 7.4 + 16;
  let bx = cx - pw - 10; if (bx < pad.l + 2) bx = cx + 10;
  const by = Math.max(2, Math.min(cy - 34, H - pad.b - 28));
  const u = d.unit;
  const a11y = 'Goal path. Now ' + d.cur.toFixed(1) + ' ' + u + '.' + (d.goal != null ? ' Goal ' + d.goal.toFixed(1) + ' ' + u + '.' : '') +
    (d.need ? ' Needed path reaches it on ' + fmtDate(d.need.key) + '.' : '') + (d.proj && d.proj.reaches ? ' At your recent pace you reach it on ' + fmtDate(d.proj.key) + '.' : '');

  const lerp = (a: PathPt, b: PathPt, k: string) => { const span = diffDays(a.key, b.key); if (span <= 0) return b.y; return a.y + (b.y - a.y) * clamp(diffDays(a.key, k) / span, 0, 1); };
  const onPress = (e: GestureResponderEvent) => {
    const px = e.nativeEvent.locationX;
    const frac = clamp((px - pad.l) / iw, 0, 1);
    const key = keyOf(x0 + frac * (x1 - x0));
    const rows: [string, string, string?][] = [];
    if (key <= d.today) {
      let best = d.trend[0];
      d.trend.forEach(p => { if (Math.abs(diffDays(p.key, key)) < Math.abs(diffDays(best.key, key))) best = p; });
      rows.push(['Trend', best.y.toFixed(1) + ' ' + u, t.c.dTrend]);
      setSel(s => (s && s.key === best.key ? null : { key: best.key, x: sx(best.key), rows }));
      return;
    }
    const here = { key: d.today, y: d.cur };
    if (d.need && key <= d.need.key) rows.push(['Needed path', lerp(here, d.need, key).toFixed(1) + ' ' + u, t.c.teal]);
    if (d.proj && key <= d.proj.key) rows.push(['Recent pace', lerp(here, d.proj, key).toFixed(1) + ' ' + u, t.c.dProj]);
    if (!rows.length) rows.push(['Goal', d.goal != null ? d.goal.toFixed(1) + ' ' + u : '–']);
    setSel(s => (s && s.key === key ? null : { key, x: sx(key), rows }));
  };

  return (
    <View onLayout={onLayout} style={{ width: '100%', height: H || 220 }} accessible accessibilityRole="image" accessibilityLabel={a11y}>
      {W > 0 ? (
        <Pressable onPress={onPress} accessibilityHint="Tap to read the path on a day" style={{ flex: 1 }}>
          <Svg width={W} height={H}>
            {yt.ticks.map(v => (
              <Line key={'g' + v} x1={pad.l} x2={pad.l + iw} y1={f(sy(v))} y2={f(sy(v))} stroke={t.c.dGrid} strokeWidth={1} />
            ))}
            {yt.ticks.map(v => <SvgText key={'y' + v} x={pad.l - 8} y={f(sy(v)) + 4} fontSize={12} fontFamily={font} fill={t.c.muted} textAnchor="end">{v.toFixed(yd)}</SvgText>)}
            {kept.map(l => <SvgText key={'x' + l.t + l.pr} x={f(l.x)} y={H - 8} fontSize={12} fontFamily={l.strong || l.color ? bold : font} fill={l.color || (l.strong ? t.c.ink : t.c.muted)} textAnchor={l.anchor}>{l.t}</SvgText>)}
            <Line x1={f(cx)} x2={f(cx)} y1={pad.t} y2={H - pad.b} stroke={t.c.lineStrong} strokeWidth={1} />
            {d.goal != null ? (
              <>
                <Line x1={pad.l} x2={pad.l + iw} y1={f(sy(d.goal))} y2={f(sy(d.goal))} stroke={t.c.dGoal} strokeWidth={2} strokeDasharray="6 5" strokeLinecap="round" />
                <SvgText x={pad.l + 6} y={f(sy(d.goal)) + (sy(d.goal) - 8 > pad.t + 6 ? -8 : 16)} fontSize={12} fontFamily={bold} fill={t.c.surface} stroke={t.c.surface} strokeWidth={4} strokeLinejoin="round">{'Goal ' + d.goal.toFixed(u === 'kg' ? 1 : 0).replace(/\.0$/, '') + ' ' + u}</SvgText>
                <SvgText x={pad.l + 6} y={f(sy(d.goal)) + (sy(d.goal) - 8 > pad.t + 6 ? -8 : 16)} fontSize={12} fontFamily={bold} fill={t.c.amber}>{'Goal ' + d.goal.toFixed(u === 'kg' ? 1 : 0).replace(/\.0$/, '') + ' ' + u}</SvgText>
              </>
            ) : null}
            {d.need ? <Path d={`M${f(cx)} ${f(cy)} L${f(sx(d.need.key))} ${f(sy(d.need.y))}`} fill="none" stroke={t.c.teal} strokeWidth={2} strokeDasharray="8 6" strokeLinecap="round" /> : null}
            {d.proj ? <Path d={`M${f(cx)} ${f(cy)} L${f(sx(d.proj.key))} ${f(sy(d.proj.y))}`} fill="none" stroke={t.c.dProj} strokeWidth={2.5} strokeDasharray="1 6" strokeLinecap="round" /> : null}
            {d.trend.length >= 2 ? <Path d={smooth(d.trend.map(p => ({ x: sx(p.key), y: sy(p.y) })))} fill="none" stroke={t.c.dTrend} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" /> : null}
            {d.need ? <Circle cx={f(sx(d.need.key))} cy={f(sy(d.need.y))} r={5} fill={t.c.teal} stroke={t.c.surface} strokeWidth={2} /> : null}
            {d.proj ? <Circle cx={f(sx(d.proj.key))} cy={f(sy(d.proj.y))} r={5} fill={t.c.dProj} stroke={t.c.surface} strokeWidth={2} /> : null}
            <Circle cx={f(cx)} cy={f(cy)} r={6} fill={t.c.dTrend} stroke={t.c.surface} strokeWidth={2.5} />
            <Rect x={f(bx)} y={f(by)} width={f(pw)} height={26} rx={13} fill={t.c.ink} />
            <SvgText x={f(bx + pw / 2)} y={f(by + 17)} fontSize={12} fontFamily={bold} fill={t.c.surface} textAnchor="middle">{lbl}</SvgText>
            {sel ? <Line x1={f(sel.x)} x2={f(sel.x)} y1={pad.t} y2={H - pad.b} stroke={t.c.lineStrong} strokeWidth={1.5} /> : null}
          </Svg>
          {sel ? (
            <View pointerEvents="none" style={{
              position: 'absolute', top: 0, left: clamp(sel.x - 95, 0, Math.max(0, W - 190)), width: 190, padding: 12, borderRadius: 14, gap: 4,
              backgroundColor: t.dark ? t.c.elevated : t.c.surface, borderWidth: 1, borderColor: t.c.line, ...t.shadow(2),
            }}>
              <Txt variant="cap" color="muted">{relDay(sel.key)}</Txt>
              {sel.rows.map(([a, b, c]) => (
                <View key={a} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {c ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c }} /> : null}
                  <Txt variant="sm" color="ink2" style={{ flex: 1 }}>{a}</Txt>
                  <Txt variant="sm" num style={{ fontFamily: t.type.bodyStrong.fontFamily }}>{b}</Txt>
                </View>
              ))}
            </View>
          ) : null}
        </Pressable>
      ) : null}
    </View>
  );
}
