/* Theme: tokens + ThemeProvider honoring profile.theme ('system' | 'light' | 'dark'). */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { useProfile } from '../lib/store';
import { dark, font, layout, light, radius, shadow, space, type, type Colors } from './tokens';

export * from './tokens';

export interface Theme {
  c: Colors;
  dark: boolean;
  space: typeof space;
  layout: typeof layout;
  radius: typeof radius;
  type: typeof type;
  font: typeof font;
  /** platform shadow style; none in dark mode (surfaces + borders carry depth) */
  shadow: (level: 0 | 1 | 2 | 3) => ReturnType<typeof shadow>;
}
const make = (isDark: boolean): Theme => ({ c: isDark ? dark : light, dark: isDark, space, layout, radius, type, font, shadow: l => shadow(l, isDark) });
const ThemeCtx = createContext<Theme>(make(false));

export function ThemeProvider({ children, override }: { children: ReactNode; override?: 'light' | 'dark' }) {
  const sys = useColorScheme();
  const pref = useProfile()?.theme || 'system';
  const isDark = override ? override === 'dark' : pref === 'system' ? sys === 'dark' : pref === 'dark';
  const value = useMemo(() => make(isDark), [isDark]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}
export const useTheme = () => useContext(ThemeCtx);
/** colors only */
export const useColors = () => useContext(ThemeCtx).c;
