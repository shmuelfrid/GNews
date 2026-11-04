/* Today's plan checklist: auto-ticked from data, manual ticks saved in day.planTicks. */
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Icon, IconBubble, tap, Txt } from '@/components';
import { store } from '@/lib/store';
import { useTheme } from '@/theme';
import type { PlanRoute, PlanTask } from './model';

export function openPlanRoute(r: PlanRoute, date: string) {
  if (r === 'food') router.push({ pathname: '/add-food', params: { date } });
  else if (r === 'workout') router.push({ pathname: '/add-workout', params: { date } });
  else if (r === 'activity') router.push({ pathname: '/health-import', params: { date } });
  else router.push({ pathname: '/log-weight', params: { date } });
}

export function PlanCard({ tasks, dayKey }: { tasks: PlanTask[]; dayKey: string }) {
  const t = useTheme();
  const c = t.c;
  const n = tasks.filter(x => x.done).length, N = tasks.length;
  return (
    <View style={{ backgroundColor: c.surface, borderRadius: t.radius.lg, borderWidth: 1, borderColor: c.cardBorder, paddingTop: 12, paddingHorizontal: 20, paddingBottom: 4, ...t.shadow(1) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 }}>
        <Txt variant="title" accessibilityRole="header" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>Today’s plan</Txt>
        <Pressable onPress={() => router.push('/plan')} accessibilityRole="link" accessibilityLabel="Full plan" style={{ minHeight: 44, paddingLeft: 12, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Txt variant="sm" color="brand" style={t.font(700)}>Full plan</Txt>
          <Icon name="chevron" size="sm" color={c.brand} />
        </Pressable>
      </View>
      <View style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 12 }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: N, now: n }} accessibilityLabel="Plan progress">
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', gap: 4 }}>
          {tasks.map((_, i) => <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: i < n ? c.tealFill : c.line }} />)}
        </View>
        <Txt variant="cap" color={n === N ? c.teal : c.muted} style={t.font(700)} numberOfLines={1}>{n === N ? 'All done — great day' : n + ' of ' + N + ' done'}</Txt>
      </View>
      <View style={{ marginTop: 6 }}>
        {tasks.map((it, i) => (
          <View key={it.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderBottomWidth: i < tasks.length - 1 ? 1 : 0, borderBottomColor: c.line }}>
            <Pressable onPress={() => openPlanRoute(it.route, dayKey)} accessibilityRole="button" accessibilityLabel={it.title + '. ' + it.sub}
              style={({ pressed }) => ({ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, opacity: pressed ? 0.7 : 1 })}>
              <IconBubble name={it.icon} tone={it.tone} size={40} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt variant="bodyStrong" color={it.done ? c.muted : c.ink} style={it.done ? { textDecorationLine: 'line-through' } : null}>{it.title}</Txt>
                <Txt variant="sm" color="muted" style={[t.font(400), { marginTop: 2 }]}>{it.sub}</Txt>
              </View>
            </Pressable>
            <Pressable onPress={() => { tap(it.done ? 'light' : 'success'); store.setPlanTick(dayKey, it.id, !it.done); }} accessibilityRole="checkbox" accessibilityState={{ checked: it.done }}
              accessibilityLabel={(it.done ? 'Mark not done: ' : 'Mark done: ') + it.title} style={{ width: 44, height: 44, marginRight: -8, alignItems: 'center', justifyContent: 'center' }}>
              {({ pressed }) => (
                <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2,
                  borderColor: it.done ? c.tealFill : c.lineStrong, backgroundColor: it.done ? c.tealFill : c.surface, transform: [{ scale: pressed ? 0.92 : 1 }] }}>
                  {it.done ? <Svg width={16} height={16} viewBox="0 0 24 24"><Path d="M5 12.5l4.5 4.5L19 7.5" stroke={c.surface} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg> : null}
                </View>
              )}
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}
