/* UI kit — controls: Button, IconButton, Chip/ChipGroup, Segmented, TextField, NumberField, DateStepper, TimeField, Toggle. */
import * as Haptics from 'expo-haptics';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Switch, TextInput, View, type KeyboardTypeOptions, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { addDays, isValidKey } from '../lib/calc';
import { parseTime, relDay, todayKey } from '../lib/format';
import { useTheme } from '../theme';
import { Icon, Txt } from './core';
import type { IconName } from './icons';

/** light haptic tap (no-op on web) */
export const tap = (kind: 'light' | 'success' | 'warning' | 'select' = 'light') => {
  if (Platform.OS === 'web') return;
  try {
    if (kind === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (kind === 'warning') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    else if (kind === 'select') Haptics.selectionAsync();
    else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch { /* ignore */ }
};

/* ---------------- Button ---------------- */
export type ButtonVariant = 'primary' | 'secondary' | 'tonal' | 'ghost' | 'danger';
export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  disabled?: boolean;
  /** stretch to container width */
  block?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  /** haptic on press (default: light for primary) */
  haptic?: boolean;
}
/** Primary = brand pill 52pt (ONE per screen/sheet). secondary = outlined neutral, tonal = brand tint, ghost = text, danger = red text on tint. */
export function Button({ label, onPress, variant = 'primary', size = 'md', icon, iconRight, loading, disabled, block, accessibilityLabel, style, haptic }: ButtonProps) {
  const t = useTheme();
  const h = size === 'sm' ? 40 : variant === 'primary' ? 52 : 48;
  const pal = {
    primary: { bg: t.c.brand, fg: t.c.onBrand, border: 'transparent' },
    secondary: { bg: t.c.surface, fg: t.c.ink, border: t.c.lineStrong },
    tonal: { bg: t.c.brandTint, fg: t.c.brand, border: 'transparent' },
    ghost: { bg: 'transparent', fg: t.c.brand, border: 'transparent' },
    danger: { bg: t.c.dangerTint, fg: t.c.danger, border: 'transparent' },
  }[variant];
  const off = disabled || loading;
  return (
    <Pressable
      onPress={() => { if (off) return; if (haptic ?? variant === 'primary') tap(); onPress?.(); }}
      disabled={off}
      accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled: !!off, busy: !!loading }}
      hitSlop={size === 'sm' ? 4 : 0}
      style={({ pressed }) => [{
        minHeight: Math.max(h, 44), paddingHorizontal: size === 'sm' ? 16 : 22, borderRadius: 999, backgroundColor: pal.bg,
        borderWidth: variant === 'secondary' ? 1 : 0, borderColor: pal.border,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        alignSelf: block ? 'stretch' : 'auto', opacity: off && !loading ? 0.45 : 1,
      }, pressed && { opacity: 0.85, transform: [{ scale: 0.985 }] }, style]}>
      {loading ? <ActivityIndicator color={pal.fg} size="small" /> : icon ? <Icon name={icon} size={size === 'sm' ? 'sm' : 'md'} color={pal.fg} strokeWidth={2} /> : null}
      <Txt variant={size === 'sm' ? 'sm' : 'bodyStrong'} color={pal.fg} numberOfLines={1} style={{ flexShrink: 1, fontFamily: t.type.bodyStrong.fontFamily }}>{label}</Txt>
      {iconRight && !loading ? <Icon name={iconRight} size="sm" color={pal.fg} strokeWidth={2} /> : null}
    </Pressable>
  );
}

/* ---------------- IconButton ---------------- */
export function IconButton({ icon, onPress, accessibilityLabel, filled, tone = 'neutral', size = 44, disabled, color }: {
  icon: IconName; onPress?: () => void; accessibilityLabel: string; filled?: boolean; tone?: 'neutral' | 'brand'; size?: number; disabled?: boolean; color?: string;
}) {
  const t = useTheme();
  const bg = filled ? (tone === 'brand' ? t.c.brandTint : t.dark ? t.c.segOn : t.c.surface2) : 'transparent';
  const fg = color || (tone === 'brand' ? t.c.brand : t.c.ink);
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={accessibilityLabel} hitSlop={Math.max(0, (44 - size) / 2)}
      style={({ pressed }) => [{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }, pressed && { backgroundColor: t.c.surface2 }]}>
      <Icon name={icon} size={size >= 44 ? 'md' : 'sm'} color={fg} />
    </Pressable>
  );
}

