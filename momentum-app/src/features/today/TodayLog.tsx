/* Compact meals (with photo thumbnails from Storage) + today's weigh-ins. */
import { router } from 'expo-router';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { Card, CardHeader, Icon, IconBubble, ListRow, Txt } from '@/components';
import { fmtTime, int, MEALS, plural, type Units } from '@/lib/format';
import { usePhotoURL } from '@/lib/images';
import type { DayDoc, FoodEntry } from '@/lib/types';
import { useTheme } from '@/theme';

function LinkBtn({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={label} style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end', paddingLeft: 8 }}>
      <Txt variant="sm" color="brand" style={t.font(700)}>{label}</Txt>
    </Pressable>
  );
}
function EmptyRow({ text, onPress }: { text: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={text}
      style={({ pressed }) => ({ marginHorizontal: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: t.radius.md, borderWidth: 1, borderStyle: 'dashed',
        borderColor: pressed ? t.c.brand : t.c.lineStrong, backgroundColor: pressed ? t.c.brandTint : 'transparent' })}>
      <IconBubble name="plus" tone="brand" size={36} />
      <Txt variant="sm" color="ink2" style={{ flex: 1, minWidth: 0 }}>{text}</Txt>
    </Pressable>
  );
}
function FoodRow({ f, divider }: { f: FoodEntry; divider: boolean }) {
  const t = useTheme();
  const uri = usePhotoURL(f.photoPath);
  const label = (MEALS.find(m => m.id === f.meal) || { label: 'Snack' }).label;
  const thumbLeft = f.photoPath && !uri
    ? <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: t.c.surface2, alignItems: 'center', justifyContent: 'center' }}><Icon name="image" size="sm" color={t.c.muted} /></View>
    : undefined;
  return (
    <ListRow title={f.name} sub={label + ' · ' + fmtTime(f.t)} thumb={uri || null} left={thumbLeft} icon={f.source === 'photo' ? 'camera' : 'food'} iconTone="brand"
      value={int(f.kcal)} unit="kcal" divider={divider} onPress={() => router.push({ pathname: '/add-food', params: { id: f.id } })} accessibilityLabel={f.name + ', ' + int(f.kcal) + ' kcal, ' + label} />
  );
}

export function TodayLog({ day, eaten, U, dayKey }: { day: DayDoc; eaten: number; U: Units; dayKey: string }) {
  const { width } = useWindowDimensions();
  const foods = day.foods.slice().sort((x, y) => x.t - y.t);
  const shown = foods.slice(-4);
  const ws = day.weights.slice().sort((x, y) => y.t - x.t).slice(0, 3);
  const two = width >= 640;
  const meals = (
    <Card pad={0} gap={0} style={two ? { flex: 1, minWidth: 0 } : undefined}>
      <View style={{ paddingTop: 16, paddingHorizontal: 20, paddingBottom: 4 }}>
        <CardHeader title="Today’s meals" sub={foods.length ? int(eaten) + ' kcal · ' + plural(foods.length, 'item') : undefined}
          action={<LinkBtn label="See all" onPress={() => router.push({ pathname: '/food', params: { date: dayKey } })} />} />
      </View>
      {shown.length ? <View style={{ paddingHorizontal: 4, paddingBottom: 6 }}>{shown.map((f, i) => <FoodRow key={f.id} f={f} divider={i < shown.length - 1} />)}</View>
        : <EmptyRow text="Log a meal by photo, words or numbers" onPress={() => router.push({ pathname: '/add-food', params: { date: dayKey } })} />}
    </Card>
  );
  const weighs = (
    <Card pad={0} gap={0} style={two ? { flex: 1, minWidth: 0 } : undefined}>
      <View style={{ paddingTop: 16, paddingHorizontal: 20, paddingBottom: 4 }}>
        <CardHeader title="Weigh-ins today" action={<LinkBtn label="Progress" onPress={() => router.push('/progress')} />} />
      </View>
      {ws.length ? <View style={{ paddingHorizontal: 4, paddingBottom: 6 }}>{ws.map((w, i) => (
        <ListRow key={w.id} title={fmtTime(w.t)} sub={w.tags.length ? w.tags.join(', ') : undefined} icon="scale" iconTone="neutral" value={U.n(w.kg)} unit={U.unit}
          divider={i < ws.length - 1} onPress={() => router.push({ pathname: '/log-weight', params: { id: w.id } })} accessibilityLabel={'Weigh-in ' + fmtTime(w.t) + ', ' + U.w(w.kg)} />
      ))}</View>
        : <EmptyRow text="Step on the scale. Weigh in as often as you like" onPress={() => router.push({ pathname: '/log-weight', params: { date: dayKey } })} />}
    </Card>
  );
  return <View style={{ flexDirection: two ? 'row' : 'column', gap: 16, alignItems: two ? 'flex-start' : 'stretch' }}>{meals}{weighs}</View>;
}
