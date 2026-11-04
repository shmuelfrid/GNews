/* Today hero: deep-indigo band with greeting, streak, avatar, three glowing concentric rings (Food / Move / Steps) and focus tiles. */
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { prefersReducedMotion, tap, Txt } from '@/components';
import type { Balance } from '@/lib/calc';
import { fmtDateShort, greeting, int } from '@/lib/format';
import { useTheme } from '@/theme';
import { heroAria, kfmt, ringValues, type CenterText, type Focus, type HeroModel } from './model';
import { useTodayPalette, type TodayPalette } from './palette';

const SIZE = 232, CX = 116, RADII = [104, 83, 62], SW = 16;

function Flame({ pal }: { pal: TodayPalette }) {
  return (
    <Svg width={14} height={17} viewBox="0 0 38 46">
      <Path d="M19 2c2 8 13 13 13 26a13 13 0 0 1-26 0c0-7 4-10 6-15 1 4 3 6 5 6-2-7 0-12 2-17z" fill={pal.flameO} />
      <Path d="M19 22c1 4 7 7 7 13a7 7 0 0 1-14 0c0-4 3-6 4-9 1 2 2 3 3 3-1-3-1-5 0-7z" fill={pal.flameI} />
    </Svg>
  );
}

function Pulse({ x, y, color, size = 18 }: { x: number; y: number; color: string; size?: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 2400, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <Animated.View pointerEvents="none" style={{
      position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: color,
      opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] }) }],
    }} />
  );
}

function Rings({ h, b, focus, pal }: { h: HeroModel; b: Balance; focus: Focus; pal: TodayPalette }) {
  const v = ringValues(h);
  const defs = [
    { id: 'food' as const, pct: v.food, a: h.over ? pal.overA : pal.foodA, z: h.over ? pal.overZ : pal.foodZ, track: pal.foodTrack },
    { id: 'move' as const, pct: v.move, a: pal.moveA, z: pal.moveZ, track: pal.moveTrack },
    { id: 'steps' as const, pct: v.steps, a: pal.stepsA, z: pal.stepsZ, track: pal.stepsTrack },
  ];
  let pulse: { x: number; y: number } | null = null;
  const arcs = defs.map((d, i) => {
    const r = RADII[i], circ = 2 * Math.PI * r;
    const pct = Math.max(0, Math.min(1, isFinite(d.pct) ? d.pct : 0));
    const len = pct * circ, a = pct * 2 * Math.PI;
    const hx = CX + r * Math.sin(a), hy = CX - r * Math.cos(a);
    const dim = focus && focus !== d.id;
    const sel = focus === d.id;
    if (i === 0 && len > 0.5 && pct < 1 && (!focus || focus === 'food')) pulse = { x: hx, y: hy };
    return { ...d, r, circ, len, hx, hy, dim, sel };
  });
  return (
    <View style={{ width: SIZE, height: SIZE }}>
      <Svg width={SIZE + 16} height={SIZE + 16} viewBox="-8 -8 248 248" style={{ position: 'absolute', left: -8, top: -8 }} accessible accessibilityRole="image" accessibilityLabel={heroAria(h, b)}>
        <Defs>
          <RadialGradient id="tdyRingGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={pal.glow} stopOpacity={0.42} />
            <Stop offset="0.55" stopColor={pal.glow} stopOpacity={0.1} />
            <Stop offset="1" stopColor={pal.glow} stopOpacity={0} />
          </RadialGradient>
          {arcs.map(d => (
            <LinearGradient key={d.id} id={'tdyG' + d.id} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={d.a} />
              <Stop offset="1" stopColor={d.z} />
            </LinearGradient>
          ))}
        </Defs>
        <Circle cx={CX} cy={CX} r={124} fill="url(#tdyRingGlow)" />
        {arcs.map(d => <Circle key={'t' + d.id} cx={CX} cy={CX} r={d.r} fill="none" stroke={d.track} strokeWidth={SW} />)}
        {arcs.map(d => d.len > 0.5 ? (
          <Circle key={'g' + d.id} cx={CX} cy={CX} r={d.r} fill="none" stroke={d.z} strokeOpacity={d.dim ? 0 : d.sel ? 0.42 : 0.26} strokeWidth={SW + 10}
            strokeLinecap="round" strokeDasharray={`${d.len} ${d.circ}`} transform={`rotate(-90 ${CX} ${CX})`} />
        ) : null)}
        {arcs.map(d => d.len > 0.5 ? (
          <Circle key={'a' + d.id} cx={CX} cy={CX} r={d.r} fill="none" stroke={`url(#tdyG${d.id})`} strokeWidth={SW} opacity={d.dim ? 0.2 : 1}
            strokeLinecap="round" strokeDasharray={`${d.len} ${d.circ}`} transform={`rotate(-90 ${CX} ${CX})`} />
        ) : null)}
        {arcs.map(d => d.len > 0.5 ? <Circle key={'e' + d.id} cx={d.hx} cy={d.hy} r={4.5} fill={pal.on} opacity={d.dim ? 0.2 : 1} /> : null)}
      </Svg>
      {pulse ? <Pulse x={(pulse as { x: number }).x} y={(pulse as { y: number }).y} color={h.over ? pal.overA : pal.foodA} /> : null}
    </View>
  );
}

export interface HeroProps { name: string; streak: number; today: string; h: HeroModel; b: Balance; center: CenterText; focus: Focus; onFocus: (f: Focus) => void }

