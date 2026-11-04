/* PROFILE — body stats (live resting burn), goal → /plan, Samsung Health → /health-import, account (anonymous → email link),
   preferences (units, theme, step goal), data (CSV export / import, reset, sign out). Stack route with a native header. */
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Button, Card, CardHeader, confirm, Field, Icon, IconBubble, IconButton, ListRow, Notice, NumberField, Screen, Segmented, tap, TextField, toast, Txt, type IconName, type Tone } from '@/components';
import * as C from '@/lib/calc';
import { parseAppCSV, pickTextFiles, shareTextFile, toAppCSV } from '@/lib/csv';
import { authErrorMessage, ensureSignedIn, firebaseEnabled, linkEmail, signInEmail, signOut } from '@/lib/firebase';
import { clamp, fmtDate, fmtTime, int, isValidKey, keyOf, makeUnits, parseNum, plural, relDay, todayKey } from '@/lib/format';
import { healthSupported } from '@/lib/health';
import { seedDemoData } from '@/lib/seed';
import { derived, store, useAnalysis, useCurrentKg, usePlan, useProfile, useStore, useUnits, useVersion } from '@/lib/store';
import type { Profile, Sex, ThemePref, Unit } from '@/lib/types';
import { useTheme } from '@/theme';
import { FormRow } from '@/features/onboarding/FormRow';

const YEAR = () => new Date().getFullYear();

/* ---------------- helpers ---------------- */
interface BodyDraft { name: string; sex: Sex; age: string; ft: string; inch: string; cm: string }
function draftFrom(p: Partial<Profile>, unit: Unit): BodyDraft {
  const fi = makeUnits(unit).cmToFtIn(p.heightCm || 170);
  return { name: p.name || '', sex: p.sex || 'male', age: String(C.age(p.birthYear) || ''), ft: String(fi.ft), inch: String(fi.inch), cm: String(Math.round(p.heightCm || 170)) };
}
function draftHeight(d: BodyDraft, unit: Unit) {
  if (unit === 'lb') { const f = parseNum(d.ft), i = parseNum(d.inch); return isFinite(f) ? makeUnits('lb').ftInToCm(f, isFinite(i) ? i : 0) : NaN; }
  return parseNum(d.cm);
}
/** switch units without re-celebrating milestones (their ids are unit-specific) */
function setUnit(v: Unit) {
  const S = store.getState();
  const p = S.profile;
  const celebrated = (p?.celebrated || []).slice();
  try {
    const a = C.weightAnalysis({ ...(p || {}), unit: v }, S.days, Date.now());
    C.newlyCrossed(a.milestones, celebrated).forEach(m => celebrated.push(m.id));
  } catch (e) { console.warn(e); }
  store.setProfile({ unit: v, celebrated });
}
function lastImport() {
  const keys = store.dayKeys().slice().reverse();
  for (const k of keys) { const a = store.getDay(k).activity; if (a) return { key: k, a }; }
  return null;
}

/* ---------------- pieces ---------------- */
function GroupTitle({ children }: { children: string }) {
  return <Txt variant="over" color="muted" accessibilityRole="header" style={{ paddingHorizontal: 4 }}>{children}</Txt>;
}
function ActionRow({ icon, tone = 'neutral', title, sub, onPress, danger, disabled, divider }: { icon: IconName; tone?: Tone; title: string; sub?: string; onPress: () => void; danger?: boolean; disabled?: boolean; divider?: boolean }) {
  return (
    <View style={{ opacity: disabled ? 0.45 : 1 }} pointerEvents={disabled ? 'none' : 'auto'}>
      <ListRow title={title} sub={sub} left={<IconBubble name={icon} tone={danger ? 'danger' : tone} size={40} />} chevron={!danger} onPress={onPress} divider={divider} />
    </View>
  );
}

