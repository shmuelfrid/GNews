/* LineChart — weigh-in dots, trend line, dashed goal + projection, latest bubble, press/drag tooltip. Width-responsive. */
import { useMemo, useState } from 'react';
import { type LayoutChangeEvent, Pressable, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { addDays, diffDays } from '../../lib/calc';
import { fmtDate } from '../../lib/format';
import { useTheme } from '../../theme';
import { Txt } from '../core';

export interface Pt { key: string; y: number }
export interface Tip { title: string; rows: [string, string][] }
export interface LineChartProps {
  /** raw points (muted dots) — y in DISPLAY units */
  dots?: Pt[];
  /** the trend line */
  line?: Pt[];
  goal?: number | null; goalLabel?: string;
  /** dashed projection, usually [{last trend}, {projKey, goal}] */
  projection?: Pt[]; projectionLabel?: string;
  domain?: { from: string; to: string };
  height?: number;
  yFmt?: (v: number) => string;
  /** bubble over the latest line point */
  latestLabel?: string;
  tip?: (key: string) => Tip | null;
  /** soft area under the trend line */
  area?: boolean;
  accessibilityLabel?: string;
  emptyText?: string;
}
const LABEL = 12;
function niceTicks(min: number, max: number, n = 4): number[] {
  const span = max - min || 1;
  const raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) || mag * 10;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

export function LineChart({ dots = [], line = [], goal, goalLabel, projection = [], projectionLabel, domain, height = 240, yFmt = v => v.toFixed(0), latestLabel, tip, area = true, accessibilityLabel, emptyText = 'Log a few weigh-ins to see your trend' }: LineChartProps) {
  const t = useTheme();
  const [w, setW] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const all = [...dots, ...line, ...projection];
  const geo = useMemo(() => {
    if (!w || !all.length) return null;
    const keys = all.map(p => p.key).sort();
    const from = domain?.from || keys[0], to = domain?.to || keys[keys.length - 1];
    const days = Math.max(1, diffDays(from, to));
    const ys = all.filter(p => p.key >= from && p.key <= to).map(p => p.y).concat(goal != null && isFinite(goal) ? [goal] : []);
    let lo = Math.min(...ys), hi = Math.max(...ys);
    if (!isFinite(lo)) return null;
    const pad = Math.max((hi - lo) * 0.07, 0.6);
    lo -= pad; hi += pad;
    const ticks = niceTicks(lo, hi, height < 200 ? 3 : 4);
    const yLabelW = Math.max(...ticks.map(v => yFmt(v).length)) * 7.4 + 10;
    const L = yLabelW, R = 14, T = latestLabel ? 34 : 14, B = 26;
    const pw = Math.max(10, w - L - R), ph = height - T - B;
    const x = (k: string) => L + (diffDays(from, k) / days) * pw;
    const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * ph;
    return { from, to, days, lo, hi, ticks, L, R, T, B, pw, ph, x, y };
  }, [w, all.length, dots, line, projection, goal, domain?.from, domain?.to, height, latestLabel, yFmt]); // eslint-disable-line react-hooks/exhaustive-deps

  const onLayout = (e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width));
  if (!all.length) {
    return (
      <View style={{ height, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: t.c.surface2 }}>
        <Txt variant="sm" color="muted" center style={{ paddingHorizontal: 24 }}>{emptyText}</Txt>
      </View>
    );
  }
  const vis = (p: Pt) => !geo || (p.key >= geo.from && p.key <= geo.to);
  const pathOf = (pts: Pt[]) => geo ? pts.filter(vis).map((p, i) => (i ? 'L' : 'M') + geo.x(p.key).toFixed(1) + ' ' + geo.y(p.y).toFixed(1)).join(' ') : '';
  const lineVis = line.filter(vis);
  const last = lineVis[lineVis.length - 1];
  // x labels: start / middle / end (thinned to fit)
  let xLabels = geo ? (w < 300 ? [geo.from, geo.to] : [geo.from, addDays(geo.from, Math.round(geo.days / 2)), geo.to]) : [];
  // the projection label already names the end date
  if (geo && projectionLabel && projection.length > 1 && projection[projection.length - 1].key === geo.to) xLabels = xLabels.slice(0, -1);
  const onPress = (e: GestureResponderEvent) => {
    if (!geo || !tip) return;
    const px = e.nativeEvent.locationX;
    const cands = (line.length ? line : dots).filter(vis);
    let best: Pt | null = null, bd = Infinity;
    cands.forEach(p => { const d = Math.abs(geo.x(p.key) - px); if (d < bd) { bd = d; best = p; } });
    const k = best ? (best as Pt).key : null;
    setSel(cur => (cur === k ? null : k));
  };
  const selPt = sel ? (line.find(p => p.key === sel) || dots.find(p => p.key === sel)) : null;
  const tipData = sel && tip ? tip(sel) : null;
  const label = (s: string, x: number, y: number, anchor: 'start' | 'middle' | 'end' = 'middle', color = t.c.muted, weight = '500') => (
    <SvgText x={x} y={y} fontSize={LABEL} fontFamily={weight === '700' ? t.type.over.fontFamily : t.type.sm.fontFamily} fill={color} textAnchor={anchor}>{s}</SvgText>
  );

  return (
    <View onLayout={onLayout} style={{ height, width: '100%' }} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      {geo ? (
        <Pressable onPress={onPress} disabled={!tip} accessibilityHint={tip ? 'Tap to see a day' : undefined} style={{ flex: 1 }}>
          <Svg width={w} height={height}>
            <Defs>
              <LinearGradient id="lcArea" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={t.c.dProj} stopOpacity={t.dark ? 0.22 : 0.12} />
                <Stop offset="1" stopColor={t.c.dProj} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {geo.ticks.map(v => (
              <Line key={'g' + v} x1={geo.L} x2={w - geo.R} y1={geo.y(v)} y2={geo.y(v)} stroke={t.c.dGrid} strokeWidth={1} />
            ))}
            {geo.ticks.map(v => <SvgText key={'yl' + v} x={geo.L - 8} y={geo.y(v) + 4} fontSize={LABEL} fontFamily={t.type.sm.fontFamily} fill={t.c.muted} textAnchor="end">{yFmt(v)}</SvgText>)}
            {xLabels.map((k, i) => <SvgText key={'xl' + k + i} x={i === 0 ? geo.L : k === geo.to ? w - geo.R : geo.x(k)} y={height - 6} fontSize={LABEL} fontFamily={t.type.sm.fontFamily} fill={t.c.muted} textAnchor={i === 0 ? 'start' : k === geo.to ? 'end' : 'middle'}>{fmtDate(k)}</SvgText>)}
            {goal != null && isFinite(goal) ? (
              <>
                <Line x1={geo.L} x2={w - geo.R} y1={geo.y(goal)} y2={geo.y(goal)} stroke={t.c.dGoal} strokeWidth={1.5} strokeDasharray="5 5" />
                {goalLabel ? label(goalLabel, geo.L + 4, geo.y(goal) - 6, 'start', t.c.amber, '700') : null}
              </>
            ) : null}
            {area && lineVis.length > 1 ? (
              <Path d={pathOf(line) + ` L${geo.x(lineVis[lineVis.length - 1].key).toFixed(1)} ${geo.T + geo.ph} L${geo.x(lineVis[0].key).toFixed(1)} ${geo.T + geo.ph} Z`} fill="url(#lcArea)" />
            ) : null}
            {dots.filter(vis).map((p, i) => <Circle key={'d' + i} cx={geo.x(p.key)} cy={geo.y(p.y)} r={2.6} fill={t.c.dDot} />)}
            {projection.length > 1 ? <Path d={pathOf(projection)} stroke={t.c.dProj} strokeWidth={2} strokeDasharray="6 6" fill="none" strokeLinecap="round" /> : null}
            {projection.length > 1 && projectionLabel ? (() => { const p = projection.filter(vis).slice(-1)[0]; return p ? label(projectionLabel, Math.min(geo.x(p.key), w - geo.R), geo.y(p.y) + 18, geo.x(p.key) > w - 60 ? 'end' : 'middle', t.c.brand, '700') : null; })() : null}
            {lineVis.length > 1 ? <Path d={pathOf(line)} stroke={t.c.dTrend} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
            {last ? <Circle cx={geo.x(last.key)} cy={geo.y(last.y)} r={5} fill={t.c.dTrend} stroke={t.c.surface} strokeWidth={2} /> : null}
            {last && latestLabel ? (() => {
              const bw = latestLabel.length * 7.6 + 18, bx = Math.max(geo.L, Math.min(w - geo.R - bw, geo.x(last.key) - bw / 2)), by = geo.y(last.y) - 34;
              return (
                <>
                  <Rect x={bx} y={Math.max(2, by)} width={bw} height={24} rx={12} fill={t.c.dTrend} />
                  <SvgText x={bx + bw / 2} y={Math.max(2, by) + 16} fontSize={12} fontFamily={t.type.over.fontFamily} fill={t.c.surface} textAnchor="middle">{latestLabel}</SvgText>
                </>
              );
            })() : null}
            {selPt ? (
              <>
                <Line x1={geo.x(selPt.key)} x2={geo.x(selPt.key)} y1={geo.T} y2={geo.T + geo.ph} stroke={t.c.lineStrong} strokeWidth={1} />
                <Circle cx={geo.x(selPt.key)} cy={geo.y(selPt.y)} r={6} fill={t.c.brand} stroke={t.c.surface} strokeWidth={2} />
              </>
            ) : null}
          </Svg>
          {selPt && tipData ? (
            <View pointerEvents="none" style={{
              position: 'absolute', top: 4, left: Math.max(0, Math.min(w - 180, geo.x(selPt.key) - 90)), width: 180, padding: 12, borderRadius: 14, gap: 4,
              backgroundColor: t.dark ? t.c.elevated : t.c.surface, borderWidth: 1, borderColor: t.c.line, ...t.shadow(2),
            }}>
              <Txt variant="cap" color="muted">{tipData.title}</Txt>
              {tipData.rows.map(([a, b]) => (
                <View key={a} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <Txt variant="sm" color="ink2">{a}</Txt><Txt variant="sm" num style={{ fontFamily: t.type.bodyStrong.fontFamily }}>{b}</Txt>
                </View>
              ))}
            </View>
          ) : null}
        </Pressable>
      ) : null}
    </View>
  );
}
