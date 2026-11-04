/* Quick add sheet (centre + button): Weigh-in · Food · Workout + Steps & active calories. */
import { router, type Href } from 'expo-router';
import { Pressable, View } from 'react-native';
import { IconBubble, ListRow, ModalSheetScreen, Txt, tap, type IconName } from '@/components';
import { useTheme } from '@/theme';

const TILES: { href: Href; label: string; icon: IconName; tone: 'brand' | 'teal' }[] = [
  { href: '/log-weight', label: 'Weigh-in', icon: 'scale', tone: 'brand' },
  { href: '/add-food', label: 'Food', icon: 'food', tone: 'brand' },
  { href: '/add-workout', label: 'Workout', icon: 'dumbbell', tone: 'teal' },
];

export default function QuickAdd() {
  const t = useTheme();
  const go = (href: Href) => { tap(); router.replace(href); };
  return (
    <ModalSheetScreen title="Add" sub="What would you like to log?">
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {TILES.map(x => (
          <Pressable key={x.label} onPress={() => go(x.href)} accessibilityRole="button" accessibilityLabel={x.label}
            style={({ pressed }) => [{ flex: 1, minWidth: 0, alignItems: 'center', gap: 10, paddingVertical: 18, borderRadius: 20, backgroundColor: t.c.surface2 }, pressed && { opacity: 0.8 }]}>
            <IconBubble name={x.icon} tone={x.tone} size={52} />
            <Txt variant="bodyStrong" numberOfLines={1}>{x.label}</Txt>
          </Pressable>
        ))}
      </View>
      <ListRow icon="steps" iconTone="teal" title="Steps & active calories" sub="Health Connect, Samsung Health screenshot or export, or type them in" chevron padX={4} onPress={() => go('/health-import')} />
    </ModalSheetScreen>
  );
}
