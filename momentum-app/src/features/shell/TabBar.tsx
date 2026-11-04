/* Bottom tab bar: Today · Food · (+) · Activity · Progress. The raised centre + opens the quick-add sheet. */
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, Txt, tap, type IconName } from '@/components';
import { useTheme } from '@/theme';

const TABS: { name: string; label: string; icon: IconName }[] = [
  { name: 'today', label: 'Today', icon: 'today' },
  { name: 'food', label: 'Food', icon: 'food' },
  { name: 'activity', label: 'Activity', icon: 'activity' },
  { name: 'progress', label: 'Progress', icon: 'progress' },
];

export function TabBar({ state, emitter, navigateToTab }: Pick<BottomTabBarProps, 'state' | 'emitter' | 'navigateToTab'>) {
  const t = useTheme();
  const ins = useSafeAreaInsets();
  const current = state.routes[state.index]?.name;
  const item = (tb: (typeof TABS)[number]) => {
    const on = current === tb.name;
    return (
      <Pressable key={tb.name} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={tb.label}
        onPress={() => {
          const route = state.routes.find(r => r.name === tb.name);
          if (!route) return;
          const ev = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!on && !ev.defaultPrevented) { tap('select'); navigateToTab(route.key); }
        }}
        style={{ flex: 1, minWidth: 0, height: 56, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        <View style={{ width: 56, height: 30, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.c.brandTint : 'transparent' }}>
          <Icon name={tb.icon} size={22} color={on ? t.c.brand : t.c.muted} />
        </View>
        <Txt variant="cap" color={on ? t.c.brand : t.c.muted} numberOfLines={1} maxFontSizeMultiplier={1.2} style={{ fontFamily: on ? t.type.over.fontFamily : t.type.cap.fontFamily }}>{tb.label}</Txt>
      </Pressable>
    );
  };
  return (
    <View accessibilityRole="tablist" style={{ backgroundColor: t.c.tabBar, borderTopWidth: 1, borderTopColor: t.c.line, paddingBottom: ins.bottom, paddingHorizontal: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', height: t.layout.tabBarH, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
        {item(TABS[0])}{item(TABS[1])}
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Add weigh-in, food or workout" onPress={() => { tap(); router.push('/quick-add'); }}
            style={({ pressed }) => [{ width: 56, height: 56, marginTop: -14, borderRadius: 28, backgroundColor: t.c.brand, alignItems: 'center', justifyContent: 'center',
              shadowColor: t.c.brand, shadowOpacity: t.dark ? 0.5 : 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8,
              borderWidth: 4, borderColor: t.c.tabBar }, pressed && { transform: [{ scale: 0.95 }] }]}>
            <Icon name="plus" size={26} color={t.c.onBrand} strokeWidth={2.2} />
          </Pressable>
        </View>
        {item(TABS[2])}{item(TABS[3])}
      </View>
    </View>
  );
}
