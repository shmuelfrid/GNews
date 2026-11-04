import { Tabs } from 'expo-router/js-tabs';
import { TabBar } from '@/features/shell/TabBar';
import { useTheme } from '@/theme';

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs tabBar={p => <TabBar state={p.state} emitter={p.emitter} navigateToTab={p.navigateToTab} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: t.c.bg }, animation: 'fade' }}>
      <Tabs.Screen name="today" options={{ title: 'Today' }} />
      <Tabs.Screen name="food" options={{ title: 'Food' }} />
      <Tabs.Screen name="activity" options={{ title: 'Activity' }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress' }} />
    </Tabs>
  );
}
