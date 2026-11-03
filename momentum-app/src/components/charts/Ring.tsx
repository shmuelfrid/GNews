/* Ring / MultiRing — concentric progress rings with gradient strokes and a soft glow (glow = wide low-opacity stroke underneath). */
import { useId, type ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Stop } from 'react-native-svg';
import { useTheme } from '../../theme';

export interface RingSpec {
  /** 0..1 (values > 1 draw a full ring; pass overColor to tint the overflow) */
  value: number;
  color: string;
  /** gradient end color (defaults to color) */
  colorTo?: string;
  /** track color (defaults to theme track) */
  track?: string;
  label?: string;
}
export interface MultiRingProps {
  rings: RingSpec[];
  size?: number;
  stroke?: number;
  /** gap between rings */
  gap?: number;
  /** soft glow under each arc (hero rings) */
  glow?: boolean;
  /** dot at each arc's end */
  endDot?: boolean;
  center?: ReactNode;
  accessibilityLabel?: string;
  /** background disc inside the innermost ring (e.g. dark hero) */
  trackOpacity?: number;
}

/** Concentric rings, outermost first. Starts at 12 o'clock, clockwise. */
export function MultiRing({ rings, size = 240, stroke = 16, gap = 6, glow, endDot = true, center, accessibilityLabel, trackOpacity = 1 }: MultiRingProps) {
  const t = useTheme();
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const c = size / 2;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Defs>
          {rings.map((r, i) => (
            <LinearGradient key={i} id={`rg${id}-${i}`} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={r.color} />
              <Stop offset="1" stopColor={r.colorTo || r.color} />
            </LinearGradient>
          ))}
        </Defs>
        {rings.map((r, i) => {
          const rad = c - stroke / 2 - (glow ? 6 : 1) - i * (stroke + gap);
          if (rad <= stroke / 2) return null;
          const circ = 2 * Math.PI * rad;
          const v = Math.max(0, Math.min(1, isFinite(r.value) ? r.value : 0));
          const dash = `${circ * v} ${circ}`;
          const ang = -Math.PI / 2 + v * 2 * Math.PI;
          const ex = c + rad * Math.cos(ang), ey = c + rad * Math.sin(ang);
          return (
            <G key={i}>
              <Circle cx={c} cy={c} r={rad} stroke={r.track || t.c.dTrack} strokeOpacity={trackOpacity} strokeWidth={stroke} fill="none" />
              {glow && v > 0.01 ? (
                <Circle cx={c} cy={c} r={rad} stroke={r.colorTo || r.color} strokeOpacity={t.dark ? 0.26 : 0.12} strokeWidth={stroke + 7} fill="none"
                  strokeDasharray={dash} strokeLinecap="round" transform={`rotate(-90 ${c} ${c})`} />
              ) : null}
              {v > 0.005 ? (
                <Circle cx={c} cy={c} r={rad} stroke={`url(#rg${id}-${i})`} strokeWidth={stroke} fill="none"
                  strokeDasharray={dash} strokeLinecap="round" transform={`rotate(-90 ${c} ${c})`} />
              ) : null}
              {endDot && v > 0.02 && v < 1 ? <Circle cx={ex} cy={ey} r={stroke * 0.22} fill="#FFFFFF" fillOpacity={0.9} /> : null}
            </G>
          );
        })}
      </Svg>
      {center}
    </View>
  );
}
/** Single ring (value 0..1). */
export function Ring({ value, color, colorTo, size = 168, stroke = 14, center, accessibilityLabel, glow }: { value: number; color?: string; colorTo?: string; size?: number; stroke?: number; center?: ReactNode; accessibilityLabel?: string; glow?: boolean }) {
  const t = useTheme();
  return <MultiRing rings={[{ value, color: color || t.c.dEaten, colorTo }]} size={size} stroke={stroke} center={center} accessibilityLabel={accessibilityLabel} glow={glow} endDot={false} />;
}