/* ---------------- Chips ---------------- */
export function Chip({ label, selected, onPress, icon, accessibilityLabel }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName; accessibilityLabel?: string }) {
  const t = useTheme();
  return (
    <Pressable onPress={() => { tap('select'); onPress?.(); }} accessibilityRole="button" accessibilityState={{ selected: !!selected }} accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [{
        minHeight: 40, paddingHorizontal: 14, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: selected ? t.c.brandTint : t.c.surface, borderWidth: 1, borderColor: selected ? t.c.brand : t.c.lineStrong,
      }, pressed && { opacity: 0.8 }]}>
      {selected ? <Icon name="check" size="xs" color={t.c.brand} strokeWidth={2.4} /> : icon ? <Icon name={icon} size="xs" color={t.c.ink2} /> : null}
      <Txt variant="sm" color={selected ? t.c.brand : t.c.ink2} style={{ fontFamily: t.type.bodyStrong.fontFamily }} numberOfLines={1}>{label}</Txt>
    </Pressable>
  );
}
export interface Option<V extends string = string> { value: V; label: string; icon?: IconName }
type ChipGroupProps<V extends string> = { options: (Option<V> | V)[]; scroll?: boolean; accessibilityLabel?: string } & (
  { multi: true; value: V[]; onChange: (v: V[]) => void } | { multi?: false; value: V | null; onChange: (v: V) => void });
/** wrap (or horizontally scrolling) chip group; single or multi select */
export function ChipGroup<V extends string>(p: ChipGroupProps<V>) {
  const opts = p.options.map(o => (typeof o === 'string' ? { value: o, label: o } : o)) as Option<V>[];
  const chips = opts.map(o => {
    const sel = p.multi ? p.value.includes(o.value) : p.value === o.value;
    return <Chip key={o.value} label={o.label} icon={o.icon} selected={sel} onPress={() => {
      if (p.multi) p.onChange(sel ? p.value.filter(v => v !== o.value) : [...p.value, o.value]);
      else p.onChange(o.value);
    }} />;
  });
  if (p.scroll) return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }} accessibilityLabel={p.accessibilityLabel}>{chips}</ScrollView>;
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} accessibilityLabel={p.accessibilityLabel}>{chips}</View>;
}

