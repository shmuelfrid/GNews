/* Steps & active calories sheet (route /health-import?date=&mode=health-connect|screenshot|export|manual).
   1. Health Connect (Android build): connect (permissions), sync today / 7 / 30 days, last sync, manage permissions.
   2. Screenshot → Claude (analyze health_screenshot) → editable review → save as the day's activity.
   3. Samsung "Download personal data" CSVs (multiple) → parse → preview + range → merge.
   4. Manual steps / active kcal (+ clear day).
   Never double count: active kcal replaces the day's activity; Samsung workouts are always countedInSamsung. */
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, View } from 'react-native';
import {
  Button, DateStepper, Icon, IconBubble, ModalSheetScreen, Notice, NumberField, Segmented, Txt, confirm, tap, toast,
} from '@/components';
import { AiError, aiAvailable, AI_UNAVAILABLE_TEXT, analyzeHealthScreenshot, isFatal, type HealthAiResult } from '@/lib/ai';
import { isValidKey, keyOf, stepKcal } from '@/lib/calc';
import { isUsefulSamsungFile, parseSamsung, pickTextFiles, type SamsungResult } from '@/lib/csv';
import { fmtDate, fmtTime, int, parseNum, plural, relDay, todayKey } from '@/lib/format';
import { HEALTH_UNSUPPORTED_TEXT, openHealthSettings } from '@/lib/health';
import { ImageError, pickImage, prepareImage, type PreparedImage } from '@/lib/images';
import { store, useCurrentKg, useDay, useProfile, useUnits } from '@/lib/store';
import type { Activity } from '@/lib/types';
import { useTheme } from '@/theme';
import { connectHealth, hasCorePermissions, refreshHealthStatus, syncedLabel, syncHealth, useHealthState } from './healthSync';
import { buildActivity, filterExport, round1, validateActivity, type ExportRange } from './model';

const fin = (v: unknown): v is number => typeof v === 'number' && isFinite(v);
const numOrNull = (s: string) => { const v = parseNum(s); return fin(v) ? v : null; };
const str = (v: number | null | undefined, d = 0) => (fin(v) ? String(d ? round1(v) : Math.round(v)) : '');
type Mode = 'health-connect' | 'screenshot' | 'export' | 'manual';
type FakeAi = (img: unknown) => Promise<HealthAiResult>;
/** QA hook (web screenshots without Firebase): globalThis.__momentumHealthAiFake = async img => HealthAiResult */
const fakeAi = (): FakeAi | undefined => (globalThis as { __momentumHealthAiFake?: FakeAi }).__momentumHealthAiFake;
const dayName = (k: string) => { const r = relDay(k); return r === 'Today' || r === 'Yesterday' ? r.toLowerCase() : r; };
const RANGES: { value: ExportRange; label: string }[] = [{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: 'all', label: 'All' }];
const HC_PLAY = 'market://details?id=com.google.android.apps.healthdata';

interface Form { steps: string; activeKcal: string; totalKcal: string; activeMinutes: string; distance: string }
const emptyForm: Form = { steps: '', activeKcal: '', totalKcal: '', activeMinutes: '', distance: '' };

function Steps({ items }: { items: string[] }) {
  const t = useTheme();
  return (
    <View style={{ gap: 10 }}>
      {items.map((s, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: t.c.brandTint, alignItems: 'center', justifyContent: 'center' }}>
            <Txt variant="cap" color={t.c.brand}>{i + 1}</Txt>
          </View>
          <Txt variant="body" color="ink2" style={{ flex: 1, minWidth: 0 }}>{s}</Txt>
        </View>
      ))}
    </View>
  );
}
function Thinking({ title }: { title: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: t.radius.md, backgroundColor: t.c.brandTint }} accessibilityLiveRegion="polite">
      <ActivityIndicator color={t.c.brand} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt variant="bodyStrong">{title}</Txt>
        <Txt variant="sm" color="muted">This usually takes 5–30 seconds.</Txt>
      </View>
    </View>
  );
}
function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  const t = useTheme();
  return (
    <View style={{ flexBasis: '46%', flexGrow: 1, padding: 14, borderRadius: t.radius.md, backgroundColor: t.c.surface2, gap: 2 }}>
      <Txt variant="sm" color="muted">{label}</Txt>
      <Txt variant="title" num>{value}{unit ? <Txt variant="sm" color="muted"> {unit}</Txt> : null}</Txt>
    </View>
  );
}

