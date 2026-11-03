/* UI kit — overlays: SheetFrame/Sheet/ModalSheetScreen, toast() + ToastHost, confirm() + ConfirmHost, celebrate() + CelebrationHost. */
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { newlyCrossed } from '../lib/calc';
import { derived, getState, store, subscribe } from '../lib/store';
import { makeUnits } from '../lib/format';
import { useTheme } from '../theme';
import { Button, IconButton, tap } from './controls';
import { Icon, IconBubble, Txt } from './core';

let reduceMotion = false;
AccessibilityInfo.isReduceMotionEnabled?.().then(v => { reduceMotion = !!v; }).catch(() => {});
AccessibilityInfo.addEventListener?.('reduceMotionChanged', v => { reduceMotion = !!v; });
export const prefersReducedMotion = () => reduceMotion;

/* ---------------- SheetFrame ---------------- */
export interface SheetFrameProps {
  title?: string; sub?: string;
  children?: ReactNode;
  /** sticky footer (put ONE primary Button here) */
  footer?: ReactNode;
  onClose: () => void;
  /** wrap children in a ScrollView (default true) */
  scroll?: boolean;
  /** max width on tablets/web (default 560) */
  maxWidth?: number;
  /** hide the X button */
  hideClose?: boolean;
}
/** Scrim + bottom sheet (24pt top radius), header with close, scrolling body, sticky footer. Slides up on mount. */
export function SheetFrame({ title, sub, children, footer, onClose, scroll = true, maxWidth = 560, hideClose }: SheetFrameProps) {
  const t = useTheme();
  const ins = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const y = useRef(new Animated.Value(reduceMotion ? 0 : 1)).current;
  useEffect(() => { Animated.timing(y, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }).start(); }, [y]);
  const wide = width >= 700;
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: wide ? 'center' : 'flex-end' }}>
      <Pressable onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.c.scrim }} />
      <Animated.View accessibilityViewIsModal style={{
        width: '100%', maxWidth, alignSelf: 'center', maxHeight: height - ins.top - (wide ? 48 : 12),
        backgroundColor: t.dark ? t.c.elevated : t.c.surface,
        borderTopLeftRadius: 24, borderTopRightRadius: 24, borderBottomLeftRadius: wide ? 24 : 0, borderBottomRightRadius: wide ? 24 : 0,
        ...t.shadow(3), transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [0, 420] }) }],
      }}>
        {!wide ? <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: t.c.lineStrong, marginTop: 8 }} /> : null}
        {title || !hideClose ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 20, paddingTop: wide ? 20 : 12, paddingBottom: 8 }}>
            <View style={{ flex: 1, minWidth: 0, gap: 2, paddingTop: 6 }}>
              {title ? <Txt variant="h2" accessibilityRole="header">{title}</Txt> : null}
              {sub ? <Txt variant="sm" color="muted">{sub}</Txt> : null}
            </View>
            {!hideClose ? <IconButton icon="close" accessibilityLabel="Close" filled onPress={onClose} /> : null}
          </View>
        ) : null}
        {scroll ? (
          <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: footer ? 16 : 24 + ins.bottom, gap: 20 }}>{children}</ScrollView>
        ) : <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: footer ? 16 : 24 + ins.bottom, gap: 20, flexShrink: 1 }}>{children}</View>}
        {footer ? (
          <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 + (wide ? 4 : ins.bottom), borderTopWidth: 1, borderTopColor: t.c.line }}>{footer}</View>
        ) : null}
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

/** In-screen bottom sheet (RN Modal). */
export function Sheet({ visible, ...p }: SheetFrameProps & { visible: boolean }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={p.onClose} statusBarTranslucent navigationBarTranslucent>
      {visible ? <SheetFrame {...p} /> : null}
    </Modal>
  );
}
/** Body of a modal ROUTE (app/add-food.tsx etc., presented as transparentModal): same sheet look; close = router.back(). */
export function ModalSheetScreen(p: Omit<SheetFrameProps, 'onClose'> & { onClose?: () => void }) {
  const close = p.onClose || (() => (router.canGoBack() ? router.back() : router.replace('/')));
  return <View style={{ flex: 1 }}><SheetFrame {...p} onClose={close} /></View>;
}