function BodyCard({ p }: { p: Profile }) {
  const t = useTheme();
  const U = useUnits();
  const kg = useCurrentKg();
  useVersion();
  const [edit, setEdit] = useState<BodyDraft | null>(null);
  const [errs, setErrs] = useState<{ age?: string; height?: string }>({});
  const bmrNow = derived.bmr();
  const liveBmr = (() => {
    if (!edit) return bmrNow;
    const age = parseNum(edit.age), h = draftHeight(edit, U.unit);
    if (!(age >= 13 && age <= 100 && h >= 120 && h <= 230)) return null;
    return C.bmr(edit.sex, kg, h, age);
  })();
  const bmi = C.bmi(kg, p.heightCm);
  const cat = bmi != null ? C.bmiCategory(Math.round(bmi * 10) / 10) : null;
  const save = () => {
    if (!edit) return;
    const age = parseNum(edit.age), h = draftHeight(edit, U.unit);
    const e: typeof errs = {};
    if (!(age >= 13 && age <= 100)) e.age = 'Enter an age between 13 and 100.';
    if (!(h >= 120 && h <= 230)) e.height = 'Enter a height between 120 and 230 cm (3′11″–7′6″).';
    setErrs(e);
    if (Object.keys(e).length) { tap('warning'); return; }
    store.setProfile({ name: edit.name.trim(), sex: edit.sex, birthYear: YEAR() - Math.round(age), heightCm: Math.round(h * 10) / 10 });
    setEdit(null);
    tap('success');
    toast('Body stats saved. Resting burn is now ' + int(derived.bmr()) + ' kcal a day.');
  };
  const burnBox = (
    <View style={{ borderRadius: t.radius.md, backgroundColor: t.c.brandTint, padding: 16, gap: 6 }} accessibilityLiveRegion={edit ? 'polite' : 'none'}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <Txt variant="bodyStrong" color="brand">Resting burn</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
          <Txt variant="h2" num>{liveBmr != null ? int(liveBmr) : '–'}</Txt>
          <Txt variant="cap" color="muted">kcal/day</Txt>
        </View>
      </View>
      <Txt variant="sm" color="ink2" style={t.font(400)}>Calories your body burns at rest, calculated from your height, weight, age and sex. It’s added to your burn through the day.</Txt>
    </View>
  );
  if (!edit) {
    const tiles: [string, string, string][] = [
      ['Sex', p.sex === 'female' ? 'Female' : 'Male', ''],
      ['Age', String(C.age(p.birthYear) || '–'), 'years'],
      ['Height', U.height(p.heightCm), ''],
      ['Current weight', U.n(kg), U.unit],
    ];
    return (
      <Card>
        <CardHeader title="Body stats" sub="Used to work out your resting burn"
          action={<Button label="Edit" icon="edit" variant="secondary" size="sm" onPress={() => { setErrs({}); setEdit(draftFrom(p, U.unit)); }} accessibilityLabel="Edit body stats" />} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 12, columnGap: 12 }}>
          {tiles.map(x => (
            <View key={x[0]} style={{ flexBasis: '45%', flexGrow: 1, minWidth: 0, padding: 14, borderRadius: t.radius.md, backgroundColor: t.c.surface2, gap: 4 }}>
              <Txt variant="cap" color="muted">{x[0]}</Txt>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                <Txt variant="title" num style={t.font(700)} numberOfLines={1}>{x[1]}</Txt>
                {x[2] ? <Txt variant="cap" color="muted">{x[2]}</Txt> : null}
              </View>
            </View>
          ))}
        </View>
        {bmi != null && cat ? (
          <Pressable onPress={() => router.push('/bmi')} accessibilityRole="button" accessibilityLabel={'BMI ' + bmi.toFixed(1) + ', ' + cat.label + '. See BMI details'}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 14, borderRadius: t.radius.md, borderWidth: 1, borderColor: t.c.line, backgroundColor: pressed ? t.c.surface2 : 'transparent' })}>
            <Txt variant="sm" color="muted">BMI</Txt>
            <Txt variant="bodyStrong" num>{bmi.toFixed(1)}</Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 26, borderRadius: 13, backgroundColor: cat.key === 'healthy' ? t.c.tealTint : t.c.amberTint }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: cat.key === 'healthy' ? t.c.teal : t.c.amber }} />
              <Txt variant="cap" color={cat.key === 'healthy' ? t.c.teal : t.c.amber} style={t.font(700)}>{cat.label}</Txt>
            </View>
            <View style={{ flex: 1 }} />
            <Icon name="chevron" size="sm" color={t.c.muted} />
          </Pressable>
        ) : null}
        {burnBox}
      </Card>
    );
  }
  const d = edit;
  const up = (patch: Partial<BodyDraft>) => setEdit({ ...d, ...patch });
  return (
    <Card gap={20}>
      <CardHeader title="Body stats" sub="Used to work out your resting burn" />
      <FormRow><TextField label="Name" optional value={d.name} onChangeText={v => up({ name: v })} maxLength={40} autoCapitalize="words" autoComplete="given-name" /></FormRow>
      <FormRow><Field label="Sex"><Segmented size="lg" accessibilityLabel="Sex" options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} value={d.sex} onChange={v => up({ sex: v as Sex })} /></Field></FormRow>
      <View style={{ maxWidth: 220, flexDirection: 'row' }}><NumberField label="Age" decimals={0} value={d.age} onChangeText={v => { up({ age: v }); setErrs(e => ({ ...e, age: undefined })); }} suffix="years" error={errs.age} /></View>
      {U.unit === 'lb' ? (
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0, flexDirection: 'row' }}><NumberField label="Height" decimals={0} value={d.ft} onChangeText={v => { up({ ft: v }); setErrs(e => ({ ...e, height: undefined })); }} suffix="ft" accessibilityLabel="Height, feet" /></View>
            <View style={{ flex: 1, minWidth: 0, flexDirection: 'row' }}><NumberField label=" " decimals={0} value={d.inch} onChangeText={v => { up({ inch: v }); setErrs(e => ({ ...e, height: undefined })); }} suffix="in" accessibilityLabel="Height, inches" /></View>
          </View>
          {errs.height ? <Txt variant="sm" color="danger">{errs.height}</Txt> : null}
        </View>
      ) : <FormRow><NumberField label="Height" decimals={0} value={d.cm} onChangeText={v => { up({ cm: v }); setErrs(e => ({ ...e, height: undefined })); }} suffix="cm" error={errs.height} /></FormRow>}
      {burnBox}
      <View style={{ flexDirection: 'row', gap: 12, justifyContent: 'flex-end' }}>
        <Button label="Cancel" variant="secondary" onPress={() => setEdit(null)} />
        <Button label="Save changes" onPress={save} />
      </View>
    </Card>
  );
}

