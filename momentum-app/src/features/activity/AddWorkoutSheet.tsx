/* Add / edit workout sheet (route /add-workout?date=&mode=photo|camera|library|manual&id=).
   Photo: pick → resize → Storage upload in parallel with Claude (analyze workout_photo) → editable review (type, date,
   time, duration, distance, kcal, HR, "Already counted in Samsung Health") → save with photoPath.
   Form: type chips, duration, date/time, treadmill speed + incline (ACSM) or intensity (METs), kcal with live estimate,
   more details (distance, HR, note, counted toggle). Live "burn → burn" impact. Edit: same form + photo + delete/Undo. */
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import {
  Button, ChipGroup, DateStepper, Field, Icon, IconBubble, ModalSheetScreen, Notice, NumberField, Segmented, TextField, TimeField, Toggle, Txt, tap, toast,
} from '@/components';
import { AiError, aiAvailable, AI_UNAVAILABLE_TEXT, analyzeWorkoutPhoto, isFatal, type WorkoutAiResult } from '@/lib/ai';
import { isValidKey, keyOf, workoutType } from '@/lib/calc';
import { hhmm, int, parseNum, relDay, timeOn, todayKey } from '@/lib/format';
import { deletePhoto, ImageError, pickImage, prepareImage, savePhoto, usePhotoURL, type PreparedImage } from '@/lib/images';
import { store, useBalance, useCurrentKg, useProfile, useUnits } from '@/lib/store';
import type { WorkoutEntry } from '@/lib/types';
import { useTheme } from '@/theme';
import {
  INTENSITY, isTreadmill, joinNote, kcalPerMinFor, round1, speedUnitFor, splitNote, TM_DEFAULT, TYPE_OPTIONS, typeLabel, type Intensity,
} from './model';

const fin = (v: unknown): v is number => typeof v === 'number' && isFinite(v);
const numOrNull = (s: string) => { const v = parseNum(s); return fin(v) ? v : null; };
const str = (v: number | null | undefined, d = 0) => (fin(v) ? String(d ? round1(v) : Math.round(v)) : '');
type FakeAi = (img: unknown) => Promise<WorkoutAiResult>;
/** QA hook (web screenshots without Firebase): globalThis.__momentumWorkoutAiFake = async img => WorkoutAiResult */
const fakeAi = (): FakeAi | undefined => (globalThis as { __momentumWorkoutAiFake?: FakeAi }).__momentumWorkoutAiFake;
type Mode = 'photo' | 'form';
type Stage = 'pick' | 'thinking' | 'review' | 'error';

interface S {
  type: string; name: string; date: string; time: string; minutes: string; speed: string; incline: string; intensity: Intensity;
  kcal: string; estimated: boolean; distance: string; hr: string; note: string; counted: boolean; more: boolean;
  source: WorkoutEntry['source']; confidence: string | null;
}

function Impact({ date, add }: { date: string; add: number }) {
  const t = useTheme();
  const b = useBalance(date);
  const isT = date === todayKey();
  const burn = isT ? b.burnSoFar : b.burnExpected, def = isT ? b.deficitSoFar : b.deficitExpected;
  const row = (label: string, a: number) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 28 }}>
      <Txt variant="sm" color="ink2" style={{ flex: 1, minWidth: 0 }} numberOfLines={1}>{label}</Txt>
      <Txt variant="body" num color="ink2">
        {add !== 0 ? <>{int(a)} <Txt variant="body" color="muted">→</Txt> </> : null}
        <Txt variant="bodyStrong" num>{int(a + add)}</Txt><Txt variant="sm" color="muted"> kcal</Txt>
      </Txt>
    </View>
  );
  return (
    <View style={{ padding: 14, borderRadius: t.radius.md, backgroundColor: t.c.tealTint, gap: 4 }} accessibilityLiveRegion="polite">
      {row(isT ? 'Today’s burn' : relDay(date) === 'Yesterday' ? 'Burn yesterday' : 'Burn on ' + relDay(date), burn)}
      {row((def >= 0 ? 'Deficit' : 'Surplus') + (isT ? ' so far' : ''), def)}
    </View>
  );
}