/* ---------------- Segmented ---------------- */
export function Segmented<V extends string>({ options, value, onChange, size = 'md', accessibilityLabel }: { options: Option<V>[]; value: V; onChange: (v: V) => void; size?: 'md' | 'lg'; accessibilityLabel?: string }) {
  const t = useTheme();
  const h = size === 'lg' ? 48 : 44;
  return (
    <View accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} style={{ flexDirection: 'row', padding: 4, borderRadius: 14, backgroundColor: t.c.surface2, gap: 4 }}>
      {options.map(o => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => { if (!on) { tap('select'); onChange(o.value); } }} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={{ flex: 1, minWidth: 0, minHeight: h - 8, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, paddingHorizontal: 8,
              backgroundColor: on ? t.c.segOn : 'transparent', ...(on ? t.shadow(1) : {}) }}>
            {o.icon ? <Icon name={o.icon} size="sm" color={on ? t.c.ink : t.c.muted} /> : null}
            <Txt variant="sm" color={on ? t.c.ink : t.c.muted} numberOfLines={1} style={{ fontFamily: t.type.bodyStrong.fontFamily }}>{o.label}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------------- Fields ---------------- */
export interface FieldShellProps { label?: string; hint?: string; error?: string | null; optional?: boolean; children: ReactNode }
export function Field({ label, hint, error, optional, children }: FieldShellProps) {
  const t = useTheme();
  return (
    <View style={{ gap: 6, flex: 1, minWidth: 0 }}>
      {label ? <Txt variant="sm" color="ink2" style={{ fontFamily: t.type.bodyStrong.fontFamily }}>{label}{optional ? <Txt variant="sm" color="muted"> (optional)</Txt> : null}</Txt> : null}
      {children}
      {error ? <Txt variant="sm" color={t.c.danger} accessibilityLiveRegion="polite">{error}</Txt> : hint ? <Txt variant="sm" color="muted">{hint}</Txt> : null}
    </View>
  );
}
export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string; hint?: string; error?: string | null; optional?: boolean;
  /** muted suffix inside the field ('kcal', 'lb') */
  suffix?: string;
  icon?: IconName;
  multiline?: boolean;
  style?: StyleProp<ViewStyle>;
}
export function TextField({ label, hint, error, optional, suffix, icon, multiline, style, ...input }: TextFieldProps) {
  const t = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <Field label={label} hint={hint} error={error} optional={optional}>
      <View style={[{
        flexDirection: 'row', alignItems: multiline ? 'flex-start' : 'center', gap: 8, minHeight: multiline ? 96 : 48, paddingHorizontal: 14,
        borderRadius: t.radius.sm, backgroundColor: t.c.surface, borderWidth: focus ? 2 : 1,
        borderColor: error ? t.c.danger : focus ? t.c.brand : t.c.lineStrong,
      }, style]}>
        {icon ? <Icon name={icon} size="sm" color={t.c.muted} /> : null}
        <TextInput
          placeholderTextColor={t.c.muted}
          {...input}
          multiline={multiline}
          onFocus={e => { setFocus(true); input.onFocus?.(e); }}
          onBlur={e => { setFocus(false); input.onBlur?.(e); }}
          accessibilityLabel={input.accessibilityLabel ?? label}
          style={[t.type.body, { flex: 1, minWidth: 0, color: t.c.ink, paddingVertical: multiline ? 12 : 10, textAlignVertical: multiline ? 'top' : 'center' },
            Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
        />
        {suffix ? <Txt variant="sm" color="muted">{suffix}</Txt> : null}
      </View>
    </Field>
  );
}
/** numeric field: decimal keyboard, tabular figures. value is the raw string (parse with parseNum). */
export function NumberField({ decimals = 1, ...p }: TextFieldProps & { decimals?: number }) {
  const kb: KeyboardTypeOptions = decimals > 0 ? 'decimal-pad' : 'number-pad';
  return <TextField keyboardType={kb} inputMode={decimals > 0 ? 'decimal' : 'numeric'} selectTextOnFocus {...p} />;
}
/** label left, value control right (for rows of fields that fit side by side) */
export function FieldRow({ children }: { children: ReactNode }) { return <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>{children}</View>; }

/* ---------------- DateStepper ---------------- */
/** ‹ Today › day picker (no native picker needed). `max` defaults to today; pass null for no max. */
export function DateStepper({ value, onChange, max, min, label }: { value: string; onChange: (k: string) => void; max?: string | null; min?: string; label?: string }) {
  const t = useTheme();
  const mx = max === undefined ? todayKey() : max;
  const canNext = !mx || value < mx;
  const canPrev = !min || value > min;
  return (
    <Field label={label}>
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48, borderRadius: t.radius.sm, borderWidth: 1, borderColor: t.c.lineStrong, backgroundColor: t.c.surface }}>
        <IconButton icon="back" accessibilityLabel="Previous day" onPress={() => canPrev && onChange(addDays(value, -1))} disabled={!canPrev} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Txt variant="bodyStrong" numberOfLines={1}>{isValidKey(value) ? relDay(value) : '–'}</Txt>
        </View>
        <IconButton icon="chevron" accessibilityLabel="Next day" onPress={() => canNext && onChange(addDays(value, 1))} disabled={!canNext} />
      </View>
    </Field>
  );
}

/* ---------------- TimeField ---------------- */
/** 'HH:MM' text field that accepts "7", "7:05", "705", "7pm"; normalizes on blur. */
export function TimeField({ value, onChange, label = 'Time', error }: { value: string; onChange: (hhmm: string) => void; label?: string; error?: string | null }) {
  const [draft, setDraft] = useState(value);
  const [bad, setBad] = useState(false);
  const [last, setLast] = useState(value);
  if (value !== last) { setLast(value); setDraft(value); }
  return (
    <TextField label={label} value={draft} icon="clock" inputMode="numeric" keyboardType="numbers-and-punctuation" maxLength={8}
      error={error || (bad ? 'Use a time like 7:30 or 19:30.' : null)}
      onChangeText={s => { setDraft(s); const p = parseTime(s); setBad(false); if (p && /^\d{1,2}:\d{2}$/.test(s.trim())) onChange(p); }}
      onBlur={() => { const p = parseTime(draft); if (p) { setDraft(p); onChange(p); setBad(false); } else setBad(true); }} />
  );
}

/* ---------------- Toggle ---------------- */
export function Toggle({ label, sub, value, onChange }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={() => { tap('select'); onChange(!value); }} accessibilityRole="switch" accessibilityState={{ checked: value }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 }}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt variant="bodyStrong">{label}</Txt>
        {sub ? <Txt variant="sm" color="muted">{sub}</Txt> : null}
      </View>
      <Switch value={value} onValueChange={v => { tap('select'); onChange(v); }} trackColor={{ true: t.c.brand, false: t.c.lineStrong }} thumbColor={Platform.OS === 'android' ? t.c.surface : undefined} />
    </Pressable>
  );
}
