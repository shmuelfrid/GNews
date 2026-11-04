/* Floating 7-day deficit strip: title, selected-day line + chip, 7 mini rings (tap a day). */
import { Pressable, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { tap, Txt } from '@/components';
import { useTheme } from '@/theme';
import type { WeekCell } from './model';

const R = 13, CIRC = 2 * Math.PI * R;

export function WeekCard({ title, cells, selected, onSelect }: { title: string; cells: WeekCell[]; selected: string; onSelect: (k: string) => void }) {
  const t = useTheme();
  const c = t.c;
  const L = cells.find(x => x.key === selected) || cells[cells.length - 1];
  const chipColors = { brand: [c.brandTint, c.brandHover], good: [c.tealTint, c.teal], warn: [c.amberTint, c.amber], plain: [c.surface2, c.ink2] }[L.chipTone];
  const floatShadow = t.dark ? {} : t.shadow(3);
  return (
    <View style={{ marginTop: -32, backgroundColor: c.surface, borderRadius: t.radius.xl, borderWidth: 1, borderColor: t.dark ? c.line : c.cardBorder,
      paddingTop: 16, paddingHorizontal: 16, paddingBottom: 10, ...floatShadow }}>
      <View style={{ paddingHorizontal: 4 }}>
        <Txt variant="title" accessibilityRole="header">{title}</Txt>
        <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 40 }} accessibilityLiveRegion="polite">
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt variant="sm" color="ink2">
              <Txt variant="sm" color="muted">{L.full + ' · '}</Txt>
              {L.big ? <Txt variant="sm" num style={t.font(700)}>{L.big + ' '}</Txt> : null}
              {L.unit}
            </Txt>
            <Txt variant="cap" color="muted" num style={[t.font(500), { marginTop: 2 }]}>{L.detail}</Txt>
          </View>
          <View style={{ height: 28, paddingHorizontal: 12, borderRadius: 999, backgroundColor: chipColors[0], justifyContent: 'center', flexShrink: 0 }}>
            <Txt variant="cap" color={chipColors[1]} style={t.font(700)} numberOfLines={1}>{L.chip}</Txt>
          </View>
        </View>
      </View>
      <View style={{ marginTop: 10, flexDirection: 'row', gap: 2 }} accessibilityLabel="Pick a day">
        {cells.map(d => {
          const on = d.key === L.key;
          const track = d.tone === 'none' ? c.lineStrong : d.tone === 'warn' ? c.amberTint : d.tone === 'good' || d.tone === 'met' ? c.tealTint : c.dTrack;
          const arc = d.tone === 'warn' ? c.amberFill : d.tone === 'met' ? c.teal : c.tealFill;
          return (
            <Pressable key={d.key} onPress={() => { tap('select'); onSelect(d.key); }} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={d.aria}
              style={({ pressed }) => ({ flex: 1, minWidth: 0, height: 66, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1,
                borderColor: on ? c.brand + '4D' : 'transparent', backgroundColor: on ? c.brandTint : pressed ? c.surface2 : 'transparent' })}>
              <Svg width={34} height={34} viewBox="0 0 34 34">
                <Circle cx={17} cy={17} r={R} fill="none" stroke={track} strokeWidth={4.5} strokeDasharray={d.tone === 'none' ? '2.5 3.3' : undefined} />
                {d.pct > 0 ? <Circle cx={17} cy={17} r={R} fill="none" stroke={arc} strokeWidth={4.5} strokeLinecap="round" strokeDasharray={`${d.pct * CIRC} ${CIRC}`} transform="rotate(-90 17 17)" /> : null}
                {d.met ? <Circle cx={17} cy={17} r={4} fill={c.teal} /> : null}
              </Svg>
              <Txt variant="cap" numberOfLines={1} color={on ? c.brand : d.today ? c.ink : c.muted} style={t.font(on || d.today ? 700 : 500)}>{d.label}</Txt>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
