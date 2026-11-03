/* Momentum design tokens (from weight-tracker/css/tokens.css). Never hardcode colors in features: use useTheme().c */
import { Platform, type TextStyle, type ViewStyle } from 'react-native';

export const light = {
  bg: '#F6F7F9', surface: '#FFFFFF', surface2: '#F1F2F6', elevated: '#FFFFFF',
  line: '#E7E9EF', lineStrong: '#D9DCE5', segOn: '#FFFFFF', scrim: 'rgba(18,20,28,0.42)',
  ink: '#12141C', ink2: '#474C5E', muted: '#6B7083', disabled: '#A3A8B8',
  brand: '#4F46E5', brandHover: '#4338CA', brandTint: '#EEF0FF', onBrand: '#FFFFFF', brandGlow: '#6D63FF',
  teal: '#0F766E', tealFill: '#14B8A6', tealTint: '#E6F7F4',
  amber: '#B45309', amberFill: '#F59E0B', amberTint: '#FEF5E7',
  danger: '#DC2626', dangerTint: '#FDECEC',
  good: '#0F766E', goodTint: '#E6F7F4',
  // data colors (same meaning everywhere)
  dEaten: '#4F46E5', dRest: '#99E6DA', dActive: '#14B8A6', dWorkout: '#0F766E', dDeficit: '#14B8A6', dSurplus: '#F59E0B',
  dTrend: '#12141C', dDot: '#A3A8B8', dGoal: '#F59E0B', dProj: '#4F46E5', dGrid: '#EDEFF3', dTrack: '#EEF0F4',
  cardBorder: 'transparent',
  tabBar: '#FFFFFF',
};
export type Colors = typeof light;

export const dark: Colors = {
  bg: '#0E1018', surface: '#161925', surface2: '#1E2230', elevated: '#232838',
  line: 'rgba(255,255,255,0.08)', lineStrong: 'rgba(255,255,255,0.14)', segOn: '#343A4E', scrim: 'rgba(4,5,10,0.62)',
  ink: 'rgba(255,255,255,0.92)', ink2: 'rgba(255,255,255,0.70)', muted: 'rgba(255,255,255,0.58)', disabled: 'rgba(255,255,255,0.38)',
  brand: '#8B87FF', brandHover: '#A3A0FF', brandTint: 'rgba(139,135,255,0.14)', onBrand: '#0E1018', brandGlow: '#A3A0FF',
  teal: '#2DD4BF', tealFill: '#2DD4BF', tealTint: 'rgba(45,212,191,0.12)',
  amber: '#FBBF24', amberFill: '#FBBF24', amberTint: 'rgba(251,191,36,0.12)',
  danger: '#F87171', dangerTint: 'rgba(248,113,113,0.12)',
  good: '#2DD4BF', goodTint: 'rgba(45,212,191,0.12)',
  dEaten: '#8B87FF', dRest: '#1E5F58', dActive: '#2DD4BF', dWorkout: '#5EEAD4', dDeficit: '#2DD4BF', dSurplus: '#FBBF24',
  dTrend: 'rgba(255,255,255,0.92)', dDot: 'rgba(255,255,255,0.34)', dGoal: '#FBBF24', dProj: '#8B87FF', dGrid: 'rgba(255,255,255,0.06)', dTrack: 'rgba(255,255,255,0.08)',
  cardBorder: 'rgba(255,255,255,0.06)',
  tabBar: '#161925',
};

/** 4pt spacing scale */
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 } as const;
export const layout = { pageX: 20, cardPad: 20, gap: 16, sectionGap: 32, tabBarH: 64, maxContent: 760, hit: 44, primaryH: 52 } as const;
export const radius = { xs: 8, sm: 12, md: 16, lg: 20, xl: 24, pill: 9999 } as const;

/** Plus Jakarta Sans families per weight (RN needs one family per weight) */
export const fonts = {
  400: 'PlusJakartaSans_400Regular',
  500: 'PlusJakartaSans_500Medium',
  600: 'PlusJakartaSans_600SemiBold',
  700: 'PlusJakartaSans_700Bold',
  800: 'PlusJakartaSans_800ExtraBold',
} as const;
export type Weight = keyof typeof fonts;
export const font = (w: Weight = 400): TextStyle => ({ fontFamily: fonts[w] });

/** type scale (mobile). Numbers: add `num` for tabular figures. */
export const type = {
  hero: { ...font(800), fontSize: 48, lineHeight: 52, letterSpacing: -1.4 },
  display: { ...font(800), fontSize: 36, lineHeight: 40, letterSpacing: -0.9 },
  h1: { ...font(700), fontSize: 28, lineHeight: 34, letterSpacing: -0.4 },
  h2: { ...font(700), fontSize: 20, lineHeight: 26, letterSpacing: -0.2 },
  title: { ...font(600), fontSize: 17, lineHeight: 22 },
  body: { ...font(400), fontSize: 15, lineHeight: 23 },
  bodyStrong: { ...font(600), fontSize: 15, lineHeight: 21 },
  sm: { ...font(500), fontSize: 13, lineHeight: 18 },
  cap: { ...font(600), fontSize: 12, lineHeight: 16 },
  over: { ...font(700), fontSize: 12, lineHeight: 16, letterSpacing: 0.6, textTransform: 'uppercase' },
  num: { fontVariant: ['tabular-nums'] },
} satisfies Record<string, TextStyle>;
export type TypeVariant = Exclude<keyof typeof type, 'num'>;

export function shadow(level: 0 | 1 | 2 | 3, isDark: boolean): ViewStyle {
  if (isDark || level === 0) return {};
  const m = { 1: [1, 3, 0.06], 2: [8, 24, 0.08], 3: [16, 48, 0.16] }[level] as number[];
  return Platform.select<ViewStyle>({
    web: { boxShadow: `0 ${m[0]}px ${m[1]}px rgba(18,20,28,${m[2]})` } as ViewStyle,
    android: { elevation: level * 2, shadowColor: '#12141C' },
    default: { shadowColor: '#12141C', shadowOffset: { width: 0, height: m[0] }, shadowRadius: m[1] / 2, shadowOpacity: m[2] * 1.4 },
  }) as ViewStyle;
}
