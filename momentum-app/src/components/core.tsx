/* UI kit — primitives: Txt, Icon, Screen, Card, SectionHeader, StatTile, ListRow, Badge, ProgressBar, EmptyState, Divider, Dot. */
import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View, type RefreshControlProps, type ScrollViewProps, type StyleProp, type TextStyle, type ViewStyle, Text, type TextProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';
import { useTheme, type Colors, type TypeVariant } from '../theme';
import { ICONS, type IconName } from './icons';

export type Tone = 'brand' | 'teal' | 'amber' | 'danger' | 'neutral';
export const toneColors = (c: Colors, tone: Tone = 'neutral') => ({
  brand: { fg: c.brand, bg: c.brandTint, fill: c.brand },
  teal: { fg: c.teal, bg: c.tealTint, fill: c.tealFill },
  amber: { fg: c.amber, bg: c.amberTint, fill: c.amberFill },
  danger: { fg: c.danger, bg: c.dangerTint, fill: c.danger },
  neutral: { fg: c.ink2, bg: c.surface2, fill: c.ink2 },
}[tone]);

/* ---------------- Txt ---------------- */
export interface TxtProps extends TextProps {
  variant?: TypeVariant;
  color?: keyof Colors | string;
  /** tabular figures + no wrap (numbers) */
  num?: boolean;
  center?: boolean;
  style?: StyleProp<TextStyle>;
  children?: ReactNode;
}
/** Text with the type scale. color: a token name ('muted', 'brand'…) or a raw color. Default ink. */
export function Txt({ variant = 'body', color, num, center, style, children, ...rest }: TxtProps) {
  const t = useTheme();
  const col = color ? ((t.c as Record<string, string>)[color] ?? color) : t.c.ink;
  return (
    <Text {...rest} maxFontSizeMultiplier={rest.maxFontSizeMultiplier ?? 1.6}
      style={[t.type[variant], { color: col }, num && t.type.num, center && { textAlign: 'center' }, style]}>{children}</Text>
  );
}

