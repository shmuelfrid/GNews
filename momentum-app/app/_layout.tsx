/* Root: fonts, store boot, theme, navigation stack (tabs + stack routes + sheet-style modal routes), onboarding gate, overlay hosts. */
import {
  PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold, useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider, Stack, router, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OverlayHosts } from '@/components';
import { initStore, store, useProfile, useReady } from '@/lib/store';
import { seedDemoData } from '@/lib/seed';
import { ThemeProvider, fonts, useTheme } from '@/theme';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync().catch(() => {});
initStore();

if (__DEV__ || Platform.OS === 'web') {
  // dev/test helper: momentumSeed() in the console, or open the web build with ?seed=1
  (globalThis as unknown as { momentumSeed: typeof seedDemoData }).momentumSeed = seedDemoData;
}

export default function RootLayout() {
  const [loaded, error] = useFonts({ PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold });
  const ready = useReady();
  useEffect(() => { if ((loaded || error) && ready) SplashScreen.hideAsync().catch(() => {}); }, [loaded, error, ready]);
  useEffect(() => {
    if (!ready || Platform.OS !== 'web' || typeof location === 'undefined') return;
    const q = new URLSearchParams(location.search);
    if (q.get('seed') === '1' && !store.getState().days[Object.keys(store.getState().days)[0]]) seedDemoData();
    const th = q.get('theme');
    if (th === 'dark' || th === 'light') store.setProfile({ theme: th });
  }, [ready]);
  if ((!loaded && !error) || !ready) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <Nav />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function useOnboardingGate() {
  const profile = useProfile();
  const segments = useSegments();
  const complete = store.profileComplete(profile);
  const inOnboarding = segments[0] === 'onboarding';
  useEffect(() => {
    if (!complete && !inOnboarding) router.replace('/onboarding');
    else if (complete && inOnboarding) router.replace('/today');
  }, [complete, inOnboarding]);
}

function Nav() {
  const t = useTheme();
  useOnboardingGate();
  const base = t.dark ? DarkTheme : DefaultTheme;
  const navTheme = { ...base, colors: { ...base.colors, primary: t.c.brand, background: t.c.bg, card: t.c.bg, text: t.c.ink, border: t.c.line } };
  const stackHeader = {
    headerShown: true, headerShadowVisible: false, headerTintColor: t.c.brand, headerStyle: { backgroundColor: t.c.bg },
    headerTitleStyle: { fontFamily: fonts[700], color: t.c.ink, fontSize: 17 }, headerBackButtonDisplayMode: 'minimal' as const,
  };
  const sheet = { presentation: 'transparentModal' as const, animation: 'fade' as const, headerShown: false, contentStyle: { backgroundColor: 'transparent' } };
  return (
    <NavThemeProvider value={navTheme}>
      <View style={{ flex: 1, backgroundColor: t.c.bg }}>
        <StatusBar style={t.dark ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.c.bg } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding" options={{ gestureEnabled: false, animation: 'fade' }} />
          <Stack.Screen name="plan" options={{ ...stackHeader, title: 'Your plan' }} />
          <Stack.Screen name="profile" options={{ ...stackHeader, title: 'Profile' }} />
          <Stack.Screen name="bmi" options={{ ...stackHeader, title: 'BMI' }} />
          <Stack.Screen name="dev-kit" options={{ ...stackHeader, title: 'UI kit' }} />
          <Stack.Screen name="quick-add" options={sheet} />
          <Stack.Screen name="log-weight" options={sheet} />
          <Stack.Screen name="add-food" options={sheet} />
          <Stack.Screen name="add-workout" options={sheet} />
          <Stack.Screen name="health-import" options={sheet} />
        </Stack>
        <OverlayHosts />
      </View>
    </NavThemeProvider>
  );
}
