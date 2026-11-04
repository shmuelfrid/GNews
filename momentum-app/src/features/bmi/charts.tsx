/* BMI scale (4 bands, boundary weights for the user's height, Start / Now / Goal markers) + BMI trend over tinted bands.
   Ports of bmi.js drawScale / drawTrend. SVG sized to the container via onLayout. */
import { useState } from 'react';
import { type GestureResponderEvent, type LayoutChangeEvent, Pressable, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText, TSpan } from 'react-native-svg';
import { Txt } from '@/components';
import { BMI_CATS, diffDays, addDays } from '@/lib/calc';
import { clamp, fmtDate, relDay, type Units } from '@/lib/format';
import { useTheme } from '@/theme';
import { b1, catOf, dateY, kgFor, SHORT, wRound, type BmiOk, type TrendRange, trendView } from './model';
import { bmiColors, onBand } from './palette';

const textW = (s: string, weight = 600) => s.length * (weight >= 700 ? 7.1 : weight >= 600 ? 6.8 : 6.3);
const fin = (v: unknown): v is number => typeof v === 'number' && isFinite(v);
function useWidth() {
  const [w, setW] = useState(0);
  return [w, (e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width))] as const;
}

/* ================= scale ================= */
export function BmiScale({ m, U }: { m: BmiOk; U: Units }) {
  const t = useTheme();
  const bc = bmiColors(t.dark);
  const [W, onLayout] = useWidth();
  const p = m.p, u = U.unit;
  const bold = t.type.over.fontFamily, semi = t.type.bodyStrong.fontFamily, med = t.type.sm.fontFamily;
  const marks = [m.bmi, m.startBmi, m.goalBmi].filter(fin);
  let lo = Math.min(15, Math.floor(Math.min(...marks) - 1));
  let hi = Math.max(34, Math.ceil(Math.max(...marks) + 1.5));
  hi = Math.min(hi, 60); lo = Math.max(lo, 10);
  const x = (b: number) => (clamp(b, lo, hi) - lo) / (hi - lo) * W;
  const BAND_Y = 22, BAND_H = 28, GAP = 2;

  type Above = { b: number; text: string; color: string; w: number; cx: number };
  const above: Above[] = [];
  if (fin(m.startBmi) && p.startDate && p.startDate < m.today && Math.abs(m.startBmi - m.bmi) >= 0.05) above.push({ b: m.startBmi, text: 'Start ' + b1(m.startBmi), color: t.c.ink2, w: 0, cx: 0 });
  if (fin(m.goalBmi) && !(m.pl && m.pl.goalReached)) above.push({ b: m.goalBmi, text: 'Goal ' + b1(m.goalBmi), color: t.c.amber, w: 0, cx: 0 });
  above.sort((a, b) => a.b - b.b);
  above.forEach(o => { o.w = textW(o.text, 700); o.cx = clamp(x(o.b), o.w / 2, W - o.w / 2); });
  if (above.length === 2 && above[1].cx - above[0].cx < (above[0].w + above[1].w) / 2 + 10) {
    const need = (above[0].w + above[1].w) / 2 + 10, mid = (above[0].cx + above[1].cx) / 2;
    above[0].cx = clamp(mid - need / 2, above[0].w / 2, W - need - above[1].w / 2);
    above[1].cx = above[0].cx + need;
  }

  const nx = x(m.bmi), nowTxt = 'Now ' + b1(m.bmi), pw = textW(nowTxt, 700) + 24;
  const px = clamp(nx - pw / 2, 0, Math.max(0, W - pw));

  type Bnd = { b: number; bt: string; wt: string; w: number; cx: number; row: number };
  const bnds: Bnd[] = [18.5, 25, 30].filter(b => b > lo && b < hi).map(b => {
    const bt = (b === 18.5 ? '18.5' : String(b)) + ' · ', wt = wRound(kgFor(b, m.cm), U) + ' ' + u;
    const w = textW(bt, 500) + textW(wt, 700);
    return { b, bt, wt, w, cx: clamp(x(b), w / 2, W - w / 2), row: 0 };
  });
  const lim = (o: Bnd) => [Math.max(o.w / 2, x(o.b) - 36), Math.min(W - o.w / 2, x(o.b) + 36)];
  for (let it = 0; it < 12; it++) for (let i = 1; i < bnds.length; i++) {
    const a = bnds[i - 1], c = bnds[i], d = (a.w + c.w) / 2 + 16 - (c.cx - a.cx);
    if (d > 0) { const la = lim(a), lc = lim(c); a.cx = clamp(a.cx - d / 2, la[0], la[1]); c.cx = clamp(c.cx + d / 2, lc[0], lc[1]); }
  }
  const fits = bnds.every((o, i) => !i || o.cx - bnds[i - 1].cx >= (o.w + bnds[i - 1].w) / 2 + 14);
  if (!fits) {
    bnds.forEach(o => { o.cx = clamp(x(o.b), o.w / 2, W - o.w / 2); });
    for (let i = 1; i < bnds.length; i++) if (bnds[i].cx - bnds[i - 1].cx < (bnds[i].w + bnds[i - 1].w) / 2 + 8 && bnds[i - 1].row === 0) bnds[i].row = 1;
  }
  const H = bnds.some(b => b.row) ? 128 : 110;
  const a11y = 'BMI scale for your height. ' + BMI_CATS.map(c => c.label + (c.key === 'under' ? ' below 18.5, under ' + wRound(kgFor(18.5, m.cm), U) + ' ' + u
    : c.key === 'obese' ? ' 30 and above, ' + wRound(kgFor(30, m.cm), U) + ' ' + u + ' and up'
      : ' ' + c.min + ' to ' + (c.max - 0.1).toFixed(1) + ', ' + wRound(kgFor(c.min, m.cm), U) + ' to ' + wRound(kgFor(c.max, m.cm), U) + ' ' + u)).join('. ') +
    '. You are now ' + b1(m.bmi) + (fin(m.goalBmi) ? ', and your goal is ' + b1(m.goalBmi) : '') + '.';

  return (
    <View onLayout={onLayout} style={{ width: '100%', height: H }} accessible accessibilityRole="image" accessibilityLabel={a11y}>
      {W > 0 ? (
        <Svg width={W} height={H}>
          {above.map(o => (
            <G key={o.text}>
              <SvgText x={o.cx} y={11} fontSize={12} fontFamily={bold} fill={o.color} textAnchor="middle">{o.text}</SvgText>
              <Path d={`M${x(o.b) - 4} 15H${x(o.b) + 4}L${x(o.b)} 20.5Z`} fill={o.color} />
            </G>
          ))}
          {BMI_CATS.map((c, i) => {
            const a = x(Math.max(c.min, lo)), b = x(Math.min(c.max, hi));
            if (b - a < 1) return null;
            const x0 = a + (i ? GAP / 2 : 0), x1 = b - (i < 3 ? GAP / 2 : 0), bw = x1 - x0;
            const lbl = textW(c.label) + 6 <= bw ? c.label : textW(SHORT[c.key]) + 6 <= bw ? SHORT[c.key] : '';
            return (
              <G key={c.key}>
                <Rect x={x0} y={BAND_Y} width={Math.max(0, bw)} height={BAND_H} rx={i === 0 || i === 3 ? 8 : 6} fill={bc[c.key].band} />
                {lbl ? <SvgText x={(x0 + x1) / 2} y={40.5} fontSize={12} fontFamily={semi} fill={onBand(t.dark)} textAnchor="middle">{lbl}</SvgText> : null}
              </G>
            );
          })}
          <Path d={`M${nx} 52.5L${nx + 5.5} 58.5H${nx - 5.5}Z`} fill={t.c.ink} />
          <Rect x={px} y={58} width={pw} height={26} rx={13} fill={t.c.ink} />
          <SvgText x={px + pw / 2} y={75.5} fontSize={12} fontFamily={bold} fill={t.c.surface} textAnchor="middle">{nowTxt}</SvgText>
          {bnds.map(o => (
            <G key={o.b}>
              <Path d={`M${x(o.b)} 88V${93 + o.row * 18}`} stroke={t.c.lineStrong} strokeWidth={1.5} strokeLinecap="round" />
              <SvgText x={o.cx} y={106 + o.row * 18} fontSize={12} textAnchor="middle">
                <TSpan fontFamily={med} fill={t.c.muted}>{o.bt}</TSpan>
                <TSpan fontFamily={bold} fill={t.c.ink}>{o.wt}</TSpan>
              </SvgText>
            </G>
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

/* ================= trend ================= */
export function BmiTrend({ m, U, range }: { m: BmiOk; U: Units; range: TrendRange }) {
  const t = useTheme();
  const bc = bmiColors(t.dark);
  const [W, onLayout] = useWidth();
  const [sel, setSel] = useState<number | null>(null);
  const tv = trendView(m, range);
  const bold = t.type.over.fontFamily, med = t.type.sm.fontFamily, semi = t.type.bodyStrong.fontFamily;
  if (tv.pts.length < 2) {
    return (
      <View style={{ height: 150, alignItems: 'center', justifyContent: 'center', borderRadius: t.radius.md, backgroundColor: t.c.surface2, paddingHorizontal: 24 }}>
        <Txt variant="sm" color="muted" center>Weigh in on a few more days and your BMI trend line appears here</Txt>
      </View>
    );
  }
  const H = Math.round(clamp(W * 0.42, 150, 220));
  const pad = { l: 34, r: 4, t: 16, b: 22 };
  const iw = Math.max(10, W - pad.l - pad.r), ih = H - pad.t - pad.b;
  const k0 = tv.pts[0].key, kEnd = tv.proj ? tv.proj.key : m.today;
  const span = Math.max(1, diffDays(k0, kEnd));
  const sx = (k: string) => pad.l + diffDays(k0, k) / span * iw;
  const vals = tv.pts.map(d => d.bmi).concat(tv.proj ? [tv.proj.bmi] : []);
  let lo = Math.floor(Math.min(...vals) - 0.6), hi = Math.ceil(Math.max(...vals) + 0.6);
  if (hi - lo < 3) { const c = (hi + lo) / 2; lo = Math.floor(c - 1.5); hi = Math.ceil(c + 1.5); }
  const sy = (b: number) => pad.t + (hi - b) / (hi - lo) * ih;
  const shown = BMI_CATS.filter(c => Math.min(c.max, hi) > Math.max(c.min, lo));
  const ticks: { v: number; y: number }[] = [{ v: hi, y: sy(hi) }, { v: lo, y: sy(lo) }];
  const bounds = [18.5, 25, 30];
  bounds.forEach(b => { if (b > lo && b < hi) ticks.push({ v: b, y: sy(b) }); });
  ticks.sort((a, b) => a.y - b.y);
  const kept: { v: number; y: number }[] = [];
  ticks.forEach(tk => {
    const isB = bounds.includes(tk.v); const clash = kept.find(k => Math.abs(k.y - tk.y) < 20);
    if (!clash) kept.push(tk); else if (isB && !bounds.includes(clash.v)) kept.splice(kept.indexOf(clash), 1, tk);
  });
  const last = tv.pts[tv.pts.length - 1];
  const lx = sx(last.key), ly = sy(last.bmi);
  const ex = tv.proj ? sx(tv.proj.key) : 0, ey = tv.proj ? sy(tv.proj.bmi) : 0;
  const bw = 52, bx = clamp(lx - bw + 6, pad.l + 2, pad.l + iw - bw);
  const by = ly + 10 + 22 > H - pad.b ? ly - 32 : ly + 10;
  type XL = { x: number; a: 'start' | 'middle' | 'end'; t: string; strong?: boolean };
  const xl: XL[] = [{ x: pad.l, a: 'start', t: fmtDate(k0) }];
  let mid: XL;
  if (tv.proj) { mid = { x: lx, a: 'middle', t: 'Today', strong: true }; xl.push({ x: pad.l + iw, a: 'end', t: dateY(tv.proj.key) }); }
  else { const mk = addDays(k0, Math.round(span / 2)); mid = { x: sx(mk), a: 'middle', t: fmtDate(mk) }; xl.push({ x: pad.l + iw, a: 'end', t: last.key === m.today ? 'Today' : fmtDate(last.key), strong: last.key === m.today }); }
  const ext = (l: XL) => { const w = textW(l.t); return l.a === 'start' ? [l.x, l.x + w] : l.a === 'end' ? [l.x - w, l.x] : [l.x - w / 2, l.x + w / 2]; };
  const e1 = ext(mid);
  if (e1[0] > ext(xl[0])[1] + 8 && e1[1] < ext(xl[1])[0] - 8) xl.splice(1, 0, mid);
  const a11y = 'BMI trend, ' + range + ' view: from ' + b1(tv.pts[0].bmi) + ' to ' + b1(last.bmi) + ' now, in the ' + m.cat.label.toLowerCase() + ' band' +
    (tv.proj ? '. At plan pace, BMI reaches ' + b1(tv.proj.bmi) + ' on ' + dateY(tv.proj.key) + '.' : '.');
  const onPress = (e: GestureResponderEvent) => {
    const mx = e.nativeEvent.locationX;
    let best = -1, bd = Infinity;
    tv.pts.forEach((d, i) => { const dd = Math.abs(sx(d.key) - mx); if (dd < bd) { bd = dd; best = i; } });
    setSel(s => (s === best ? null : best));
  };
  const sp = sel != null ? tv.pts[sel] : null;
  const sc = sp ? catOf(sp.bmi) : null;

  return (
    <View style={{ gap: 12 }}>
      <View onLayout={onLayout} style={{ width: '100%', height: W ? H : 180 }} accessible accessibilityRole="image" accessibilityLabel={a11y}>
        {W > 0 ? (
          <Pressable onPress={onPress} style={{ flex: 1 }} accessibilityHint="Tap to see a day">
            <Svg width={W} height={H}>
              {shown.map(c => {
                const a = Math.max(c.min, lo), b = Math.min(c.max, hi);
                return <Rect key={c.key} x={pad.l} y={sy(b)} width={iw} height={sy(a) - sy(b)} fill={bc[c.key].tint} />;
              })}
              {bounds.filter(b => b > lo && b < hi).map(b => <Path key={b} d={`M${pad.l} ${sy(b)}H${pad.l + iw}`} stroke={t.c.lineStrong} strokeWidth={1} strokeDasharray="3 4" />)}
              {kept.map(tk => <SvgText key={tk.v} x={pad.l - 8} y={tk.y + 4} fontSize={12} fontFamily={med} fill={t.c.muted} textAnchor="end">{tk.v % 1 ? tk.v.toFixed(1) : String(tk.v)}</SvgText>)}
              {tv.proj ? (
                <>
                  <Path d={`M${lx} ${ly}L${ex} ${ey}`} stroke={t.c.dProj} strokeWidth={2} strokeDasharray="5 4" strokeLinecap="round" fill="none" />
                  <Circle cx={ex} cy={ey} r={4} fill={t.c.surface} stroke={t.c.dProj} strokeWidth={2} />
                  <SvgText x={pad.l + iw} y={clamp(ey + (tv.proj.bmi < last.bmi ? -10 : 18), 12, H - pad.b - 4)} fontSize={12} fontFamily={bold} fill={t.c.ink} textAnchor="end">{b1(tv.proj.bmi)}</SvgText>
                  {ex - lx > 110 ? (
                    <SvgText x={lx + 46} y={clamp(ly + 46 * (ey - ly) / (ex - lx) + (tv.proj.bmi < last.bmi ? -8 : 16), 12, H - pad.b - 4)} fontSize={12} fontFamily={bold} fill={t.c.dProj}>Plan pace</SvgText>
                  ) : null}
                </>
              ) : null}
              <Path d={tv.pts.map((d, i) => (i ? 'L' : 'M') + sx(d.key).toFixed(1) + ' ' + sy(d.bmi).toFixed(1)).join('')} stroke={t.c.dTrend} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" fill="none" />
              <SvgText x={pad.l + 6} y={Math.max(11, sy(tv.pts[0].bmi) - 8)} fontSize={12} fontFamily={semi} fill={t.c.ink2}>{b1(tv.pts[0].bmi)}</SvgText>
              <Circle cx={lx} cy={ly} r={5} fill={t.c.dTrend} stroke={t.c.surface} strokeWidth={2} />
              <Rect x={bx} y={by} width={bw} height={22} rx={11} fill={t.c.ink} />
              <SvgText x={bx + bw / 2} y={by + 15} fontSize={12} fontFamily={bold} fill={t.c.surface} textAnchor="middle">{b1(last.bmi)}</SvgText>
              {xl.map(l => <SvgText key={l.t + l.a} x={l.x} y={H - 4} fontSize={12} fontFamily={l.strong ? bold : med} fill={l.strong ? t.c.ink : t.c.muted} textAnchor={l.a}>{l.t}</SvgText>)}
              {sp ? (
                <>
                  <Line x1={sx(sp.key)} x2={sx(sp.key)} y1={pad.t} y2={pad.t + ih} stroke={t.c.lineStrong} strokeWidth={1.5} />
                  <Circle cx={sx(sp.key)} cy={sy(sp.bmi)} r={6} fill={t.c.brand} stroke={t.c.surface} strokeWidth={2} />
                </>
              ) : null}
            </Svg>
            {sp ? (
              <View pointerEvents="none" style={{
                position: 'absolute', top: 0, left: clamp(sx(sp.key) - 90, 0, Math.max(0, W - 180)), width: 180, padding: 12, borderRadius: 14, gap: 4,
                backgroundColor: t.dark ? t.c.elevated : t.c.surface, borderWidth: 1, borderColor: t.c.line, ...t.shadow(2),
              }}>
                <Txt variant="cap" color="muted">{relDay(sp.key)}</Txt>
                {([['BMI', b1(sp.bmi)], ['Trend weight', U.w(sp.kg)], ['Category', sc ? sc.label : '–']] as const).map(([a, b]) => (
                  <View key={a} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                    <Txt variant="sm" color="ink2">{a}</Txt><Txt variant="sm" num style={{ fontFamily: semi }}>{b}</Txt>
                  </View>
                ))}
              </View>
            ) : null}
          </Pressable>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 6 }} accessibilityLabel={'Legend: ' + shown.map(c => c.label).join(', ')}>
        {shown.map(c => (
          <View key={c.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 3, borderWidth: 1.5, borderColor: bc[c.key].band, backgroundColor: bc[c.key].tint }} />
            <Txt variant="cap" color="muted">{c.label}</Txt>
          </View>
        ))}
      </View>
    </View>
  );
}