/* ---------------- Toast ---------------- */
export interface ToastOpts { action?: { label: string; fn: () => void }; duration?: number; tone?: 'default' | 'error' }
type ToastMsg = { id: number; msg: string } & ToastOpts;
let toastListener: ((m: ToastMsg | null) => void) | null = null;
let toastSeq = 0;
/** toast('Deleted', {action:{label:'Undo', fn: undo}}) — undo pattern. Safe to call anywhere. */
export function toast(msg: string, opts: ToastOpts = {}) { toastListener?.({ id: ++toastSeq, msg, ...opts }); }
export function ToastHost() {
  const t = useTheme();
  const ins = useSafeAreaInsets();
  const [m, setM] = useState<ToastMsg | null>(null);
  const op = useRef(new Animated.Value(0)).current;
  useEffect(() => { toastListener = setM; return () => { toastListener = null; }; }, []);
  useEffect(() => {
    if (!m) return;
    AccessibilityInfo.announceForAccessibility?.(m.msg);
    Animated.timing(op, { toValue: 1, duration: 180, useNativeDriver: Platform.OS !== 'web' }).start();
    const id = setTimeout(() => Animated.timing(op, { toValue: 0, duration: 180, useNativeDriver: Platform.OS !== 'web' }).start(() => setM(cur => (cur && cur.id === m.id ? null : cur))), m.duration ?? (m.action ? 5000 : 2800));
    return () => clearTimeout(id);
  }, [m, op]);
  if (!m) return null;
  return (
    <Animated.View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, bottom: ins.bottom + t.layout.tabBarH + 28, alignItems: 'center', opacity: op, zIndex: 50 }}>
      <View accessibilityLiveRegion="polite" style={{ maxWidth: 520, width: '100%', flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingLeft: 18, paddingRight: m.action ? 6 : 18, borderRadius: 16,
        backgroundColor: t.dark ? t.c.segOn : '#1E2130', ...t.shadow(2) }}>
        {m.tone === 'error' ? <Icon name="alert" size="sm" color={t.dark ? t.c.amber : '#FCD34D'} /> : null}
        <Txt variant="sm" color="#FFFFFF" style={{ flex: 1 }} numberOfLines={3}>{m.msg}</Txt>
        {m.action ? (
          <Pressable onPress={() => { tap(); m.action!.fn(); setM(null); }} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 12 }}>
            <Txt variant="bodyStrong" color={t.dark ? t.c.brand : '#C4C1FF'}>{m.action.label}</Txt>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

/* ---------------- Confirm ---------------- */
export interface ConfirmOpts { title: string; body?: string; ok?: string; cancel?: string; danger?: boolean }
let confirmListener: ((o: (ConfirmOpts & { resolve: (v: boolean) => void }) | null) => void) | null = null;
/** await confirm({title, body, ok:'Delete', danger:true}) → boolean */
export function confirm(o: ConfirmOpts): Promise<boolean> {
  return new Promise(resolve => { if (!confirmListener) resolve(false); else confirmListener({ ...o, resolve }); });
}
export function ConfirmDialog({ visible, title, body, ok = 'OK', cancel = 'Cancel', danger, onResult }: ConfirmOpts & { visible: boolean; onResult: (v: boolean) => void }) {
  const t = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => onResult(false)} statusBarTranslucent>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Pressable onPress={() => onResult(false)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.c.scrim }} accessibilityLabel="Cancel" />
        <View accessibilityViewIsModal accessibilityRole="alert" style={{ width: '100%', maxWidth: 400, borderRadius: 24, padding: 24, gap: 12, backgroundColor: t.dark ? t.c.elevated : t.c.surface, ...t.shadow(3) }}>
          <Txt variant="h2">{title}</Txt>
          {body ? <Txt variant="body" color="ink2">{body}</Txt> : null}
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
            <View style={{ flex: 1 }}><Button label={cancel} variant="secondary" block onPress={() => onResult(false)} /></View>
            <View style={{ flex: 1 }}><Button label={ok} variant={danger ? 'danger' : 'primary'} block onPress={() => onResult(true)} /></View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