function GoalCard({ p }: { p: Profile }) {
  const t = useTheme();
  const U = useUnits();
  const pl = usePlan();
  const title = 'Goal: ' + U.n(p.goalKg, U.unit === 'lb' ? 0 : 1) + ' ' + U.unit + (pl.targetDate && !pl.goalReached ? ' by ' + fmtDate(pl.targetDate, true) : '');
  const sub = pl.goalReached ? 'Goal reached. Set your next target.' : U.abs(pl.kgPerWeek) + ' ' + U.unit + ' a week · ' + int(pl.kcalPerDay) + ' kcal daily ' + (pl.dir < 0 ? 'deficit' : 'surplus');
  return (
    <Card onPress={() => router.push('/plan')} accessibilityLabel={title + '. ' + sub + '. Open your plan'} pad={16}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <IconBubble name="target" tone="brand" size={44} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Txt variant="bodyStrong">{title}</Txt>
          <Txt variant="sm" color="muted">{sub}</Txt>
        </View>
        <Icon name="chevron" size="sm" color={t.c.muted} />
      </View>
    </Card>
  );
}

function SamsungCard() {
  const t = useTheme();
  useVersion();
  const li = lastImport();
  const hc = healthSupported();
  const go = (mode: string) => router.push({ pathname: '/health-import', params: { mode, date: todayKey() } });
  let last: string;
  if (li) {
    const a = li.a, bits: string[] = [];
    if (isFinite(a.steps as number)) bits.push(int(a.steps) + ' steps');
    if (isFinite(a.activeKcal as number)) bits.push(int(a.activeKcal) + ' active kcal');
    const src = a.source === 'samsung-export' ? 'data export' : a.source === 'samsung-screenshot' ? 'screenshot' : a.source === 'health-connect' ? 'Health Connect' : 'entered by hand';
    last = 'Last update: ' + relDay(li.key) + (a.syncedAt && keyOf(a.syncedAt) === li.key ? ' ' + fmtTime(a.syncedAt) : '') + ' · ' + src + (bits.length ? '\n' + bits.join(' · ') : '');
  } else last = 'No steps imported yet. Your resting burn still counts every day.';
  const opts: { mode: string; icon: IconName; tone: Tone; title: string; sub: string }[] = [
    ...(hc ? [{ mode: 'health-connect', icon: 'sync' as IconName, tone: 'teal' as Tone, title: 'Sync with Health Connect', sub: 'Steps, calories and workouts from Samsung Health' }] : []),
    { mode: 'screenshot', icon: 'image', tone: 'brand', title: 'Import a screenshot', sub: 'AI reads your steps & calories' },
    { mode: 'export', icon: 'upload', tone: 'teal', title: 'Import your data export', sub: 'CSV files from “Download personal data”' },
    { mode: 'manual', icon: 'form', tone: 'neutral', title: 'Type in today’s numbers', sub: 'Steps and active calories' },
  ];
  return (
    <Card gap={12}>
      <View style={{ gap: 4 }}>
        <Txt variant="title" accessibilityRole="header">Samsung Health</Txt>
        <Txt variant="sm" color="ink2" style={t.font(400)}>{hc ? 'Samsung Health syncs into Health Connect, so Momentum can read your steps, calories and workouts.' : 'Samsung Health syncs into Health Connect on the Android app. Here, bring your numbers in one of these ways.'}</Txt>
      </View>
      <View style={{ marginHorizontal: -16 }}>
        {opts.map((o, i) => <ListRow key={o.mode} title={o.title} sub={o.sub} left={<IconBubble name={o.icon} tone={o.tone} size={40} />} chevron onPress={() => go(o.mode)} divider={i < opts.length - 1} />)}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 12, borderRadius: t.radius.sm, backgroundColor: li ? t.c.tealTint : t.c.surface2 }}>
        <Icon name={li ? 'check' : 'info'} size="sm" color={li ? t.c.teal : t.c.muted} />
        <Txt variant="sm" color={li ? 'ink' : 'muted'} style={{ flex: 1, minWidth: 0 }}>{last}</Txt>
      </View>
    </Card>
  );
}