/* ---------------- Icon ---------------- */
export const ICON_SIZES = { xs: 14, sm: 16, md: 20, lg: 24, xl: 32 } as const;
export function Icon({ name, size = 'md', color, strokeWidth = 1.75 }: { name: IconName; size?: keyof typeof ICON_SIZES | number; color?: string; strokeWidth?: number }) {
  const t = useTheme();
  const px = typeof size === 'number' ? size : ICON_SIZES[size];
  const col = color ? ((t.c as Record<string, string>)[color] ?? color) : t.c.ink;
  const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.info}</svg>`;
  return <SvgXml xml={xml} width={px} height={px} />;
}
/** round tinted icon chip (40/36/48) */
export function IconBubble({ name, tone = 'brand', size = 40, iconSize, solid }: { name: IconName; tone?: Tone; size?: number; iconSize?: number; solid?: boolean }) {
  const t = useTheme();
  const tc = toneColors(t.c, tone);
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.35, backgroundColor: solid ? tc.fill : tc.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={name} size={iconSize ?? Math.round(size * 0.5)} color={solid ? t.c.onBrand : tc.fg} />
    </View>
  );
}

/* ---------------- Screen ---------------- */
export interface ScreenProps extends Omit<ScrollViewProps, 'children'> {
  children: ReactNode;
  /** adds bottom padding for the floating tab bar */
  tabs?: boolean;
  /** pinned above the scroll (e.g. a compact header) */
  header?: ReactNode;
  /** content max width (centered on tablets/web). default 760 */
  maxWidth?: number;
  /** no ScrollView (for screens that manage their own list) */
  static?: boolean;
  /** pad the top safe area (default true; stack screens with a native header pass false) */
  safeTop?: boolean;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  contentStyle?: StyleProp<ViewStyle>;
}
export function Screen({ children, tabs, header, maxWidth = 760, static: isStatic, safeTop = true, contentStyle, ...rest }: ScreenProps) {
  const t = useTheme();
  const ins = useSafeAreaInsets();
  const padBottom = (tabs ? t.layout.tabBarH + 24 : 0) + ins.bottom + 40;
  const inner = <View style={[{ width: '100%', maxWidth, alignSelf: 'center', paddingHorizontal: t.layout.pageX, gap: t.layout.sectionGap }, contentStyle]}>{children}</View>;
  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg, paddingTop: safeTop ? ins.top : 0 }}>
      {header}
      {isStatic ? <View style={{ flex: 1, paddingTop: 12, paddingBottom: padBottom }}>{inner}</View> : (
        // forms on stack screens (onboarding, plan, profile) stay above the keyboard; edge-to-edge Android no longer resizes the window
        <KeyboardAvoidingView enabled={!tabs && Platform.OS !== 'web'} behavior="padding" style={{ flex: 1 }}>
          <ScrollView {...rest} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 12, paddingBottom: padBottom }} style={{ flex: 1 }}>{inner}</ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

/** page header: overline, title, sub, actions (right) */
export function PageHeader({ over, title, sub, actions }: { over?: string; title: string; sub?: string; actions?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingTop: 8 }}>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        {over ? <Txt variant="over" color="muted">{over}</Txt> : null}
        <Txt variant="h1" accessibilityRole="header">{title}</Txt>
        {sub ? <Txt variant="body" color="ink2">{sub}</Txt> : null}
      </View>
      {actions ? <View style={{ flexDirection: 'row', gap: 8 }}>{actions}</View> : null}
    </View>
  );
}

/* ---------------- Card ---------------- */
export interface CardProps {
  children?: ReactNode;
  tint?: 'brand' | 'teal' | 'amber';
  /** inner padding (default 20); 0 for edge-to-edge lists */
  pad?: number;
  gap?: number;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  /** elevated surface (sheets-in-card, hero) */
  elevated?: boolean;
}
export function Card({ children, tint, pad, gap = 16, onPress, accessibilityLabel, style, elevated }: CardProps) {
  const t = useTheme();
  const bg = tint ? toneColors(t.c, tint).bg : elevated ? t.c.elevated : t.c.surface;
  const base: ViewStyle = { backgroundColor: bg, borderRadius: t.radius.lg, padding: pad ?? t.layout.cardPad, gap, borderWidth: 1, borderColor: tint ? 'transparent' : t.c.cardBorder, ...t.shadow(tint ? 0 : 1) };
  if (onPress) return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [base, pressed && { opacity: 0.92, transform: [{ scale: 0.995 }] }, style]}>{children}</Pressable>
  );
  return <View style={[base, style]}>{children}</View>;
}
export function CardHeader({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt variant="title">{title}</Txt>
        {sub ? <Txt variant="sm" color="muted">{sub}</Txt> : null}
      </View>
      {action}
    </View>
  );
}

/* ---------------- SectionHeader ---------------- */
export function SectionHeader({ title, sub, action }: { title: string; sub?: string; action?: { label: string; onPress: () => void } | ReactNode }) {
  const t = useTheme();
  const isObj = action && typeof action === 'object' && 'label' in (action as object);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt variant="h2" accessibilityRole="header">{title}</Txt>
        {sub ? <Txt variant="sm" color="muted">{sub}</Txt> : null}
      </View>
      {isObj ? (
        <Pressable onPress={(action as { onPress: () => void }).onPress} hitSlop={12} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
          <Txt variant="bodyStrong" color={t.c.brand}>{(action as { label: string }).label}</Txt>
        </Pressable>
      ) : (action as ReactNode) || null}
    </View>
  );
}
/** a section = header + 12pt gap + content (use inside Screen whose gap is the 32pt section rhythm) */
export function Section({ title, sub, action, children, gap = 12 }: { title?: string; sub?: string; action?: { label: string; onPress: () => void } | ReactNode; children: ReactNode; gap?: number }) {
  return (
    <View style={{ gap }}>
      {title ? <SectionHeader title={title} sub={sub} action={action} /> : null}
      {children}
    </View>
  );
}

/* ---------------- Dot / Divider ---------------- */
export function Dot({ color, size = 8, square }: { color: string; size?: number; square?: boolean }) {
  return <View style={{ width: size, height: size, borderRadius: square ? 2 : size / 2, backgroundColor: color }} />;
}
export function Divider({ inset = 0 }: { inset?: number }) {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: t.c.line, marginLeft: inset, marginRight: inset }} />;
}

/* ---------------- StatTile ---------------- */
export interface StatTileProps {
  label: string; value: string; unit?: string; sub?: string;
  dot?: string; subTone?: 'good' | 'warn' | 'muted'; inset?: boolean; onPress?: () => void; icon?: IconName;
}
/** label (with optional color dot), big number + small unit, sub line. Max 2 per row on phones. */
export function StatTile({ label, value, unit, sub, dot, subTone = 'muted', inset, onPress, icon }: StatTileProps) {
  const t = useTheme();
  const body = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {dot ? <Dot color={dot} /> : null}
        {icon ? <Icon name={icon} size="sm" color={t.c.muted} /> : null}
        <Txt variant="sm" color="muted" numberOfLines={1} style={{ flexShrink: 1 }}>{label}</Txt>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <Txt variant="h1" num numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ flexShrink: 1 }}>{value}</Txt>
        {unit ? <Txt variant="sm" color="muted">{unit}</Txt> : null}
      </View>
      {sub ? <Txt variant="sm" color={subTone === 'good' ? t.c.good : subTone === 'warn' ? t.c.amber : t.c.muted}>{sub}</Txt> : null}
    </>
  );
  const st: ViewStyle = { flex: 1, minWidth: 0, gap: 4, padding: 16, borderRadius: t.radius.md, backgroundColor: inset ? t.c.surface2 : t.c.surface, borderWidth: inset ? 0 : 1, borderColor: t.c.cardBorder, ...(inset ? {} : t.shadow(1)) };
  return onPress
    ? <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [st, pressed && { opacity: 0.85 }]}>{body}</Pressable>
    : <View style={st}>{body}</View>;
}
/** two tiles per row */
export function StatRow({ children }: { children: ReactNode }) { return <View style={{ flexDirection: 'row', gap: 12 }}>{children}</View>; }

/* ---------------- ListRow ---------------- */
export interface ListRowProps {
  title: string; sub?: string;
  icon?: IconName; iconTone?: Tone;
  /** image uri (44px rounded thumb) */
  thumb?: string | null;
  left?: ReactNode;
  value?: string; unit?: string; valueTone?: 'good' | 'warn';
  right?: ReactNode;
  chevron?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
  /** draws a hairline under the row (for stacked rows inside a Card pad=0) */
  divider?: boolean;
  padX?: number;
}
export function ListRow({ title, sub, icon, iconTone = 'brand', thumb, left, value, unit, valueTone, right, chevron, onPress, onLongPress, accessibilityLabel, divider, padX = 16 }: ListRowProps) {
  const t = useTheme();
  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60, paddingVertical: 10, paddingHorizontal: padX }}>
      {left ?? (thumb ? <Image source={{ uri: thumb }} style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: t.c.surface2 }} contentFit="cover" cachePolicy="memory-disk" transition={150} />
        : icon ? <IconBubble name={icon} tone={iconTone} size={40} /> : null)}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt variant="bodyStrong" numberOfLines={2}>{title}</Txt>
        {sub ? <Txt variant="sm" color="muted" numberOfLines={2}>{sub}</Txt> : null}
      </View>
      {value != null ? (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3, flexShrink: 0 }}>
          <Txt variant="bodyStrong" num color={valueTone === 'good' ? t.c.good : valueTone === 'warn' ? t.c.amber : t.c.ink}>{value}</Txt>
          {unit ? <Txt variant="cap" color="muted">{unit}</Txt> : null}
        </View>
      ) : null}
      {right}
      {chevron ? <Icon name="chevron" size="sm" color={t.c.muted} /> : null}
    </View>
  );
  return (
    <View>
      {onPress || onLongPress ? (
        <Pressable onPress={onPress} onLongPress={onLongPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title}
          style={({ pressed }) => [{ borderRadius: 14 }, pressed && { backgroundColor: t.c.surface2 }]}>{content}</Pressable>
      ) : content}
      {divider ? <Divider inset={padX} /> : null}
    </View>
  );
}

/* ---------------- Badge ---------------- */
export function Badge({ text, tone = 'brand', icon }: { text: string; tone?: Tone; icon?: IconName }) {
  const t = useTheme();
  const tc = toneColors(t.c, tone);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: tc.bg }}>
      {icon ? <Icon name={icon} size="xs" color={tc.fg} /> : null}
      <Txt variant="cap" color={tc.fg} numberOfLines={1}>{text}</Txt>
    </View>
  );
}

/* ---------------- ProgressBar ---------------- */
export function ProgressBar({ value, tone = 'teal', height = 8, label, right, color }: { value: number; tone?: 'brand' | 'teal' | 'amber'; height?: number; label?: string; right?: string; color?: string }) {
  const t = useTheme();
  const v = Math.max(0, Math.min(1, isFinite(value) ? value : 0));
  const fill = color || toneColors(t.c, tone).fill;
  return (
    <View style={{ gap: 6 }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }} accessibilityLabel={label}>
      <View style={{ height, borderRadius: 999, backgroundColor: t.c.dTrack, overflow: 'hidden' }}>
        <View style={{ width: `${v * 100}%`, height: '100%', borderRadius: 999, backgroundColor: fill }} />
      </View>
      {label || right ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <Txt variant="sm" color="muted" style={{ flexShrink: 1 }}>{label || ''}</Txt>
          {right ? <Txt variant="sm" color="muted" num>{right}</Txt> : null}
        </View>
      ) : null}
    </View>
  );
}

/* ---------------- EmptyState ---------------- */
export function EmptyState({ icon = 'sparkle', title, body, action, compact }: { icon?: IconName; title: string; body?: string; action?: ReactNode; compact?: boolean }) {
  return (
    <View style={{ alignItems: 'center', gap: 10, paddingVertical: compact ? 12 : 28, paddingHorizontal: 8 }}>
      <IconBubble name={icon} tone="brand" size={compact ? 44 : 56} />
      <Txt variant="title" center>{title}</Txt>
      {body ? <Txt variant="body" color="muted" center style={{ maxWidth: 340 }}>{body}</Txt> : null}
      {action ? <View style={{ marginTop: 6, alignSelf: 'stretch', alignItems: 'center' }}>{action}</View> : null}
    </View>
  );
}

/* ---------------- Notice ---------------- */
export function Notice({ tone = 'brand', icon = 'info', children, title }: { tone?: Tone; icon?: IconName; title?: string; children?: ReactNode }) {
  const t = useTheme();
  const tc = toneColors(t.c, tone);
  return (
    <View style={{ flexDirection: 'row', gap: 12, padding: 14, borderRadius: t.radius.md, backgroundColor: tc.bg }}>
      <Icon name={icon} color={tc.fg} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        {title ? <Txt variant="bodyStrong" color={tc.fg}>{title}</Txt> : null}
        {typeof children === 'string' ? <Txt variant="sm" color="ink2">{children}</Txt> : children}
      </View>
    </View>
  );
}

/* ---------------- Value (big number + small unit) ---------------- */
export function Value({ n, unit, size = 'h1', color }: { n: string; unit?: string; size?: 'hero' | 'display' | 'h1' | 'h2' | 'title'; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, flexShrink: 1 }}>
      <Txt variant={size} num color={color} numberOfLines={1}>{n}</Txt>
      {unit ? <Txt variant={size === 'hero' || size === 'display' ? 'title' : 'sm'} color="muted">{unit}</Txt> : null}
    </View>
  );
}

export const isWeb = Platform.OS === 'web';
