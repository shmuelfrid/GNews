/* "Your climb" card: big current weight, SVG mountain with milestone flags placed by real progress, pulsing you-are-here,
   summit flag with projected date, tappable flag stories, BMI row → /bmi. */
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { Icon, prefersReducedMotion, tap, Txt } from '@/components';
import type { Units } from '@/lib/format';
import { fonts, useTheme } from '@/theme';
import { climbLayout } from './climbLayout';
import { bmiSummary, type ClimbData, type Story } from './model';
import { useTodayPalette, type TodayPalette } from './palette';

function MePulse({ x, y, color }: { x: number; y: number; color: string }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 2400, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', left: x - 14, top: y - 14, width: 28, height: 28, borderRadius: 14, backgroundColor: color,
      opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.9] }) }] }} />
  );
}

function ClimbMap({ cd, width, U, today, sel, onSel, pal }: { cd: ClimbData; width: number; U: Units; today: string; sel: string; onSel: (id: string) => void; pal: TodayPalette }) {
  const t = useTheme();
  const L = useMemo(() => climbLayout(cd, width, U, today), [cd, width, U, today]);
  const ff = fonts[700];
  const selPt = sel !== 'you' ? L.targets.find(x => x.id === sel) : null;
  const sx = L.summit.x, sy = L.summit.y, me = L.me, y = L.youTip;
  return (
    <View style={{ width: L.W, height: L.H, overflow: 'hidden' }}>
      <Svg width={L.W} height={L.H} viewBox={`0 0 ${L.W} ${L.H}`} accessible accessibilityRole="image" accessibilityLabel={L.aria}>
        <Defs>
          <LinearGradient id="tdySky" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={pal.skyA} /><Stop offset="0.75" stopColor={pal.skyZ} /></LinearGradient>
          <RadialGradient id="tdySun" cx="50%" cy="50%" r="50%"><Stop offset="0" stopColor={pal.sun} stopOpacity={0.75} /><Stop offset="1" stopColor={pal.sun} stopOpacity={0} /></RadialGradient>
          <LinearGradient id="tdyFar" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={pal.farA} /><Stop offset="0.6" stopColor={pal.farZ} /></LinearGradient>
          <LinearGradient id="tdyMid" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={pal.midA} /><Stop offset="1" stopColor={pal.midZ} /></LinearGradient>
          <LinearGradient id="tdyNear" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={pal.nearA} /><Stop offset="1" stopColor={pal.nearZ} /></LinearGradient>
          <LinearGradient id="tdyTrail" gradientUnits="userSpaceOnUse" x1="0" y1={L.trailY0} x2="0" y2={L.trailY1}><Stop offset="0" stopColor={pal.trailA} /><Stop offset="1" stopColor={pal.trailZ} /></LinearGradient>
          <LinearGradient id="tdyGoalFlag" x1="0" y1="0" x2="1" y2="0"><Stop offset="0" stopColor={pal.goalA} /><Stop offset="1" stopColor={pal.goalZ} /></LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={L.W} height={L.H} fill="url(#tdySky)" />
        <Circle cx={sx} cy={sy + 4} r={L.sunR} fill="url(#tdySun)" />
        <G fill={pal.cloud} opacity={pal.cloudO}>{L.clouds.map((c, i) => <Ellipse key={i} cx={c.cx} cy={c.cy} rx={c.rx} ry={c.ry} />)}</G>
        <G fill="#FFFFFF" opacity={pal.starO}>{L.stars.map((s, i) => <Circle key={i} cx={s.cx} cy={s.cy} r={1.2} />)}</G>
        <Path d={L.far} fill="url(#tdyFar)" />
        <Path d={L.snow} fill={pal.snow} />
        <Path d={L.snow2} fill={pal.snow} opacity={0.85} />
        <Path d={L.mid} fill="url(#tdyMid)" />
        <Path d={L.near} fill="url(#tdyNear)" />
        <Path d={L.trees} fill={pal.tree} opacity={pal.treeO} />
        <Path d={L.trail} fill="none" stroke={pal.bedShadow} strokeWidth={15} strokeLinecap="round" strokeLinejoin="round" />
        <Path d={L.trail} fill="none" stroke={pal.bed} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" />
        {L.done ? <Path d={L.done} fill="none" stroke="url(#tdyTrail)" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" /> : null}
        {L.ahead ? <Path d={L.ahead} fill="none" stroke={pal.ahead} strokeWidth={3.5} strokeLinecap="round" strokeDasharray="0.1 8" /> : null}
        {selPt ? <Circle cx={selPt.x} cy={selPt.y} r={15} fill={pal.me} fillOpacity={0.14} stroke={pal.me} strokeWidth={2} /> : null}
        {/* flags */}
        {L.flags.map(f => (
          <G key={f.id}>
            <Path d={`M${f.x} ${f.y} V${f.y - 24}`} stroke={f.passed ? pal.passed : pal.ahead} strokeOpacity={f.passed ? 1 : 0.65} strokeWidth={f.passed ? 1.75 : 1.5} strokeLinecap="round" />
            <Path d={`M${f.x} ${f.y - 24} L${f.x + 13} ${f.y - 19.5} L${f.x} ${f.y - 15}Z`} fill={f.passed ? pal.passedFill : pal.aheadFill} stroke={f.passed ? 'none' : pal.ahead} strokeWidth={1.25} strokeLinejoin="round" />
            <Circle cx={f.x} cy={f.y} r={3.5} fill={pal.pill} stroke={f.passed ? pal.passed : pal.ahead} strokeOpacity={f.passed ? 1 : 0.7} strokeWidth={2} />
          </G>
        ))}
        <Circle cx={L.start.x} cy={L.start.y} r={6} fill={pal.pill} stroke={pal.passed} strokeWidth={2.5} />
        {L.pills.map((p, i) => (
          <G key={i}>
            <Rect x={p.x} y={p.y} width={p.w} height={p.h} rx={10} fill={pal.pill} stroke={p.kind === 'next' ? pal.ahead : t.dark ? 'none' : 'rgba(18,20,28,0.08)'} strokeOpacity={p.kind === 'next' ? 0.55 : 1} strokeDasharray={p.kind === 'next' ? '3 3' : undefined} strokeWidth={1} />
            <SvgText x={p.x + p.w / 2} y={p.y + 14} textAnchor="middle" fontSize={12} fontFamily={ff} fontWeight="700" fill={p.kind === 'next' ? pal.pillNext : pal.pillInk}>{p.text}</SvgText>
          </G>
        ))}
        {/* summit */}
        <Path d={`M${sx} ${sy} V${sy - 30}`} stroke={pal.pole} strokeWidth={2} strokeLinecap="round" />
        <Path d={`M${sx} ${sy - 30} L${sx + 23} ${sy - 24} L${sx} ${sy - 18}Z`} fill="url(#tdyGoalFlag)" />
        <Rect x={L.goalPill.x} y={L.goalPill.y} width={L.goalPill.w} height={22} rx={11} fill={pal.goalPill} stroke={pal.goalPillLine} strokeWidth={1} />
        <SvgText x={L.goalPill.x + L.goalPill.w / 2} y={L.goalPill.y + 15} textAnchor="middle" fontSize={12} fontFamily={ff} fontWeight="700" fill={pal.pillInk}>{L.goalPill.text}</SvgText>
        {/* you are here */}
        <Circle cx={me.x} cy={me.y} r={10} fill={pal.meRing} />
        <Circle cx={me.x} cy={me.y} r={6.5} fill={pal.me} />
        <Rect x={y.x} y={y.y} width={y.w} height={24} rx={12} fill={pal.tip} />
        <Path d={y.below ? `M${me.x - 6} ${y.y} L${me.x} ${y.y - 6} L${me.x + 6} ${y.y}Z` : `M${me.x - 6} ${y.y + 24} L${me.x} ${y.y + 30} L${me.x + 6} ${y.y + 24}Z`} fill={pal.tip} />
        <SvgText x={y.x + y.w / 2} y={y.y + 16} textAnchor="middle" fontSize={12} fontFamily={ff} fontWeight="700" fill={pal.tipInk}>{y.text}</SvgText>
      </Svg>
      <MePulse x={me.x} y={me.y} color={pal.me} />
      {L.targets.map(it => (
        <Pressable key={it.id} onPress={() => { tap('select'); onSel(sel === it.id && it.id !== 'you' ? 'you' : it.id); }} accessibilityRole="button" accessibilityState={{ selected: sel === it.id }}
          accessibilityLabel={cd.stories[it.id]?.title} style={{ position: 'absolute', left: it.x - 22, top: it.y - 22, width: 44, height: 44, borderRadius: 22 }} />
      ))}
    </View>
  );
}

function StoryBox({ s }: { s: Story }) {
  const t = useTheme();
  const c = t.c;
  const ic = s.kind === 'passed' ? [c.tealTint, c.teal] : s.kind === 'you' ? [c.brand, c.onBrand] : s.kind === 'goal' ? [c.amberTint, c.amber] : [c.brandTint, c.brand];
  return (
    <View style={{ marginHorizontal: 16, marginTop: 4, padding: 14, paddingHorizontal: 16, borderRadius: t.radius.md, backgroundColor: c.surface2, flexDirection: 'row', alignItems: 'flex-start', gap: 12, minHeight: 72 }} accessibilityLiveRegion="polite">
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: ic[0], alignItems: 'center', justifyContent: 'center' }}><Icon name="flag" size={18} color={ic[1]} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="bodyStrong" style={t.font(700)}>{s.title}</Txt>
        <Txt variant="sm" color="ink2" style={[t.font(400), { marginTop: 2 }]}>
          {s.parts ? s.parts.map((p, i) => i % 2 ? <Txt key={i} variant="sm" style={t.font(700)}>{p}</Txt> : p) : s.body}
        </Txt>
      </View>
    </View>
  );
}