function AccountCard() {
  const t = useTheme();
  const S = useStore();
  const [mode, setMode] = useState<'link' | 'signin'>('link');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const syncTxt = S.sync === 'cloud' ? 'Synced to the cloud' : S.sync === 'connecting' ? 'Connecting…' : S.sync === 'offline' ? 'Offline · changes sync when you reconnect' : S.sync === 'error' ? (S.syncError || 'Sync problem · retrying') : 'Saved on this device';
  if (!firebaseEnabled) {
    return (
      <Card gap={12}>
        <Txt variant="title" accessibilityRole="header">Account</Txt>
        <Notice tone="neutral" icon="phone" title="Demo mode">Cloud sync isn’t set up in this build, so everything is saved on this device only. Add your Firebase config to sync across devices.</Notice>
      </Card>
    );
  }
  const submit = async () => {
    setErr(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setErr('Enter a valid email address.'); return; }
    if (pw.length < 6) { setErr('Use at least 6 characters for your password.'); return; }
    if (mode === 'signin' && !(await confirm({ title: 'Sign in to another account?', body: 'This device will switch to that account’s data. Anything you entered here without an account stays on this device only.', ok: 'Sign in' }))) return;
    setBusy(true);
    try {
      if (mode === 'link') { await linkEmail(email, pw); toast('Account secured. Your data is backed up to ' + email.trim() + '.'); }
      else { await signInEmail(email, pw); toast('Signed in as ' + email.trim() + '.'); }
      tap('success'); setPw(''); setEmail('');
    } catch (e) { setErr(authErrorMessage(e)); tap('warning'); }
    finally { setBusy(false); }
  };
  if (!S.isAnonymous && S.email) {
    return (
      <Card gap={12}>
        <CardHeader title="Account" sub={'Signed in as ' + S.email} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="cloud" size="sm" color={S.sync === 'cloud' ? t.c.teal : t.c.muted} />
          <Txt variant="sm" color="muted" style={{ flex: 1, minWidth: 0 }}>{syncTxt}</Txt>
        </View>
      </Card>
    );
  }
  return (
    <Card gap={16}>
      <View style={{ gap: 4 }}>
        <Txt variant="title" accessibilityRole="header">{mode === 'link' ? 'Secure your account' : 'Sign in'}</Txt>
        <Txt variant="sm" color="ink2" style={t.font(400)}>{mode === 'link' ? 'You’re using Momentum without an account. Add an email and password to keep your data if you lose this phone, and to sign in on other devices.' : 'Use the email and password you secured your account with on another device.'}</Txt>
      </View>
      <FormRow><TextField label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" inputMode="email" textContentType="emailAddress" icon="profile" /></FormRow>
      <FormRow><TextField label="Password" value={pw} onChangeText={setPw} secureTextEntry autoCapitalize="none" autoComplete={mode === 'link' ? 'new-password' : 'current-password'} textContentType={mode === 'link' ? 'newPassword' : 'password'}
        hint={mode === 'link' ? 'At least 6 characters' : undefined} error={err} /></FormRow>
      <Button label={mode === 'link' ? 'Secure my account' : 'Sign in'} variant="tonal" icon={mode === 'link' ? 'check' : 'profile'} loading={busy} onPress={submit} block />
      <Pressable onPress={() => { setErr(null); setMode(mode === 'link' ? 'signin' : 'link'); }} accessibilityRole="button" style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Txt variant="sm" color="brand" style={t.font(700)}>{mode === 'link' ? 'Already have an account? Sign in' : 'New here? Secure this account instead'}</Txt>
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name={S.sync === 'cloud' ? 'cloud' : 'phone'} size="sm" color={t.c.muted} />
        <Txt variant="sm" color="muted" style={{ flex: 1, minWidth: 0 }}>{syncTxt}</Txt>
      </View>
    </Card>
  );
}