function LinkBtn({ label, icon, onPress, pressed: on }: { label: string; icon: 'sparkle' | 'image' | 'plus' | 'down' | 'up'; onPress: () => void; pressed?: boolean }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: !!on }} hitSlop={4}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 4 }, pressed && { opacity: 0.6 }]}>
      <Icon name={icon} size="sm" color={t.c.brand} strokeWidth={2.2} />
      <Txt variant="sm" color={t.c.brand} style={{ fontFamily: t.type.bodyStrong.fontFamily }}>{label}</Txt>
    </Pressable>
  );
}

export function AddWorkoutSheet() {
  const t = useTheme();
  const u = useUnits();
  const profile = useProfile();
  const kgNow = useCurrentKg();
  const kg = fin(kgNow) ? kgNow : profile?.startKg || 80;
  const spU = speedUnitFor(u.unit);
  const params = useLocalSearchParams<{ date?: string; mode?: string; id?: string }>();
  const today = todayKey();
  const [existing] = useState<WorkoutEntry | null>(() => (params.id ? (store.findItem('workouts', params.id)?.item as WorkoutEntry) || null : null));
  const ai = aiAvailable() || !!fakeAi();
  const autoPick = !existing && ai ? (params.mode === 'camera' ? 'camera' : params.mode === 'library' ? 'library' : null) : null;
  const [mode, setMode] = useState<Mode>(() => (existing ? 'form' : !ai ? 'form' : params.mode === 'manual' || params.mode === 'form' ? 'form' : 'photo'));
  const [stage, setStage] = useState<Stage>('pick');
  const [err, setErr] = useState('');
  const [img, setImg] = useState<PreparedImage | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [kErr, setKErr] = useState<string | null>(null);
  const [mErr, setMErr] = useState<string | null>(null);
  const existingURL = usePhotoURL(existing?.photoPath);
  const [s, setS] = useState<S>(() => {
    const date = params.date && isValidKey(params.date) && params.date <= today ? params.date : today;
    const base: S = {
      type: 'treadmill_walk', name: '', date, time: date === today ? hhmm(Date.now()) : '18:00', minutes: '30', speed: '', incline: '', intensity: 'moderate',
      kcal: '', estimated: true, distance: '', hr: '', note: '', counted: false, more: false, source: 'manual', confidence: null,
    };
    if (existing) {
      const sp = splitNote(existing.note);
      Object.assign(base, {
        type: workoutType(existing.type).id, name: existing.name || '', date: keyOf(existing.t), time: hhmm(existing.t), minutes: str(existing.minutes),
        kcal: str(existing.kcal), estimated: false, distance: fin(existing.distanceKm) ? str(u.distTo(existing.distanceKm), 1) : '',
        hr: str(existing.avgHr), note: sp.note, counted: !!existing.countedInSamsung, source: existing.source,
        speed: sp.speed != null ? String(sp.speed) : '', incline: sp.incline != null ? String(sp.incline) : '',
      });
      base.more = !!(base.distance || base.hr || base.note || base.counted);
    }
    if (!base.speed && isTreadmill(base.type)) { const d = TM_DEFAULT[base.type][u.unit]; base.speed = String(d[0]); base.incline = String(d[1]); }
    return base;
  });
  const up = (p: Partial<S>) => setS(x => ({ ...x, ...p }));

  // refs for async work
  const ctlRef = useRef<AbortController | null>(null);
  const uploadRef = useRef<Promise<string | null> | null>(null);
  const committed = useRef(false);
  const mounted = useRef(true);
  const discardUpload = () => { const p = uploadRef.current; uploadRef.current = null; if (p) p.then(x => { if (x) deletePhoto(x); }).catch(() => {}); };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; ctlRef.current?.abort(); if (!committed.current) { const p = uploadRef.current; if (p) p.then(x => { if (x) deletePhoto(x); }).catch(() => {}); } };
  }, []);

  /* ---------- derived ---------- */
  const minutesN = numOrNull(s.minutes);
  const perMin = kcalPerMinFor({ type: s.type, speed: numOrNull(s.speed), incline: numOrNull(s.incline), intensity: s.intensity }, kg, spU);
  const est = minutesN && minutesN > 0 ? Math.round(perMin * minutesN) : null;
  const curKcal = s.estimated ? est : numOrNull(s.kcal);
  let prev = 0;
  if (existing && !existing.countedInSamsung && keyOf(existing.t) === s.date) prev = existing.kcal || 0;
  const add = (s.counted ? 0 : fin(curKcal) ? curKcal : 0) - prev;
  const kcalHelp = s.estimated && minutesN && minutesN > 0
    ? `≈ ${round1(perMin)} kcal/min × ${int(minutesN)} min, from your weight${isTreadmill(s.type) ? ', speed and incline' : ' and effort'}.`
    : fin(curKcal) ? 'From your machine or watch. Tap “Estimate for me” to calculate it instead.' : 'Copy it from your machine or watch, or tap “Estimate for me”.';
  const countedHelp = s.counted
    ? `We’ll list this workout but won’t add its ${fin(curKcal) ? int(curKcal) + ' ' : ''}kcal again, because Samsung Health already counted it in your active calories.`
    : 'Turn this on if your watch already synced this workout to Samsung Health, so it isn’t counted twice.';

  const setType = (id: string) => {
    tap('select');
    const p: Partial<S> = { type: id };
    if (isTreadmill(id) && (!s.speed || !isTreadmill(s.type) || id !== s.type)) { const d = TM_DEFAULT[id][u.unit]; p.speed = String(d[0]); p.incline = String(d[1]); }
    up(p);
  };

  /* ---------- AI photo ---------- */
  const run = async (image: PreparedImage) => {
    ctlRef.current?.abort();
    const ctl = new AbortController(); ctlRef.current = ctl;
    setStage('thinking'); setErr('');
    try {
      const fake = fakeAi();
      const r = fake ? await fake(image) : await analyzeWorkoutPhoto(image, { signal: ctl.signal });
      if (ctlRef.current !== ctl || !mounted.current) return;
      ctlRef.current = null;
      const st = r.start_time_iso ? Date.parse(r.start_time_iso) : NaN;
      const tOk = fin(st) && keyOf(st) <= today;
      const type = workoutType(r.type).id;
      const p: Partial<S> = {
        type, source: 'photo', confidence: r.confidence,
        date: tOk ? keyOf(st) : s.date, time: tOk ? hhmm(st) : s.time,
        minutes: fin(r.duration_min) ? str(r.duration_min) : s.minutes,
        distance: fin(r.distance_km) ? str(u.distTo(r.distance_km), 1) : '', hr: fin(r.avg_hr) ? str(r.avg_hr) : '',
        note: r.notes ? String(r.notes).slice(0, 200) : '',
      };
      if (fin(r.kcal)) { p.kcal = str(r.kcal); p.estimated = false; } else { p.estimated = true; }
      if (isTreadmill(type)) { const d = TM_DEFAULT[type][u.unit]; p.speed = String(d[0]); p.incline = String(d[1]); }
      up(p);
      setStage('review');
      tap('success');
      if (!fin(r.kcal) && !fin(r.duration_min)) toast('No calories were visible. Add them, or estimate from the duration.');
    } catch (e) {
      if (ctlRef.current !== ctl || !mounted.current) return;
      ctlRef.current = null;
      const er = e instanceof AiError ? e : new AiError('internal', undefined, e);
      if (er.code === 'cancelled') { setStage('pick'); return; }
      if (isFatal(er.code)) { setMode('form'); setStage('pick'); toast(er.message); return; }
      setErr(er.message); setStage('error'); tap('warning');
    }
  };
  const pick = async (source: 'camera' | 'library') => {
    try {
      const p = await pickImage(source);
      if (!p || !mounted.current) return;
      setPreparing(true);
      const prepared = await prepareImage(p);
      if (!mounted.current) return;
      setPreparing(false);
      setImg(prepared);
      discardUpload();
      uploadRef.current = savePhoto(prepared, s.date).catch(e => { console.warn('photo upload failed', e); return null; });
      run(prepared);
    } catch (e) {
      setPreparing(false);
      toast(e instanceof ImageError ? e.message : 'That photo couldn’t be opened. Try another one.', { tone: 'error' });
    }
  };
  useEffect(() => {
    if (!autoPick) return;
    const id = setTimeout(() => { pick(autoPick); }, 60);
    return () => clearTimeout(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const cancel = () => { ctlRef.current?.abort(); ctlRef.current = null; setStage('pick'); discardUpload(); setImg(null); };
  const switchMode = (m: Mode) => {
    if (m === mode) return;
    if (stage === 'thinking') { ctlRef.current?.abort(); ctlRef.current = null; setStage('pick'); }
    setMode(m);
  };

  /* ---------- save / delete ---------- */
  const awaitPhoto = async (): Promise<string | undefined> => {
    const p0 = uploadRef.current;
    if (!p0) return undefined;
    const p = await Promise.race([p0, new Promise<null>(r => setTimeout(() => r(null), 45_000))]);
    if (!p) toast('Saved without the photo: it couldn’t be uploaded.', { tone: 'error' });
    return p || undefined;
  };
  const save = async () => {
    if (saving) return;
    const k = curKcal;
    const mins = numOrNull(s.minutes);
    let bad = false;
    if (mins != null && (mins < 0 || mins > 1440)) { setMErr('Enter minutes between 0 and 1,440.'); bad = true; } else setMErr(null);
    if (!fin(k) || k < 0 || k > 10000) { setKErr('Enter the calories burned, or tap Estimate for me.'); bad = true; } else setKErr(null);
    if (bad) { tap('warning'); return; }
    setSaving(true);
    try {
      const dist = numOrNull(s.distance);
      const hr = numOrNull(s.hr);
      const photoPath = mode === 'photo' && img ? await awaitPhoto() : existing?.photoPath;
      const item: Partial<WorkoutEntry> = {
        type: s.type, name: s.name.trim() || typeLabel(s.type), minutes: mins && mins > 0 ? Math.round(mins) : 0, kcal: Math.round(k!),
        t: timeOn(s.date, s.time),
        distanceKm: dist && dist > 0 ? Math.round(u.distFrom(dist) * 100) / 100 : undefined,
        avgHr: hr && hr >= 30 && hr <= 250 ? Math.round(hr) : undefined,
        note: joinNote(s.type, numOrNull(s.speed), numOrNull(s.incline), s.note, spU) || undefined,
        source: mode === 'photo' && img ? 'photo' : existing ? existing.source : 'manual',
        countedInSamsung: s.counted,
        photoPath,
      };
      committed.current = true;
      if (existing) {
        store.updateItem('workouts', existing.id, item);
        tap('success');
        router.back();
        toast('Workout updated');
      } else {
        const saved = store.addItem('workouts', item);
        tap('success');
        router.back();
        toast(s.counted ? 'Workout saved. Its calories were already counted.' : `Workout added: +${int(saved.kcal)} kcal burned`,
          { action: { label: 'Undo', fn: () => { store.removeItem('workouts', saved.id); } } });
      }
    } catch (e) {
      console.warn(e);
      committed.current = false;
      toast('That couldn’t be saved. Check the numbers and try again.', { tone: 'error' });
      if (mounted.current) setSaving(false);
    }
  };
  const del = () => {
    if (!existing) return;
    const undo = store.removeItem('workouts', existing.id);
    tap('warning');
    router.back();
    toast('Workout deleted', undo ? { action: { label: 'Undo', fn: undo } } : {});
  };

  /* ---------- pieces ---------- */
  const countedToggle = (
    <View style={{ gap: 2 }}>
      <Toggle label="Already counted in Samsung Health" value={s.counted} onChange={v => up({ counted: v })} />
      <Txt variant="sm" color="muted">{countedHelp}</Txt>
    </View>
  );
  const kcalField = (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Txt variant="sm" color="ink2" style={{ fontFamily: t.type.bodyStrong.fontFamily }}>Calories burned</Txt>
        <LinkBtn label={s.estimated ? 'Estimated for you' : 'Estimate for me'} icon="sparkle" pressed={s.estimated}
          onPress={() => { up({ estimated: true }); setKErr(null); }} />
      </View>
      <NumberField decimals={0} value={s.estimated ? str(est) : s.kcal} placeholder="0" suffix="kcal" accessibilityLabel="Calories burned"
        onChangeText={v => { up({ kcal: v, estimated: false }); setKErr(null); }} error={kErr} hint={kcalHelp} />
    </View>
  );
  const typeChips = (
    <View style={{ gap: 8 }}>
      <Txt variant="sm" color="ink2" style={{ fontFamily: t.type.bodyStrong.fontFamily }}>Workout type</Txt>
      <ChipGroup options={TYPE_OPTIONS} value={s.type} onChange={setType} accessibilityLabel="Workout type" />
    </View>
  );
  const whenFields = (
    <>
      <DateStepper label="Date" value={s.date} onChange={d => up({ date: d })} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <NumberField label="Duration" decimals={0} value={s.minutes} onChangeText={v => { up({ minutes: v }); setMErr(null); }} placeholder="30" suffix="min" error={mErr} />
        <TimeField label="Time" value={s.time} onChange={v => up({ time: v })} />
      </View>
    </>
  );
  const effort = isTreadmill(s.type) ? (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <NumberField label="Speed" value={s.speed} onChangeText={v => up({ speed: v })} suffix={spU} />
      <NumberField label="Incline" value={s.incline} onChangeText={v => up({ incline: v })} suffix="%" />
    </View>
  ) : (
    <Field label="Intensity">
      <Segmented<Intensity> value={s.intensity} onChange={v => up({ intensity: v })} accessibilityLabel="Intensity"
        options={(Object.keys(INTENSITY) as Intensity[]).map(v => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))} />
    </Field>
  );
  const moreFields = (
    <>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <NumberField label="Distance" optional value={s.distance} onChangeText={v => up({ distance: v })} placeholder="0.0" suffix={u.distUnit()} />
        <NumberField label="Avg heart rate" optional decimals={0} value={s.hr} onChangeText={v => up({ hr: v })} placeholder="0" suffix="bpm" />
      </View>
      <TextField label="Note" optional value={s.note} onChangeText={v => up({ note: v })} placeholder="How did it feel?" maxLength={200} />
    </>
  );
  const photoBox = (uri: string, h = 180) => (
    <View style={{ borderRadius: t.radius.lg, overflow: 'hidden', backgroundColor: t.c.surface2 }}>
      <Image source={{ uri }} style={{ width: '100%', height: h }} contentFit="cover" transition={150} cachePolicy="memory-disk" accessibilityLabel="Your workout photo" />
    </View>
  );

  /* ---------- body ---------- */
  let body: React.ReactNode;
  let footer: React.ReactNode = null;
  const cta = existing ? 'Save changes' : s.counted || !(fin(curKcal) && curKcal > 0) ? 'Save workout' : `Add ${int(curKcal)} kcal workout`;
  const saveBtn = <View style={{ flex: 1 }}><Button label={cta} block loading={saving} onPress={save} /></View>;

  if (mode === 'photo' && stage === 'pick') {
    body = (
      <View style={{ gap: 16 }}>
        <Pressable onPress={() => pick('camera')} disabled={preparing} accessibilityRole="button" accessibilityLabel="Take a photo of your workout summary"
          style={({ pressed }) => [{ alignItems: 'center', gap: 10, paddingVertical: 32, paddingHorizontal: 20, borderRadius: t.radius.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.c.lineStrong, backgroundColor: t.c.surface2 }, pressed && { opacity: 0.7 }]}>
          {preparing ? <ActivityIndicator color={t.c.brand} /> : <IconBubble name="camera" tone="brand" size={56} />}
          <Txt variant="title" center>Take a photo</Txt>
          <Txt variant="sm" color="muted" center>Your watch, phone app or treadmill summary. We’ll read the calories, time and other stats.</Txt>
        </Pressable>
        <Button label="Choose from library" icon="image" variant="secondary" block disabled={preparing} onPress={() => pick('library')} />
        <Txt variant="sm" color="muted" center>Nothing is saved until you check the numbers and confirm.</Txt>
      </View>
    );
  } else if (mode === 'photo' && stage === 'thinking') {
    body = (
      <View style={{ gap: 16 }} accessibilityLiveRegion="polite">
        {img ? photoBox(img.uri) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: t.radius.md, backgroundColor: t.c.brandTint }}>
          <ActivityIndicator color={t.c.brand} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Txt variant="bodyStrong">Reading your photo…</Txt>
            <Txt variant="sm" color="muted">This usually takes 5–30 seconds.</Txt>
          </View>
        </View>
      </View>
    );
    footer = <View style={{ flex: 1 }}><Button label="Cancel" variant="secondary" block onPress={cancel} /></View>;
  } else if (mode === 'photo' && stage === 'error') {
    body = (
      <View style={{ gap: 16 }}>
        {img ? photoBox(img.uri, 140) : null}
        <Notice tone="amber" icon="alert">{err || 'That photo couldn’t be read. Try another one.'}</Notice>
        <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
          <Button label="Try again" icon="sync" variant="tonal" onPress={() => (img ? run(img) : setStage('pick'))} />
          <Button label="Fill in the form" variant="ghost" onPress={() => setMode('form')} />
        </View>
      </View>
    );
  } else if (mode === 'photo' && stage === 'review') {
    body = (
      <View style={{ gap: 18 }}>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          {img ? <Image source={{ uri: img.uri }} style={{ width: 72, height: 72, borderRadius: 16, backgroundColor: t.c.surface2 }} contentFit="cover" accessibilityLabel="Your workout photo" /> : null}
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Txt variant="title">Read from your photo</Txt>
            <Txt variant="sm" color="muted">Check each value. Tap any field to fix it.</Txt>
            <View style={{ alignSelf: 'flex-start' }}><LinkBtn label="Replace photo" icon="image" onPress={() => { discardUpload(); setImg(null); setStage('pick'); }} /></View>
          </View>
        </View>
        {s.confidence === 'low' ? <Notice tone="amber" icon="alert">Some numbers were hard to read. Please double-check them.</Notice> : null}
        {typeChips}
        {whenFields}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <NumberField label="Distance" optional value={s.distance} onChangeText={v => up({ distance: v })} placeholder="0.0" suffix={u.distUnit()} />
          <NumberField label="Avg heart rate" optional decimals={0} value={s.hr} onChangeText={v => up({ hr: v })} placeholder="0" suffix="bpm" />
        </View>
        {kcalField}
        {countedToggle}
        <Impact date={s.date} add={add} />
      </View>
    );
    footer = saveBtn;
  } else {
    // form (add or edit)
    const photoUri = existingURL || null;
    body = (
      <View style={{ gap: 18 }}>
        {existing && existing.photoPath ? (photoUri ? photoBox(photoUri, 160)
          : <View style={{ height: 160, borderRadius: t.radius.lg, backgroundColor: t.c.surface2, alignItems: 'center', justifyContent: 'center' }}><Icon name="image" size="lg" color={t.c.muted} /></View>) : null}
        {existing && (existing.source === 'health-connect' || existing.source === 'samsung-export')
          ? <Notice tone="teal" icon="phone">This workout came from Samsung Health. Its calories are already in your active calories, so they’re listed but not added twice.</Notice> : null}
        {typeChips}
        {whenFields}
        {effort}
        {kcalField}
        <Pressable onPress={() => up({ more: !s.more })} accessibilityRole="button" accessibilityState={{ expanded: s.more }} accessibilityLabel="More details"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
          <Txt variant="bodyStrong" style={{ flex: 1 }}>More details <Txt variant="sm" color="muted">(optional)</Txt></Txt>
          <Icon name={s.more ? 'up' : 'down'} size="sm" color={t.c.muted} />
        </Pressable>
        {s.more ? <View style={{ gap: 16 }}>{moreFields}{countedToggle}</View> : null}
        <Impact date={s.date} add={add} />
      </View>
    );
    footer = existing ? (
      <View style={{ flex: 1, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <Button label="Delete" icon="trash" variant="ghost" onPress={del} accessibilityLabel="Delete workout" />
        {saveBtn}
      </View>
    ) : saveBtn;
  }

  const tabs = existing ? null : ai ? (
    <Segmented<Mode> size="lg" value={mode} onChange={switchMode} accessibilityLabel="How to add"
      options={[{ value: 'photo', label: 'Photo', icon: 'camera' }, { value: 'form', label: 'Form', icon: 'form' }]} />
  ) : <Notice tone="brand" icon="info">{AI_UNAVAILABLE_TEXT + ' Use the form instead.'}</Notice>;

  return (
    <ModalSheetScreen title={existing ? 'Edit workout' : 'Add a workout'} sub={existing ? relDay(keyOf(existing.t)) : undefined} footer={footer}>
      <View style={{ gap: 20 }}>
        {tabs}
        {body}
      </View>
    </ModalSheetScreen>
  );
}