function BmiRow({ heightCm, kg, U }: { heightCm?: number; kg: number; U: Units }) {
  const t = useTheme();
  const pal = useTodayPalette();
  const s = bmiSummary(heightCm, kg, U);
  if (!s) return null;
  const c = t.c;
  const catColor = s.cat.key === 'healthy' ? c.teal : c.amber;
  const pos = Math.max(0, Math.min(37, s.pos * 40 - 1.5));
  return (
    <Pressable onPress={() => router.push('/bmi')} accessibilityRole="button" accessibilityLabel={'BMI ' + s.text + ', ' + s.cat.label + '. ' + s.sub + '. See BMI details'}
      style={({ pressed }) => ({ marginHorizontal: 20, marginVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ width: 56, height: 36, borderRadius: 12, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={40} height={14} viewBox="0 0 40 14">
          <Rect x={0} y={5} width={5.5} height={4} rx={2} fill={pal.bmiUnder} />
          <Rect x={7} y={5} width={9.5} height={4} rx={2} fill={c.tealFill} />
          <Rect x={18} y={5} width={6.5} height={4} rx={2} fill={c.amberFill} />
          <Rect x={26} y={5} width={14} height={4} rx={2} fill={c.amber} />
          <Rect x={pos} y={1} width={3} height={12} rx={1.5} fill={pal.bmiMark} stroke={c.surface} strokeWidth={1} />
        </Svg>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="sm" numberOfLines={1} style={[t.font(600), { fontSize: 14 }]}>BMI {s.text} <Txt variant="sm" color={catColor} style={[t.font(600), { fontSize: 14 }]}>· {s.cat.label}</Txt></Txt>
        <Txt variant="cap" color="muted" numberOfLines={1} style={[t.font(500), { marginTop: 2 }]}>{s.sub}</Txt>
      </View>
      <Icon name="chevron" size="sm" color={c.muted} />
    </Pressable>
  );
}

export interface ClimbCardProps { cd: ClimbData; U: Units; today: string; heightCm?: number; line: { lead: string; tone: 'good' | 'warn' | null; rest: string } }

export function ClimbCard({ cd, U, today, heightCm, line }: ClimbCardProps) {
  const t = useTheme();
  const pal = useTodayPalette();
  const c = t.c;
  const [w, setW] = useState(0);
  const [sel, setSel] = useState('you');
  const story = cd.stories[sel] || cd.stories.you;
  const goalLbl = isFinite(cd.goalKg) ? U.n(cd.goalKg, cd.unit === 'lb' ? 0 : 1).replace(/\.0$/, '') + ' ' + cd.unit : 'your goal';
  const pct = Math.round(cd.f * 100);
  return (
    <View style={{ backgroundColor: c.surface, borderRadius: t.radius.xl, borderWidth: 1, borderColor: c.cardBorder, overflow: 'hidden', paddingBottom: 6, ...t.shadow(2) }}>
      <View style={{ paddingTop: 20, paddingHorizontal: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 28 }}>
          <Txt variant="title" numberOfLines={1} style={{ flex: 1, minWidth: 0 }} accessibilityRole="header">Your climb to {goalLbl}</Txt>
          <View style={{ height: 28, paddingHorizontal: 12, borderRadius: 999, backgroundColor: c.tealTint, justifyContent: 'center' }}>
            <Txt variant="cap" color="teal" style={t.font(700)} numberOfLines={1}>{cd.goalReached ? 'Summit!' : pct + '% climbed'}</Txt>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 4 }}>
          <Txt num style={[t.font(800), { fontSize: 40, lineHeight: 46, letterSpacing: -1.2 }]}>{U.n(cd.cur)}</Txt>
          <Txt color="muted" style={[t.font(600), { fontSize: 17, marginLeft: 6 }]}>{cd.unit}</Txt>
        </View>
        <Txt variant="sm" color="ink2" style={{ marginTop: 2 }}>
          {line.lead ? <Txt variant="sm" num color={line.tone === 'good' ? c.teal : c.amber} style={t.font(700)}>{line.lead}</Txt> : null}
          {line.rest}
        </Txt>
      </View>
      <View style={{ marginTop: 10, width: '100%' }} onLayout={e => { const nw = Math.round(e.nativeEvent.layout.width); if (Math.abs(nw - w) > 4) setW(nw); }}>
        {w > 0 && cd.valid ? <ClimbMap cd={cd} width={w} U={U} today={today} sel={sel} onSel={setSel} pal={pal} /> : null}
      </View>
      <StoryBox s={story} />
      <BmiRow heightCm={heightCm} kg={cd.cur} U={U} />
    </View>
  );
}