function PrefsCard({ p }: { p: Profile }) {
  const t = useTheme();
  const U = useUnits();
  const kg = useCurrentKg();
  const goal = p.stepGoal || 8000;
  const step = (dir: number) => { tap('select'); store.setProfile({ stepGoal: clamp(goal + 500 * dir, 2000, 30000) }); };
  return (
    <Card gap={20}>
      <FormRow><Field label="Units"><Segmented accessibilityLabel="Units" options={[{ value: 'lb', label: 'lb · ft/in' }, { value: 'kg', label: 'kg · cm' }]} value={U.unit} onChange={v => setUnit(v as Unit)} /></Field></FormRow>
      <FormRow><Field label="Theme"><Segmented accessibilityLabel="Theme" options={[{ value: 'system', label: 'System', icon: 'system' }, { value: 'light', label: 'Light', icon: 'sun' }, { value: 'dark', label: 'Dark', icon: 'moon' }]} value={(p.theme || 'system') as ThemePref} onChange={v => store.setProfile({ theme: v as ThemePref })} /></Field></FormRow>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Txt variant="bodyStrong">Daily step goal</Txt>
          <Txt variant="sm" color="muted">≈ {int(goal * C.stepKcal(kg))} active kcal</Txt>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} accessibilityLabel="Daily step goal">
          <IconButton icon="minus" filled accessibilityLabel="500 fewer steps" onPress={() => step(-1)} disabled={goal <= 2000} />
          <Txt variant="title" num style={[t.font(700), { minWidth: 64, textAlign: 'center' }]} accessibilityLiveRegion="polite">{int(goal)}</Txt>
          <IconButton icon="plus" filled accessibilityLabel="500 more steps" onPress={() => step(1)} disabled={goal >= 30000} />
        </View>
      </View>
    </Card>
  );
}