export function Hero({ name, streak, today, h, b, center, focus, onFocus }: HeroProps) {
  const t = useTheme();
  const pal = useTodayPalette();
  const ins = useSafeAreaInsets();
  const len = center.big.length;
  const bigSize = len <= 3 ? 52 : len === 4 ? 44 : len === 5 ? 35 : 30;
  const tiles = [
    { id: 'food' as const, label: 'Food', v: int(h.eaten), sub: '/' + int(h.budget), dot: h.over ? pal.overDot : pal.foodDot, aria: 'Food: ' + int(h.eaten) + ' of ' + int(h.budget) + ' kcal budget eaten' },
    { id: 'move' as const, label: 'Move', v: int(h.moveDone), sub: '/' + int(h.moveGoal), dot: pal.moveDot, aria: 'Move: ' + int(h.moveDone) + ' of ' + int(h.moveGoal) + ' active kcal' },
    { id: 'steps' as const, label: 'Steps', v: int(h.steps), sub: '/' + kfmt(h.stepGoal), dot: pal.stepsDot, aria: 'Steps: ' + int(h.steps) + ' of ' + int(h.stepGoal) },
  ];
  return (
    <View style={{ marginHorizontal: -t.layout.pageX, marginTop: -12, backgroundColor: pal.hero, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: 'hidden',
      paddingTop: ins.top + 12, paddingHorizontal: t.layout.pageX, paddingBottom: 56 }}>
      {/* background glows + orbits */}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
        <Svg width={520} height={520} style={{ position: 'absolute', right: -200, top: -260 }}>
          <Defs><RadialGradient id="tdyHg1" cx="50%" cy="50%" r="50%"><Stop offset="0" stopColor={pal.glowA} stopOpacity={0.62} /><Stop offset="1" stopColor={pal.glowA} stopOpacity={0} /></RadialGradient></Defs>
          <Circle cx={260} cy={260} r={260} fill="url(#tdyHg1)" />
        </Svg>
        <Svg width={420} height={420} style={{ position: 'absolute', left: -220, bottom: -220 }}>
          <Defs><RadialGradient id="tdyHg2" cx="50%" cy="50%" r="50%"><Stop offset="0" stopColor={pal.glowB} stopOpacity={0.4} /><Stop offset="1" stopColor={pal.glowB} stopOpacity={0} /></RadialGradient></Defs>
          <Circle cx={210} cy={210} r={210} fill="url(#tdyHg2)" />
        </Svg>
        <View style={{ position: 'absolute', width: 240, height: 240, right: -86, top: -90, borderRadius: 120, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }} />
        <View style={{ position: 'absolute', width: 344, height: 344, right: -138, top: -142, borderRadius: 172, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' }} />
      </View>

      {/* head */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Txt variant="sm" color={pal.on2} numberOfLines={1}>{fmtDateShort(today)}</Txt>
            {streak >= 1 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 26, paddingLeft: 7, paddingRight: 10, borderRadius: 999, backgroundColor: pal.streakBg }}
                accessible accessibilityLabel={(streak === 1 ? 'Day 1 streak' : streak + '-day logging streak')}>
                <Flame pal={pal} />
                <Txt variant="cap" color={pal.streakFg} style={t.font(700)} numberOfLines={1}>{streak === 1 ? 'Day 1 streak' : streak + '-day streak'}</Txt>
              </View>
            ) : null}
          </View>
          <Txt accessibilityRole="header" style={[t.font(700), { fontSize: 24, lineHeight: 30, letterSpacing: -0.4, marginTop: 4 }]} color={pal.on} numberOfLines={2}>
            {greeting() + (name ? ', ' + name : '')}
          </Txt>
        </View>
        <Pressable onPress={() => router.push('/profile')} accessibilityRole="button" accessibilityLabel="Profile and settings" hitSlop={4}
          style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' })}>
          <Txt style={t.font(700)} color={pal.on}>{(name[0] || 'M').toUpperCase()}</Txt>
        </Pressable>
      </View>

      {/* rings */}
      <View style={{ alignItems: 'center', marginTop: 8 }}>
        <View style={{ width: SIZE, height: SIZE }}>
          <Rings h={h} b={b} focus={focus} pal={pal} />
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }} importantForAccessibility="no-hide-descendants">
            <Txt num numberOfLines={1} color={pal.on} style={[t.font(800), { fontSize: bigSize, lineHeight: bigSize + 6, letterSpacing: -1.6 }]}>{center.big}</Txt>
            <Txt variant="sm" color={pal.on2} style={[t.font(600), { marginTop: 2 }]} numberOfLines={1}>{center.unit}</Txt>
          </View>
        </View>
        <Txt variant="sm" color={pal.on2} center accessibilityLiveRegion="polite" style={{ marginTop: 10, maxWidth: 300, minHeight: 20, lineHeight: 20 }}>{center.sub}</Txt>
      </View>

      {/* focus tiles */}
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 16, width: '100%', maxWidth: 560, alignSelf: 'center' }} accessibilityLabel="Focus a ring">
        {tiles.map(tl => {
          const on = focus === tl.id;
          return (
            <Pressable key={tl.id} onPress={() => { tap('select'); onFocus(on ? '' : tl.id); }} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={tl.aria}
              style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 62, paddingVertical: 9, paddingHorizontal: 9, borderRadius: 16, justifyContent: 'center', gap: 3,
                backgroundColor: on ? 'rgba(255,255,255,0.14)' : pressed ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: on ? tl.dot : 'rgba(255,255,255,0.10)' })}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tl.dot }} />
                <Txt variant="cap" color={pal.on2} numberOfLines={1}>{tl.label}</Txt>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 2 }}>
                <Txt num color={pal.on} style={[t.font(700), { fontSize: 16.5, lineHeight: 22 }]} numberOfLines={1}>{tl.v}</Txt>
                <Txt num color={pal.on3} style={[t.font(500), { fontSize: 11, lineHeight: 16 }]} numberOfLines={1}>{tl.sub}</Txt>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