export function HealthImportSheet() {
  const t = useTheme();
  const u = useUnits();
  const profile = useProfile();
  const kgNow = useCurrentKg();
  const kg = fin(kgNow) ? kgNow : profile?.startKg || 80;
  const params = useLocalSearchParams<{ date?: string; mode?: string }>();
  const today = todayKey();
  const hs = useHealthState();
  const ai = aiAvailable() || !!fakeAi();
  const [mode, setMode] = useState<Mode>(() => {
    const m = params.mode;
    if (m === 'health-connect' || m === 'screenshot' || m === 'export' || m === 'manual') return m;
    return hs.status === 'available' || hs.status === 'checking' ? 'health-connect' : ai ? 'screenshot' : 'manual';
  });
  const [date, setDate] = useState(() => (params.date && isValidKey(params.date) && params.date <= today ? params.date : today));
  const day = useDay(date);
  const [form, setForm] = useState<Form>(emptyForm);
  const [errs, setErrs] = useState<{ steps?: string; activeKcal?: string }>({});
  const upF = (p: Partial<Form>) => { setForm(f => ({ ...f, ...p })); setErrs({}); };
  // screenshot
  const [shotStage, setShotStage] = useState<'pick' | 'thinking' | 'review' | 'error'>('pick');
  const [shotErr, setShotErr] = useState('');
  const [img, setImg] = useState<PreparedImage | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [confidence, setConfidence] = useState<string | null>(null);
  const ctlRef = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  // export
  const [exp, setExp] = useState<{ busy: boolean; names: string[]; result: SamsungResult | null; range: ExportRange }>({ busy: false, names: [], result: null, range: '30' });
  // health connect
  const [hcRange, setHcRange] = useState<'1' | '7' | '30'>('7');
  const [hcBusy, setHcBusy] = useState(false);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; ctlRef.current?.abort(); }; }, []);
  // pick the HC tab once we learn it's usable (only when no mode was requested)
  useEffect(() => {
    if (!params.mode && hs.status !== 'checking' && hs.status !== 'available' && mode === 'health-connect') setMode(ai ? 'screenshot' : 'manual');
  }, [hs.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadManual = (k: string) => {
    const a = store.getDay(k).activity;
    setForm(a ? { steps: str(a.steps), activeKcal: str(a.activeKcal), totalKcal: str(a.totalKcal), activeMinutes: str(a.activeMinutes), distance: fin(a.distanceKm) ? str(u.distTo(a.distanceKm), 1) : '' } : emptyForm);
    setErrs({});
  };
  useEffect(() => { if (mode === 'manual') loadManual(date); }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchMode = (m: Mode) => {
    if (m === mode) return;
    if (shotStage === 'thinking') { ctlRef.current?.abort(); ctlRef.current = null; setShotStage('pick'); }
    setMode(m);
  };
  const changeDate = (k: string) => { setDate(k); if (mode === 'manual') loadManual(k); };

  /* ---------- Health Connect ---------- */
  const connect = async () => {
    setHcBusy(true);
    try {
      const g = await connectHealth();
      if (!hasCorePermissions(g)) { toast('Allow at least Steps or Active calories so we can read your activity.', { tone: 'error' }); return; }
      tap('success');
      const r = await syncHealth(7);
      toast(`Connected. Synced ${plural(r.days, 'day')}${r.workouts ? ' and ' + plural(r.workouts, 'workout') : ''}.`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Health Connect couldn’t be opened.', { tone: 'error' });
    } finally { if (mounted.current) setHcBusy(false); }
  };
  const syncNow = async () => {
    setHcBusy(true);
    try {
      const r = await syncHealth(+hcRange);
      tap('success');
      router.back();
      toast(r.days || r.workouts
        ? `Synced ${plural(r.days, 'day')}${r.workouts ? ' and ' + plural(r.workouts, 'workout') : ''} from Samsung Health${r.merged ? `. ${plural(r.merged, 'workout')} you added were matched, not counted twice` : ''}`
        : 'Up to date. Nothing new in Health Connect.');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Sync failed. Try again.', { tone: 'error' });
      if (mounted.current) setHcBusy(false);
    }
  };

  /* ---------- screenshot ---------- */
  const runShot = async (image: PreparedImage) => {
    ctlRef.current?.abort();
    const ctl = new AbortController(); ctlRef.current = ctl;
    setShotStage('thinking'); setShotErr('');
    try {
      const fake = fakeAi();
      const r = fake ? await fake(image) : await analyzeHealthScreenshot(image, { signal: ctl.signal });
      if (ctlRef.current !== ctl || !mounted.current) return;
      ctlRef.current = null;
      const k = r.date_iso && /^\d{4}-\d{2}-\d{2}/.test(r.date_iso) ? r.date_iso.slice(0, 10) : null;
      if (k && isValidKey(k) && k <= today) setDate(k);
      setForm({
        steps: str(r.steps), activeKcal: str(r.active_kcal), totalKcal: str(r.total_kcal), activeMinutes: str(r.active_minutes),
        distance: fin(r.distance_km) ? str(u.distTo(r.distance_km), 1) : '',
      });
      setErrs({});
      setConfidence(r.confidence);
      setShotStage('review');
      tap('success');
      if (r.steps == null && r.active_kcal == null) toast('No steps or active calories were visible. Fill them in or try another screenshot.');
    } catch (e) {
      if (ctlRef.current !== ctl || !mounted.current) return;
      ctlRef.current = null;
      const er = e instanceof AiError ? e : new AiError('internal', undefined, e);
      if (er.code === 'cancelled') { setShotStage('pick'); return; }
      if (isFatal(er.code)) { setMode('manual'); setShotStage('pick'); toast(er.message); return; }
      setShotErr(er.message); setShotStage('error'); tap('warning');
    }
  };
  const pickShot = async () => {
    try {
      const p = await pickImage('library');
      if (!p || !mounted.current) return;
      setPreparing(true);
      const prepared = await prepareImage(p);
      if (!mounted.current) return;
      setPreparing(false);
      setImg(prepared);
      runShot(prepared);
    } catch (e) {
      setPreparing(false);
      toast(e instanceof ImageError ? e.message : 'That screenshot couldn’t be opened. Try another one.', { tone: 'error' });
    }
  };

  /* ---------- export ---------- */
  const pickExport = async () => {
    let files: { name: string; text: string }[] = [];
    try { files = await pickTextFiles({ multiple: true }); } catch (e) { console.warn(e); toast('Those files couldn’t be opened.', { tone: 'error' }); return; }
    if (!files.length) return;
    const csv = files.filter(f => /\.csv$/i.test(f.name));
    const useful = csv.filter(f => isUsefulSamsungFile(f.name));
    const pick = useful.length ? useful : csv.length ? csv : files;
    setExp(e => ({ ...e, busy: true, names: pick.map(f => f.name), result: null }));
    let result: SamsungResult;
    try { result = parseSamsung(pick); } catch (e) {
      console.warn('[samsung export]', e);
      result = { days: {}, workouts: [], files: { steps: 0, exercise: 0, summary: 0, skipped: pick.map(f => f.name) }, from: null, to: null };
    }
    if (mounted.current) setExp(e => ({ ...e, busy: false, result }));
  };
  const sel = exp.result ? filterExport(exp.result, exp.range, today, keyOf) : null;

  /* ---------- save ---------- */
  const formValues = () => ({
    steps: numOrNull(form.steps), activeKcal: numOrNull(form.activeKcal), totalKcal: numOrNull(form.totalKcal),
    activeMinutes: numOrNull(form.activeMinutes), distanceKm: (() => { const d = numOrNull(form.distance); return d != null && d > 0 ? Math.round(u.distFrom(d) * 100) / 100 : null; })(),
  });
  const saveActivity = () => {
    const f = formValues();
    const e = validateActivity(f);
    if (e.steps || e.activeKcal) { setErrs(e); tap('warning'); return; }
    const act = buildActivity(f, mode === 'screenshot' ? 'samsung-screenshot' : 'manual');
    const undo = store.setActivity(date, act);
    tap('success');
    router.back();
    const kc = act.activeKcal != null ? act.activeKcal : Math.round((act.steps || 0) * stepKcal(kg));
    toast(`Saved ${act.steps != null ? int(act.steps) + ' steps' : int(kc) + ' active kcal'} for ${dayName(date)}`, { action: { label: 'Undo', fn: undo } });
  };
  const saveExport = () => {
    if (!exp.result || !sel) return;
    const map: Record<string, Partial<Activity>> = {}, now = Date.now();
    sel.keys.forEach(k => { map[k] = { ...exp.result!.days[k], source: 'samsung-export', syncedAt: now }; });
    const n = sel.keys.length ? store.setActivityBulk(map, { merge: true }) : 0;
    if (sel.workouts.length) store.addItemsBulk('workouts', sel.workouts);
    tap('success');
    router.back();
    toast('Imported ' + [n ? plural(n, 'day') : '', sel.workouts.length ? plural(sel.workouts.length, 'workout') : ''].filter(Boolean).join(' and ') + ' from Samsung Health');
  };
  const clearDay = async () => {
    const ok = await confirm({ title: 'Clear this day’s steps?', body: `Steps and active calories for ${dayName(date)} will be removed. Workouts stay.`, ok: 'Clear', danger: true });
    if (!ok) return;
    const undo = store.setActivity(date, null);
    tap('warning');
    router.back();
    toast('Activity cleared', { action: { label: 'Undo', fn: undo } });
  };

  /* ---------- views ---------- */
  const existingNote = day.activity ? (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
      <Icon name="sync" size="sm" color={t.c.muted} />
      <Txt variant="sm" color="muted" style={{ flex: 1, minWidth: 0 }}>
        This replaces {[fin(day.activity.steps) ? int(day.activity.steps) + ' steps' : '', fin(day.activity.activeKcal) ? int(day.activity.activeKcal) + ' active kcal' : ''].filter(Boolean).join(' and ') || 'the activity'} saved for {dayName(date)}.
      </Txt>
    </View>
  ) : null;
  const pair = (a: React.ReactNode, b: React.ReactNode) => <View style={{ flexDirection: 'row', gap: 12 }}>{a}{b}</View>;
  const stepsF = <NumberField label="Steps" decimals={0} value={form.steps} onChangeText={v => upF({ steps: v })} placeholder="0" error={errs.steps} />;
  const estHint = (() => { const st = numOrNull(form.steps); return st && st > 0 ? `Leave blank and we’ll estimate ≈ ${int(st * stepKcal(kg))} kcal from your steps.` : 'Leave blank and we’ll estimate it from your steps.'; })();

  let body: React.ReactNode = null;
  let footer: React.ReactNode = null;

  if (mode === 'health-connect') {
    const st = hs.status;
    const ready = st === 'available' && hasCorePermissions(hs.granted);
    if (st === 'checking') body = <View style={{ paddingVertical: 32, alignItems: 'center' }}><ActivityIndicator color={t.c.brand} /></View>;
    else if (st === 'unsupported') {
      body = (
        <View style={{ gap: 16 }}>
          <View style={{ alignItems: 'center', gap: 10, paddingVertical: 8 }}>
            <IconBubble name="phone" tone="teal" size={56} />
            <Txt variant="title" center>Samsung Health sync needs the Android app</Txt>
          </View>
          <Notice tone="brand" icon="info">{HEALTH_UNSUPPORTED_TEXT}</Notice>
          <Txt variant="sm" color="muted">Samsung Health syncs into Health Connect. On other devices, import a screenshot or your data export.</Txt>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Button label="Screenshot" icon="camera" variant="tonal" block onPress={() => setMode(ai ? 'screenshot' : 'manual')} /></View>
            <View style={{ flex: 1 }}><Button label="Data export" icon="upload" variant="secondary" block onPress={() => setMode('export')} /></View>
          </View>
        </View>
      );
    } else if (st === 'not-installed' || st === 'needs-update') {
      body = (
        <View style={{ gap: 16 }}>
          <Notice tone="amber" icon="alert" title={st === 'not-installed' ? 'Health Connect isn’t installed' : 'Health Connect needs an update'}>
            Samsung Health shares your steps and workouts through Health Connect. {st === 'not-installed' ? 'Install it from the Play Store,' : 'Update it in the Play Store,'} then come back here.
          </Notice>
          <Button label="Open Play Store" icon="download" variant="tonal" block onPress={() => { Linking.openURL(HC_PLAY).catch(() => {}); }} />
          <Button label="Check again" icon="sync" variant="ghost" onPress={() => { refreshHealthStatus().catch(() => {}); }} />
        </View>
      );
    } else if (!ready) {
      body = (
        <View style={{ gap: 18 }}>
          <View style={{ alignItems: 'center', gap: 10, paddingTop: 8 }}>
            <IconBubble name="phone" tone="teal" size={64} />
            <Txt variant="h2" center>Connect Samsung Health</Txt>
            <Txt variant="body" color="ink2" center>Samsung Health syncs into Health Connect. Allow access once and Momentum keeps your activity up to date each time you open it.</Txt>
          </View>
          <Steps items={[
            'In Samsung Health, open Settings, then Health Connect, and turn sync on.',
            'Tap Connect below and allow Steps, Active calories, Exercise and Distance.',
            'Your watch workouts are listed but never counted twice: their calories are already in your active calories.',
          ]} />
          <Txt variant="sm" color="muted">We only read. Nothing is written back to Samsung Health.</Txt>
        </View>
      );
      footer = <View style={{ flex: 1 }}><Button label="Connect Samsung Health" icon="sync" block loading={hcBusy} onPress={connect} /></View>;
    } else {
      body = (
        <View style={{ gap: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: t.radius.md, backgroundColor: t.c.tealTint }}>
            <IconBubble name="check" tone="teal" size={44} solid />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Txt variant="bodyStrong">Samsung Health is connected</Txt>
              <Txt variant="sm" color="ink2">{syncedLabel(hs.lastSync, fmtTime, relDay)} · syncs when you open the app</Txt>
            </View>
          </View>
          <View style={{ gap: 8 }}>
            <Txt variant="sm" color="ink2" style={{ fontFamily: t.type.bodyStrong.fontFamily }}>How far back</Txt>
            <Segmented<'1' | '7' | '30'> value={hcRange} onChange={setHcRange} accessibilityLabel="How far back"
              options={[{ value: '1', label: 'Today' }, { value: '7', label: '7 days' }, { value: '30', label: '30 days' }]} />
          </View>
          <Txt variant="sm" color="muted">Steps, active calories, distance and workouts are read for each day. Days are replaced with Health Connect’s numbers; your food and weight are untouched.</Txt>
          {hs.error ? <Notice tone="amber" icon="alert">{hs.error}</Notice> : null}
          <Button label="Manage permissions" icon="gear" variant="ghost" onPress={openHealthSettings} />
        </View>
      );
      footer = <View style={{ flex: 1 }}><Button label={hcBusy || hs.syncing ? 'Syncing…' : hcRange === '1' ? 'Sync today' : `Sync ${hcRange} days`} icon="sync" block loading={hcBusy || hs.syncing} onPress={syncNow} /></View>;
    }
  } else if (mode === 'screenshot') {
    if (!ai) {
      body = (
        <View style={{ gap: 16 }}>
          <Notice tone="brand" icon="info">{AI_UNAVAILABLE_TEXT}</Notice>
          <Button label="Type numbers in" icon="form" variant="tonal" onPress={() => setMode('manual')} />
        </View>
      );
    } else if (shotStage === 'pick') {
      body = (
        <View style={{ gap: 18 }}>
          <Pressable onPress={pickShot} disabled={preparing} accessibilityRole="button" accessibilityLabel="Choose a Samsung Health screenshot"
            style={({ pressed }) => [{ alignItems: 'center', gap: 10, paddingVertical: 28, paddingHorizontal: 20, borderRadius: t.radius.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.c.lineStrong, backgroundColor: t.c.surface2 }, pressed && { opacity: 0.7 }]}>
            {preparing ? <ActivityIndicator color={t.c.teal} /> : <IconBubble name="image" tone="teal" size={56} />}
            <Txt variant="title" center>Choose a Samsung Health screenshot</Txt>
            <Txt variant="sm" color="muted" center>The Today or Steps screen works best. We’ll read the date, steps, active calories, total burn, active time and distance.</Txt>
          </Pressable>
          <Steps items={['Open Samsung Health on your phone.', 'Screenshot the Today screen (or Steps).', 'Choose it here. Nothing is saved until you confirm.']} />
        </View>
      );
    } else if (shotStage === 'thinking') {
      body = (
        <View style={{ gap: 16 }}>
          {img ? <Image source={{ uri: img.uri }} style={{ width: '100%', height: 220, borderRadius: t.radius.lg, backgroundColor: t.c.surface2 }} contentFit="contain" accessibilityLabel="Your screenshot" /> : null}
          <Thinking title="Reading your screenshot…" />
        </View>
      );
      footer = <View style={{ flex: 1 }}><Button label="Cancel" variant="secondary" block onPress={() => { ctlRef.current?.abort(); ctlRef.current = null; setShotStage('pick'); }} /></View>;
    } else if (shotStage === 'error') {
      body = (
        <View style={{ gap: 16 }}>
          <Notice tone="amber" icon="alert">{shotErr || 'That screenshot couldn’t be read. Try another one.'}</Notice>
          <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
            <Button label="Try again" icon="sync" variant="tonal" onPress={() => (img ? runShot(img) : setShotStage('pick'))} />
            <Button label="Choose another" icon="image" variant="secondary" onPress={pickShot} />
          </View>
          <Button label="Type numbers in instead" variant="ghost" onPress={() => setMode('manual')} />
        </View>
      );
    } else {
      body = (
        <View style={{ gap: 18 }}>
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
            {img ? <Image source={{ uri: img.uri }} style={{ width: 64, height: 96, borderRadius: 12, backgroundColor: t.c.surface2 }} contentFit="cover" accessibilityLabel="Your screenshot" /> : null}
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Txt variant="title">Read from your screenshot</Txt>
              <Txt variant="sm" color="muted">Check each value before saving.</Txt>
              <Pressable onPress={pickShot} accessibilityRole="button" accessibilityLabel="Replace screenshot" style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}>
                <Icon name="image" size="sm" color={t.c.brand} />
                <Txt variant="sm" color={t.c.brand} style={{ fontFamily: t.type.bodyStrong.fontFamily }}>Replace screenshot</Txt>
              </Pressable>
            </View>
          </View>
          {confidence === 'low' ? <Notice tone="amber" icon="alert">Some numbers were hard to read. Please double-check them.</Notice> : null}
          <DateStepper label="Date" value={date} onChange={changeDate} />
          {pair(stepsF, <NumberField label="Active calories" decimals={0} value={form.activeKcal} onChangeText={v => upF({ activeKcal: v })} placeholder="0" suffix="kcal" error={errs.activeKcal} />)}
          {pair(<NumberField label="Total burned" optional decimals={0} value={form.totalKcal} onChangeText={v => upF({ totalKcal: v })} placeholder="0" suffix="kcal" />,
            <NumberField label="Active time" optional decimals={0} value={form.activeMinutes} onChangeText={v => upF({ activeMinutes: v })} placeholder="0" suffix="min" />)}
          <NumberField label="Distance" optional value={form.distance} onChangeText={v => upF({ distance: v })} placeholder="0.0" suffix={u.distUnit()} />
          <Txt variant="sm" color="muted">We use active calories (not the total), because your resting burn is already counted from your profile.</Txt>
          {existingNote}
        </View>
      );
      footer = <View style={{ flex: 1 }}><Button label={date === today ? 'Save today’s activity' : 'Save activity'} block onPress={saveActivity} /></View>;
    }
  } else if (mode === 'export') {
    if (exp.busy) body = <Thinking title="Reading your files…" />;
    else if (!exp.result || !sel) {
      body = (
        <View style={{ gap: 18 }}>
          <Steps items={[
            'In Samsung Health, open Settings, then Download personal data, and download it.',
            'Find the folder it saved on your phone. It holds CSV files.',
            'Choose the step, activity summary and exercise CSV files here.',
          ]} />
          <Button label="Choose CSV files" icon="upload" variant="tonal" block onPress={pickExport} />
          <Txt variant="sm" color="muted">We read step_daily_trend, activity.day_summary and exercise files and ignore the rest. Nothing is saved until you confirm.</Txt>
        </View>
      );
    } else if (!sel.dayCount && !sel.workouts.length) {
      body = (
        <View style={{ gap: 16 }}>
          <Notice tone="amber" icon="alert">
            {Object.keys(exp.result.days).length || exp.result.workouts.length
              ? 'Nothing in that range. Try a longer range.'
              : `No steps or workouts were found in ${plural(exp.names.length, 'file')}. Choose the files named com.samsung.shealth.step_daily_trend…csv or …exercise…csv.`}
          </Notice>
          {Object.keys(exp.result.days).length || exp.result.workouts.length
            ? <Segmented<ExportRange> value={exp.range} onChange={r => setExp(e => ({ ...e, range: r }))} options={RANGES} accessibilityLabel="How far back" /> : null}
          <Button label="Choose other files" icon="upload" variant="tonal" onPress={pickExport} />
        </View>
      );
    } else {
      const range = sel.from && sel.to ? (sel.from === sel.to ? fmtDate(sel.from, true) : `${fmtDate(sel.from, true)} – ${fmtDate(sel.to, true)}`) : '–';
      const nc = sel.workouts.filter(w => !w.countedInSamsung).length;
      body = (
        <View style={{ gap: 18 }}>
          <View style={{ gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <Txt variant="display" num>{sel.dayCount}</Txt>
              <Txt variant="title" color="muted">{sel.dayCount === 1 ? 'day' : 'days'}</Txt>
            </View>
            <Txt variant="sm" color="muted">{range}</Txt>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <Stat label="Avg steps" value={sel.avgSteps != null ? int(sel.avgSteps) : '–'} />
            <Stat label="Avg active" value={sel.avgKcal != null ? int(sel.avgKcal) : '–'} unit={sel.avgKcal != null ? 'kcal' : undefined} />
            <Stat label="Workouts" value={int(sel.workouts.length)} />
            <Stat label="Files read" value={int(exp.result.files.steps + exp.result.files.summary + exp.result.files.exercise)} unit={`of ${exp.names.length}`} />
          </View>
          <View style={{ gap: 8 }}>
            <Txt variant="sm" color="ink2" style={{ fontFamily: t.type.bodyStrong.fontFamily }}>How far back</Txt>
            <Segmented<ExportRange> value={exp.range} onChange={r => setExp(e => ({ ...e, range: r }))} options={RANGES} accessibilityLabel="How far back" />
          </View>
          <Txt variant="sm" color="muted">
            Days you already have are updated with these numbers.{' '}
            {!sel.workouts.length ? '' : !nc ? 'Workouts are listed as already counted in Samsung Health, so they aren’t added twice.'
              : `${plural(nc, 'workout')} (like weights or swims) ${nc === 1 ? 'isn’t' : 'aren’t'} part of the step calories, so ${nc === 1 ? 'it adds' : 'they add'} to your burn. The rest are listed as already counted.`}
          </Txt>
          <Button label="Choose different files" icon="upload" variant="ghost" onPress={pickExport} />
        </View>
      );
      footer = <View style={{ flex: 1 }}><Button label={'Import ' + (sel.dayCount ? plural(sel.dayCount, 'day') : plural(sel.workouts.length, 'workout'))} block onPress={saveExport} /></View>;
    }
  } else {
    body = (
      <View style={{ gap: 18 }}>
        <DateStepper label="Date" value={date} onChange={changeDate} />
        {pair(stepsF, <NumberField label="Active calories" optional decimals={0} value={form.activeKcal} onChangeText={v => upF({ activeKcal: v })} placeholder="0" suffix="kcal" error={errs.activeKcal} />)}
        <Txt variant="sm" color="muted">{estHint}</Txt>
        {pair(<NumberField label="Distance" optional value={form.distance} onChangeText={v => upF({ distance: v })} placeholder="0.0" suffix={u.distUnit()} />,
          <NumberField label="Active time" optional decimals={0} value={form.activeMinutes} onChangeText={v => upF({ activeMinutes: v })} placeholder="0" suffix="min" />)}
      </View>
    );
    footer = (
      <View style={{ flex: 1, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        {day.activity ? <Button label="Clear day" variant="ghost" onPress={clearDay} /> : null}
        <View style={{ flex: 1 }}><Button label={date === today ? 'Save today’s activity' : 'Save activity'} block onPress={saveActivity} /></View>
      </View>
    );
  }

  return (
    <ModalSheetScreen title="Steps & active calories" sub="From Samsung Health or typed in" footer={footer}>
      <View style={{ gap: 20 }}>
        <Segmented<Mode> value={mode} onChange={switchMode} accessibilityLabel="How to import"
          options={[{ value: 'health-connect', label: 'Sync' }, { value: 'screenshot', label: 'Photo' }, { value: 'export', label: 'Export' }, { value: 'manual', label: 'Type in' }]} />
        {body}
      </View>
    </ModalSheetScreen>
  );
}