export function ConfirmHost() {
  const [o, setO] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  useEffect(() => { confirmListener = setO; return () => { confirmListener = null; }; }, []);
  if (!o) return null;
  return <ConfirmDialog visible {...o} onResult={v => { o.resolve(v); setO(null); }} />;
}

/* ---------------- Celebration ---------------- */
export interface CelebrateOpts { title: string; sub?: string; kind?: 'goal' | 'w' | 's'; cta?: string }
let celebrateListener: ((o: (CelebrateOpts & { resolve: () => void }) | null) => void) | null = null;
export function celebrate(o: CelebrateOpts): Promise<void> {
  return new Promise(resolve => { if (!celebrateListener) resolve(); else celebrateListener({ ...o, resolve }); });
}
export function Celebration({ title, sub, kind, cta = 'Keep going', onClose }: CelebrateOpts & { onClose: () => void }) {
  const t = useTheme();
  const s = useRef(new Animated.Value(reduceMotion ? 1 : 0.8)).current;
  useEffect(() => { tap('success'); Animated.spring(s, { toValue: 1, useNativeDriver: Platform.OS !== 'web', friction: 6 }).start(); }, [s]);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Pressable onPress={onClose} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.c.scrim }} accessibilityLabel="Close" />
        <Animated.View accessibilityViewIsModal style={{ width: '100%', maxWidth: 380, alignItems: 'center', gap: 14, padding: 28, borderRadius: 28, backgroundColor: t.dark ? t.c.elevated : t.c.surface, transform: [{ scale: s }], ...t.shadow(3) }}>
          <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: kind === 'goal' ? t.c.amberTint : t.c.brandTint, alignItems: 'center', justifyContent: 'center' }}>
            <IconBubble name={kind === 's' ? 'flame' : kind === 'goal' ? 'trophy' : 'flag'} tone={kind === 'goal' ? 'amber' : 'brand'} size={64} solid />
          </View>
          <Txt variant="over" color="muted">{kind === 'goal' ? 'Goal reached' : 'Milestone'}</Txt>
          <Txt variant="h1" center>{title}</Txt>
          {sub ? <Txt variant="body" color="ink2" center>{sub}</Txt> : null}
          <Button label={cta} block onPress={onClose} style={{ marginTop: 8 }} />
        </Animated.View>
      </View>
    </Modal>
  );
}
/** Mount once (root layout). Shows imperative celebrate() calls and auto-celebrates newly crossed milestones. */
export function CelebrationHost() {
  const [o, setO] = useState<(CelebrateOpts & { resolve: () => void }) | null>(null);
  useEffect(() => { celebrateListener = setO; return () => { celebrateListener = null; }; }, []);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let busy = false;
    let primed = false;
    const check = () => {
      const s = getState();
      if (!s.ready || busy || !store.profileComplete()) return;
      const a = derived.analysis();
      const fresh = newlyCrossed(a.milestones, s.profile!.celebrated);
      if (!fresh.length) { primed = true; return; }
      const ids = (s.profile!.celebrated || []).concat(fresh.map(m => m.id));
      // first look at existing data (fresh install / sign-in): mark silently
      if (!primed || !(s.profile!.celebrated || []).length) { primed = true; store.setProfile({ celebrated: ids }); return; }
      const top = fresh.find(m => m.isGoal) || fresh[0];
      store.setProfile({ celebrated: ids });
      busy = true;
      const u = makeUnits(s.profile!.unit);
      const sub = top.kind === 's' ? top.sub : top.isGoal ? 'You reached your goal weight. Take a moment to enjoy it.' : top.sub + '. Your trend is ' + u.w(a.current) + '.';
      celebrate({ title: top.title, sub, kind: top.isGoal ? 'goal' : top.kind }).then(() => { busy = false; });
    };
    const unsub = subscribe(() => { if (timer) clearTimeout(timer); timer = setTimeout(check, 500); });
    check();
    return () => { unsub(); if (timer) clearTimeout(timer); };
  }, []);
  if (!o) return null;
  return <Celebration {...o} onClose={() => { o.resolve(); setO(null); }} />;
}

/** Mount once at the root: toasts, confirms, celebrations. */
export function OverlayHosts() {
  return (<><ToastHost /><ConfirmHost /><CelebrationHost /></>);
}
