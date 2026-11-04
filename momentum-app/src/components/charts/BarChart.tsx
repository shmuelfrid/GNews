/* BarChart (pos/neg colors, dashed reference line, x labels, value labels, tap tooltip) · StackedBar · Sparkline. */
import { useState } from 'react';
import { type LayoutChangeEvent, Pressable, View } from 'react-native';
import Svg, { Defs, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { int } from '../../lib/format';
import { useTheme } from '../../theme';
import { Dot, Txt } from '../core';
import type { Tip } from './LineChart';

export interface Bar { label: string; value: number; highlight?: boolean; muted?: boolean; color?: string }
export interface BarChartProps {
  bars: Bar[];
  /** dashed reference (e.g. target deficit) */
  reference?: { value: number; label?: string } | null;
  valueFmt?: (v: number) => string;
  /** value labels: 'auto' = highlighted bar + all when bars are wide; 'all'; 'none' */
  labels?: 'auto' | 'all' | 'none';
  height?: number;
  /** positive bars (default deficit teal) */
  posColor?: string;
  /** negative bars (default surplus amber) */
  negColor?: string;
  tip?: (bar: Bar, i: number) => Tip | null;
  onBarPress?: (bar: Bar, i: number) => void;
  accessibilityLabel?: string;
}
export function BarChart({ bars, reference: refLine, valueFmt = int, labels = 'auto', height = 200, posColor, negColor, tip, onBarPress, accessibilityLabel }: BarChartProps) {
  const t = useTheme();
  const [w, setW] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const pos = posColor || t.c.dDeficit, neg = negColor || t.c.dSurplus;
  const vals = bars.map(b => (isFinite(b.value) ? b.value : 0)).concat(refLine && isFinite(refLine.value) ? [refLine.value] : []);
  const max = Math.max(0, ...vals), min = Math.min(0, ...vals);
  const span = max - min || 1;
  const T = 22, B = 24, ph = height - T - B;
  const n = Math.max(1, bars.length);
  const slot = w / n;
  const bw = Math.max(6, Math.min(36, slot * 0.58));
  const y = (v: number) => T + ((max - v) / span) * ph;
  const zero = y(0);
  const showVal = (b: Bar) => labels === 'all' || (labels === 'auto' && (b.highlight || slot >= 44));
  const labelEvery = slot < 30 ? Math.ceil(30 / slot) : 1;
  const tipData = sel != null && tip ? tip(bars[sel], sel) : null;
  return (
    <View style={{ gap: 8 }}>
      {refLine && refLine.label ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 18, height: 0, borderTopWidth: 2, borderStyle: 'dashed', borderColor: t.c.ink2 }} />
          <Txt variant="cap" color="muted">{refLine.label}</Txt>
        </View>
      ) : null}
      <View onLayout={(e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width))} style={{ height, width: '100%' }} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
        {w > 0 ? (
          <Svg width={w} height={height}>
            <Line x1={0} x2={w} y1={zero} y2={zero} stroke={t.c.lineStrong} strokeWidth={1} />
            {bars.map((b, i) => {
              const v = isFinite(b.value) ? b.value : 0;
              const cx = slot * i + slot / 2;
              const top = Math.min(y(v), zero), h = Math.max(Math.abs(y(v) - zero), v === 0 ? 0 : 2);
              const col = b.color || (v >= 0 ? pos : neg);
              const r = Math.min(6, bw / 2, h / 2);
              // rounded only on the outer end
              const x0 = cx - bw / 2, x1 = cx + bw / 2;
              const d = v >= 0
                ? `M${x0} ${top + h} L${x0} ${top + r} Q${x0} ${top} ${x0 + r} ${top} L${x1 - r} ${top} Q${x1} ${top} ${x1} ${top + r} L${x1} ${top + h} Z`
                : `M${x0} ${top} L${x1} ${top} L${x1} ${top + h - r} Q${x1} ${top + h} ${x1 - r} ${top + h} L${x0 + r} ${top + h} Q${x0} ${top + h} ${x0} ${top + h - r} Z`;
              return (
                <Path key={i} d={h > 0 ? d : ''} fill={col} fillOpacity={b.muted ? 0.35 : sel === i || b.highlight || sel == null ? 1 : 0.75} />
              );
            })}
            {refLine && isFinite(refLine.value) ? <Line x1={0} x2={w} y1={y(refLine.value)} y2={y(refLine.value)} stroke={t.c.ink2} strokeWidth={1.5} strokeDasharray="5 5" /> : null}
            {bars.map((b, i) => showVal(b) && isFinite(b.value) && b.value !== 0 ? (
              <SvgText key={'v' + i} x={slot * i + slot / 2} y={b.value >= 0 ? y(b.value) - 6 : y(b.value) + 15} fontSize={12} fontFamily={b.highlight ? t.type.over.fontFamily : t.type.sm.fontFamily} fill={b.highlight ? t.c.ink : t.c.ink2} textAnchor="middle">{valueFmt(b.value)}</SvgText>
            ) : null)}
            {bars.map((b, i) => (i % labelEvery === 0 || b.highlight) ? (
              <SvgText key={'l' + i} x={slot * i + slot / 2} y={height - 6} fontSize={12} fontFamily={b.highlight ? t.type.over.fontFamily : t.type.sm.fontFamily} fill={b.highlight ? t.c.ink : t.c.muted} textAnchor="middle">{b.label}</SvgText>
            ) : null)}
          </Svg>
        ) : null}
        {w > 0 && (tip || onBarPress) ? (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row' }}>
            {bars.map((b, i) => (
              <Pressable key={i} style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={`${b.label}: ${valueFmt(b.value)}`}
                onPress={() => { onBarPress?.(b, i); if (tip) setSel(s => (s === i ? null : i)); }} />
            ))}
          </View>
        ) : null}
        {sel != null && tipData ? (
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: Math.max(0, Math.min(w - 180, slot * sel + slot / 2 - 90)), width: 180, padding: 12, borderRadius: 14, gap: 4, backgroundColor: t.dark ? t.c.elevated : t.c.surface, borderWidth: 1, borderColor: t.c.line, ...t.shadow(2) }}>
            <Txt variant="cap" color="muted">{tipData.title}</Txt>
            {tipData.rows.map(([a, b]) => (
              <View key={a} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Txt variant="sm" color="ink2">{a}</Txt><Txt variant="sm" num style={{ fontFamily: t.type.bodyStrong.fontFamily }}>{b}</Txt>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/* ---------------- StackedBar ---------------- */
export interface Segment { label: string; value: number; color: string }
/** horizontal stacked bar with optional legend (label · value). max defaults to the sum. */
export function StackedBar({ segments, max, legend = true, valueFmt = int, height = 14, accessibilityLabel }: { segments: Segment[]; max?: number; legend?: boolean; valueFmt?: (v: number) => string; height?: number; accessibilityLabel?: string }) {
  const t = useTheme();
  const total = segments.reduce((s, x) => s + Math.max(0, x.value || 0), 0);
  const m = Math.max(max || 0, total) || 1;
  return (
    <View style={{ gap: 12 }} accessible accessibilityLabel={accessibilityLabel || segments.map(s => `${s.label} ${valueFmt(s.value)}`).join(', ')}>
      <View style={{ flexDirection: 'row', height, borderRadius: 999, overflow: 'hidden', backgroundColor: t.c.dTrack, gap: 2 }}>
        {segments.filter(s => s.value > 0).map(s => <View key={s.label} style={{ width: `${(s.value / m) * 100}%`, backgroundColor: s.color }} />)}
      </View>
      {legend ? (
        <View style={{ gap: 8 }}>
          {segments.map(s => (
            <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Dot color={s.color} square size={10} />
              <Txt variant="sm" color="ink2" style={{ flex: 1 }} numberOfLines={1}>{s.label}</Txt>
              <Txt variant="sm" num style={{ fontFamily: t.type.bodyStrong.fontFamily }}>{valueFmt(s.value)}</Txt>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/* ---------------- Sparkline ---------------- */
export function Sparkline({ values, width = 96, height = 32, color, area = false, strokeWidth = 2 }: { values: number[]; width?: number; height?: number; color?: string; area?: boolean; strokeWidth?: number }) {
  const t = useTheme();
  const v = values.filter(x => isFinite(x));
  if (v.length < 2) return <View style={{ width, height }} />;
  const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
  const pts = v.map((y, i) => [2 + (i / (v.length - 1)) * (width - 4), 2 + (1 - (y - lo) / span) * (height - 4)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const col = color || t.c.dTrend;
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="spk" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={col} stopOpacity={0.2} /><Stop offset="1" stopColor={col} stopOpacity={0} /></LinearGradient>
      </Defs>
      {area ? <Path d={d + ` L${pts[pts.length - 1][0]} ${height} L${pts[0][0]} ${height} Z`} fill="url(#spk)" /> : null}
      <Path d={d} stroke={col} strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Rect x={pts[pts.length - 1][0] - 2.5} y={pts[pts.length - 1][1] - 2.5} width={5} height={5} rx={2.5} fill={col} />
    </Svg>
  );
}