function DataCard() {
  const S = useStore();
  const U = useUnits();
  const n = store.allWeights().length + store.allFoods().length + store.allWorkouts().length;
  const signedIn = firebaseEnabled && !S.isAnonymous && !!S.email;
  const doExport = async () => {
    const name = 'momentum-' + todayKey() + '.csv';
    try { await shareTextFile(name, toAppCSV(store.getState().days)); toast('Export ready: ' + name); }
    catch (e) { toast((e as Error)?.message || 'Couldn’t export. Try again.', { tone: 'error' }); }
  };
  const doImport = async () => {
    try {
      const files = await pickTextFiles({ multiple: false });
      if (!files.length) return;
      const r = parseAppCSV(files[0].text, U.unit);
      const before = { w: store.allWeights().length, f: store.allFoods().length, k: store.allWorkouts().length };
      if (r.weights.length) store.addItemsBulk('weights', r.weights);
      if (r.foods.length) store.addItemsBulk('foods', r.foods);
      if (r.workouts.length) store.addItemsBulk('workouts', r.workouts);
      const act = Object.keys(r.activity).length ? store.setActivityBulk(r.activity, { merge: true }) : 0;
      const parts: string[] = [];
      const dw = store.allWeights().length - before.w, df = store.allFoods().length - before.f, dk = store.allWorkouts().length - before.k;
      if (dw) parts.push(plural(dw, 'weigh-in'));
      if (df) parts.push(plural(df, 'food'));
      if (dk) parts.push(plural(dk, 'workout'));
      if (act) parts.push(plural(act, 'day') + ' of activity');
      if (parts.length) tap('success');
      toast(parts.length ? 'Imported ' + parts.join(', ') + '.' : r.skipped && !r.weights.length && !r.foods.length ? 'That file doesn’t look like a Momentum or weight CSV.' : 'Nothing new to import — those entries are already here.');
    } catch (e) { console.warn(e); toast('That file couldn’t be read as CSV.', { tone: 'error' }); }
  };
  const doReset = async () => {
    const ok = await confirm({ title: 'Reset all data?', body: 'This permanently deletes your profile, weigh-ins, food, workouts and activity' + (S.sync === 'cloud' ? ' on every device' : '') + '. Export a CSV first if you want a copy.', ok: 'Delete everything', cancel: 'Keep my data', danger: true });
    if (!ok) return;
    tap('warning');
    await store.resetAll();
    toast('All data deleted. Let’s start fresh.');
  };
  const doSignOut = async () => {
    const ok = await confirm({ title: 'Sign out?', body: 'Your data stays in your account. Sign in again with ' + S.email + ' to get it back.', ok: 'Sign out' });
    if (!ok) return;
    try { await signOut(); await ensureSignedIn(); toast('Signed out.'); } catch (e) { toast(authErrorMessage(e), { tone: 'error' }); }
  };
  return (
    <Card pad={4} gap={0}>
      <ActionRow icon="download" tone="brand" title="Export CSV" sub={n ? plural(n, 'entry', 'entries') + ' · weights, food, workouts, activity' : 'Nothing to export yet'} onPress={doExport} disabled={!n} divider />
      <ActionRow icon="upload" tone="teal" title="Import CSV" sub="From a Momentum export, or a simple date + weight file" onPress={doImport} divider />
      {signedIn ? <ActionRow icon="back" title="Sign out" sub={S.email || undefined} onPress={doSignOut} divider /> : null}
      <ActionRow icon="trash" title="Reset all data" sub="Deletes everything and starts over" onPress={doReset} danger />
    </Card>
  );
}

/* ---------------- screen ---------------- */
export function ProfileScreen() {
  const t = useTheme();
  const p = useProfile();
  const a = useAnalysis();
  if (!p) return <Screen safeTop={false}><Txt color="muted">No profile yet.</Txt></Screen>;
  const name = (p.name || '').trim();
  const since = isValidKey(p.startDate) ? 'Since ' + fmtDate(p.startDate, true) : '';
  const streak = a.streak >= 2 ? a.streak + '-day logging streak' : '';
  return (
    <Screen safeTop={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingTop: 4 }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: t.c.brand, alignItems: 'center', justifyContent: 'center' }}>
          <Txt variant="h1" color={t.c.onBrand}>{(name[0] || 'M').toUpperCase()}</Txt>
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Txt variant="h1" numberOfLines={1} accessibilityRole="header">{name || 'Your profile'}</Txt>
          <Txt variant="sm" color="muted">{[streak, since].filter(Boolean).join(' · ') || 'Body stats, goal and settings'}</Txt>
        </View>
      </View>
      <View style={{ gap: 16 }}>
        <BodyCard p={p} />
        <GoalCard p={p} />
      </View>
      <SamsungCard />
      <AccountCard />
      <View style={{ gap: 12 }}><GroupTitle>Preferences</GroupTitle><PrefsCard p={p} /></View>
      <View style={{ gap: 12 }}><GroupTitle>Your data</GroupTitle><DataCard /></View>
      {__DEV__ ? (
        <View style={{ gap: 12 }}>
          <GroupTitle>Developer</GroupTitle>
          <Card pad={4} gap={0}>
            <ActionRow icon="sparkle" tone="brand" title="Load sample data" sub="13 weeks of test data (replaces your profile)" onPress={() => { seedDemoData(); toast('Sample data loaded.'); }} />
          </Card>
        </View>
      ) : null}
    </Screen>
  );
}
