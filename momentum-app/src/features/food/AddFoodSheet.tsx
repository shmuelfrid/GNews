/* Add food sheet (route /add-food?date=&meal=&mode=camera|library|photo|text|manual&id=).
   Photo: pick → preview → Storage upload in parallel with Claude (analyze food_photo) → editable review → save with photoPath.
   Describe: Claude (food_text) → same review. Manual: name + kcal + optional macros + optional photo.
   id: edit an existing entry (portion scaling, macros, meal, time) or delete with Undo. */
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import {
  Button, ChipGroup, Icon, IconBubble, IconButton, ModalSheetScreen, Notice, NumberField, Segmented, TextField, TimeField, Txt, tap, toast,
} from '@/components';
import { AiError, aiAvailable, AI_UNAVAILABLE_TEXT, analyzeFoodPhoto, analyzeFoodText, isFatal, type FoodAiResult } from '@/lib/ai';
import { isValidKey, keyOf } from '@/lib/calc';
import { fmtTime, hhmm, int, mealForTime, parseNum, relDay, timeOn, todayKey, uid } from '@/lib/format';
import { deletePhoto, ImageError, pickImage, prepareImage, savePhoto, usePhotoURL, type PreparedImage } from '@/lib/images';
import { store } from '@/lib/store';
import type { FoodEntry, Meal } from '@/lib/types';
import { useTheme } from '@/theme';
import { defaultT } from './FoodScreen';
import {
  atMinFactor, bake, fmtQty, isMeal, itemTotals, MEAL_IDS, MEAL_LABEL, nextFactor, reviewTotal, scaledPortion, withKcal, type ReviewItem,
} from './portion';

const fin = (v: unknown): v is number => typeof v === 'number' && isFinite(v);
const MEAL_OPTS = MEAL_IDS.map(m => ({ value: m, label: MEAL_LABEL[m] }));
/** QA hook (web screenshots without Firebase): set globalThis.__momentumFoodAiFake = async (kind, input) => FoodAiResult */
type FakeAi = (kind: 'photo' | 'text', input: unknown) => Promise<FoodAiResult>;
const fakeAi = (): FakeAi | undefined => (globalThis as { __momentumFoodAiFake?: FakeAi }).__momentumFoodAiFake;
type Mode = 'photo' | 'describe' | 'manual';
type Phase = 'input' | 'busy' | 'review' | 'error';
interface Review { source: 'photo' | 'text'; name: string; confidence: string; note: string; items: ReviewItem[]; removed: { item: ReviewItem; at: number }[] }
interface EditDraft { name: string; portion: string; kcal: string; origPortion: string }

function MealPicker({ value, onChange }: { value: Meal; onChange: (m: Meal) => void }) {
  const t = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Txt variant="sm" color="ink2" style={{ fontFamily: t.type.bodyStrong.fontFamily }}>Add to</Txt>
      <ChipGroup options={MEAL_OPTS} value={value} onChange={onChange} accessibilityLabel="Meal" />
    </View>
  );
}
function LinkBtn({ label, icon, onPress }: { label: string; icon: 'plus' | 'sync' | 'image' | 'close'; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={4}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, alignSelf: 'flex-start', paddingRight: 8 }, pressed && { opacity: 0.6 }]}>
      <Icon name={icon} size="sm" color={t.c.brand} strokeWidth={2.2} />
      <Txt variant="bodyStrong" color={t.c.brand}>{label}</Txt>
    </Pressable>
  );
}
function Preview({ uri, height = 200, scanning }: { uri: string; height?: number; scanning?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ borderRadius: t.radius.lg, overflow: 'hidden', backgroundColor: t.c.surface2 }}>
      <Image source={{ uri }} style={{ width: '100%', height }} contentFit="cover" transition={150} accessibilityLabel="Your photo" />
      {scanning ? <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, backgroundColor: t.c.scrim, opacity: 0.25 }} /> : null}
    </View>
  );
}

/* ================= ADD ================= */
function AddFood({ date, initialMeal, initialMode }: { date: string; initialMeal: Meal; initialMode: string | undefined }) {
  const t = useTheme();
  const ai = aiAvailable() || !!fakeAi();
  const autoPick = initialMode === 'camera' ? 'camera' : initialMode === 'library' ? 'library' : null;
  const [mode, setMode] = useState<Mode>(() => !ai ? 'manual' : initialMode === 'text' || initialMode === 'describe' ? 'describe' : initialMode === 'manual' ? 'manual' : 'photo');
  const [phase, setPhase] = useState<Phase>('input');
  const [meal, setMeal] = useState<Meal>(initialMeal);
  const [text, setText] = useState('');
  const [textErr, setTextErr] = useState<string | null>(null);
  const [img, setImg] = useState<PreparedImage | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft>({ name: '', portion: '', kcal: '', origPortion: '' });
  const [error, setError] = useState('');
  const [manual, setManual] = useState({ name: '', kcal: '', protein: '', carbs: '', fat: '' });
  const [mErr, setMErr] = useState<{ name?: string; kcal?: string }>({});
  const [saving, setSaving] = useState(false);
  const ctlRef = useRef<AbortController | null>(null);
  const uploadRef = useRef<Promise<string | null> | null>(null);
  const committed = useRef(false);
  const mounted = useRef(true);
  const imgRef = useRef<PreparedImage | null>(null);
  imgRef.current = img;

  const discardUpload = useCallback(() => {
    const up = uploadRef.current; uploadRef.current = null;
    if (up) up.then(p => { if (p) deletePhoto(p); }).catch(() => {});
  }, []);
  const abort = () => { ctlRef.current?.abort(); ctlRef.current = null; };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; ctlRef.current?.abort(); if (!committed.current) { const up = uploadRef.current; if (up) up.then(p => { if (p) deletePhoto(p); }).catch(() => {}); } };
  }, []);

  const startUpload = (p: PreparedImage) => {
    discardUpload();
    uploadRef.current = savePhoto(p, date).catch(e => { console.warn('photo upload failed', e); return null; });
  };

  /* ---------- AI ---------- */
  const toReview = (r: FoodAiResult, source: 'photo' | 'text'): Review => ({
    source, name: '', confidence: r.confidence, note: r.notes || '', removed: [],
    items: r.items.map(it => ({ key: uid(), name: it.name || 'Item', portion: it.portion || '', f: 1, base: { kcal: fin(it.kcal) ? it.kcal : 0, protein: it.protein_g, carbs: it.carbs_g, fat: it.fat_g } })),
  });
  const run = async (kind: 'photo' | 'text', image?: PreparedImage | null) => {
    abort();
    const ctl = new AbortController(); ctlRef.current = ctl;
    setPhase('busy'); setError(''); setEditKey(null);
    try {
      const fake = fakeAi();
      const r = fake ? await fake(kind, kind === 'photo' ? image : text)
        : kind === 'photo' ? await analyzeFoodPhoto(image!, { signal: ctl.signal }) : await analyzeFoodText(text, { signal: ctl.signal });
      if (ctlRef.current !== ctl || !mounted.current) return;
      ctlRef.current = null;
      setReview(toReview(r, kind)); setPhase('review');
      tap('success');
    } catch (e) {
      if (ctlRef.current !== ctl || !mounted.current) return;
      ctlRef.current = null;
      const err = e instanceof AiError ? e : new AiError('internal', undefined, e);
      if (err.code === 'cancelled') { setPhase('input'); return; }
      if (isFatal(err.code)) { setMode('manual'); setPhase('input'); toast(err.message); return; }
      setError(err.message); setPhase('error');
      tap('warning');
    }
  };
  const pick = async (source: 'camera' | 'library', forManual = false) => {
    try {
      const p = await pickImage(source);
      if (!p || !mounted.current) return;
      setPreparing(true);
      const prepared = await prepareImage(p);
      if (!mounted.current) return;
      setPreparing(false);
      setImg(prepared);
      startUpload(prepared);
      if (!forManual) run('photo', prepared);
    } catch (e) {
      setPreparing(false);
      toast(e instanceof ImageError ? e.message : 'That photo couldn’t be opened. Try another one.', { tone: 'error' });
    }
  };
  // Snap a photo / Choose photo from the Food tab open the picker straight away
  useEffect(() => {
    if (!autoPick || !ai) return;
    const id = setTimeout(() => { pick(autoPick); }, 60);
    return () => clearTimeout(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const switchMode = (m: Mode) => {
    if (m === mode && phase === 'input') return;
    abort(); setMode(m); setPhase('input'); setReview(null); setEditKey(null);
    if (m === 'describe') { discardUpload(); setImg(null); }
  };
  const cancel = () => { abort(); setPhase('input'); if (mode === 'photo') { discardUpload(); setImg(null); } };
  const startOver = () => { setPhase('input'); setReview(null); setEditKey(null); if (review?.source === 'photo') { discardUpload(); setImg(null); } };
  const estimate = () => {
    if (text.trim().length < 2) { setTextErr('Describe what you ate first.'); return; }
    setTextErr(null); run('text');
  };

  /* ---------- review editing ---------- */
  const updItems = (fn: (items: ReviewItem[]) => ReviewItem[], removed?: Review['removed']) =>
    setReview(r => (r ? { ...r, items: fn(r.items), removed: removed ?? r.removed } : r));
  const finishEdit = (): ReviewItem[] | null => {
    if (!review || !editKey) return review?.items ?? null;
    const items = review.items.map(it => {
      if (it.key !== editKey) return it;
      let x = bake(it);
      if (draft.portion.trim() && draft.portion.trim() !== draft.origPortion) x = { ...x, portion: draft.portion.trim() };
      x = { ...x, name: draft.name.trim() || 'Item' };
      const k = parseNum(draft.kcal);
      if (fin(k) && k >= 0) x = x.base.kcal > 0 ? withKcal(x, k) : { ...x, base: { ...x.base, kcal: k } };
      return x;
    });
    setReview({ ...review, items });
    setEditKey(null);
    return items;
  };
  const beginEdit = (it: ReviewItem) => {
    finishEdit();
    const p = scaledPortion(it.portion, it.f);
    setDraft({ name: it.name, portion: p, origPortion: p, kcal: String(itemTotals(it).kcal || '') });
    setEditKey(it.key);
  };
  const addItem = () => {
    finishEdit();
    const it: ReviewItem = { key: uid(), name: '', portion: '1 serving', f: 1, base: { kcal: 0, protein: null, carbs: null, fat: null } };
    setReview(r => (r ? { ...r, items: [...r.items, it] } : r));
    setDraft({ name: '', portion: '1 serving', origPortion: '1 serving', kcal: '' });
    setEditKey(it.key);
  };
  const removeItem = (i: number) => {
    if (!review) return;
    tap('light');
    const items = review.items.slice(); const [gone] = items.splice(i, 1);
    if (editKey === gone.key) setEditKey(null);
    setReview({ ...review, items, removed: [...review.removed, { item: gone, at: i }] });
  };
  const restore = () => {
    if (!review) return;
    const items = review.items.slice();
    review.removed.slice().reverse().forEach(g => items.splice(Math.min(g.at, items.length), 0, g.item));
    setReview({ ...review, items, removed: [] });
  };

  /* ---------- saving ---------- */
  const awaitPhoto = async (): Promise<string | undefined> => {
    const up = uploadRef.current;
    if (!up) return undefined;
    const p = await Promise.race([up, new Promise<null>(r => setTimeout(() => r(null), 45_000))]);
    if (!p) toast('Saved without the photo: it couldn’t be uploaded.', { tone: 'error' });
    return p || undefined;
  };
  const finish = (item: FoodEntry) => {
    committed.current = true;
    tap('success');
    router.back();
    toast(`Added ${int(item.kcal)} kcal to ${MEAL_LABEL[item.meal].toLowerCase()}`, { action: { label: 'Undo', fn: () => { store.removeItem('foods', item.id); } } });
  };
  const saveReview = async () => {
    const items0 = finishEdit();
    if (!review || !items0 || !items0.length || saving) return;
    setSaving(true);
    try {
      const tot = reviewTotal(items0);
      const items = items0.map(it => {
        const x = itemTotals(it);
        const o: FoodEntry['items'][number] = { name: String(it.name || 'Item').trim() || 'Item', portion: scaledPortion(it.portion, it.f), kcal: x.kcal };
        if (x.protein != null) o.protein = Math.round(x.protein * 10) / 10;
        if (x.carbs != null) o.carbs = Math.round(x.carbs * 10) / 10;
        if (x.fat != null) o.fat = Math.round(x.fat * 10) / 10;
        return o;
      });
      const name = review.name.trim() || (items.length === 1 ? items[0].name : items.slice(0, 2).map(i => i.name).join(' & ') + (items.length > 2 ? ` +${items.length - 2}` : ''));
      const photoPath = review.source === 'photo' ? await awaitPhoto() : undefined;
      const rec: Omit<FoodEntry, 'id'> = { t: defaultT(date, meal), meal, name, kcal: Math.round(tot.kcal), items, source: review.source };
      if (tot.hasMacros) { rec.protein = Math.round(tot.protein); rec.carbs = Math.round(tot.carbs); rec.fat = Math.round(tot.fat); }
      if (photoPath) rec.photoPath = photoPath;
      if (review.note) rec.note = review.note;
      finish(store.addItem('foods', rec));
    } catch (e) {
      console.warn(e);
      toast('That couldn’t be saved. Check the numbers and try again.', { tone: 'error' });
      if (mounted.current) setSaving(false);
    }
  };
  const saveManual = async () => {
    if (saving) return;
    const name = manual.name.trim();
    const kcal = parseNum(manual.kcal);
    const errs: typeof mErr = {};
    if (!name) errs.name = 'Give it a name, like “Turkey sandwich”.';
    if (!fin(kcal) || kcal < 0 || kcal > 10000) errs.kcal = 'Enter calories between 0 and 10,000.';
    setMErr(errs);
    if (errs.name || errs.kcal) { tap('warning'); return; }
    setSaving(true);
    try {
      const photoPath = img ? await awaitPhoto() : undefined;
      const rec: Omit<FoodEntry, 'id'> = { t: defaultT(date, meal), meal, name, kcal: Math.round(kcal), items: [], source: 'manual' };
      (['protein', 'carbs', 'fat'] as const).forEach(k => { const v = parseNum(manual[k]); if (fin(v) && v >= 0) rec[k] = v; });
      if (photoPath) rec.photoPath = photoPath;
      finish(store.addItem('foods', rec));
    } catch (e) {
      console.warn(e);
      toast('That couldn’t be saved. Check the numbers and try again.', { tone: 'error' });
      if (mounted.current) setSaving(false);
    }
  };

  /* ---------- views ---------- */
  const tabs = ai ? (
    <Segmented<Mode> size="lg" value={mode} onChange={switchMode} accessibilityLabel="How to add"
      options={[{ value: 'photo', label: 'Photo', icon: 'camera' }, { value: 'describe', label: 'Describe', icon: 'text' }, { value: 'manual', label: 'Manual', icon: 'form' }]} />
  ) : <Notice tone="brand" icon="info">{AI_UNAVAILABLE_TEXT + ' You can still add food by hand below.'}</Notice>;

  let body: React.ReactNode = null;
  let footer: React.ReactNode = null;

  if (phase === 'busy') {
    const isPhoto = mode === 'photo';
    body = (
      <View style={{ gap: 16 }} accessibilityLiveRegion="polite">
        {isPhoto && img ? <Preview uri={img.uri} scanning /> : null}
        {!isPhoto && text ? (
          <View style={{ borderLeftWidth: 3, borderLeftColor: t.c.brand, paddingLeft: 12, paddingVertical: 4 }}>
            <Txt variant="body" color="ink2" numberOfLines={5}>{text}</Txt>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: t.radius.md, backgroundColor: t.c.brandTint }}>
          <ActivityIndicator color={t.c.brand} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Txt variant="bodyStrong">{isPhoto ? 'Analysing your photo…' : 'Working out the calories…'}</Txt>
            <Txt variant="sm" color="muted">This usually takes 5–30 seconds.</Txt>
          </View>
        </View>
      </View>
    );
    footer = <View style={{ flex: 1 }}><Button label="Cancel" variant="secondary" block onPress={cancel} /></View>;
  } else if (phase === 'error') {
    body = (
      <View style={{ gap: 16 }}>
        {img && mode === 'photo' ? <Preview uri={img.uri} height={160} /> : null}
        <Notice tone="amber" icon="alert">{error || 'That didn’t work. Try again.'}</Notice>
        <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
          <Button label="Try again" icon="sync" variant="tonal" onPress={() => (mode === 'photo' && img ? run('photo', img) : mode === 'describe' ? run('text') : setPhase('input'))} />
          <Button label="Enter it manually" variant="ghost" onPress={() => { setMode('manual'); setPhase('input'); }} />
        </View>
      </View>
    );
  } else if (phase === 'review' && review) {
    const tot = reviewTotal(review.items);
    const low = review.confidence === 'low';
    const n = review.items.length;
    body = (
      <View style={{ gap: 18 }}>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          {review.source === 'photo' && img
            ? <Image source={{ uri: img.uri }} style={{ width: 72, height: 72, borderRadius: 16, backgroundColor: t.c.surface2 }} contentFit="cover" accessibilityLabel="Your photo" />
            : <IconBubble name={review.source === 'photo' ? 'camera' : 'text'} tone="brand" size={72} />}
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <Txt variant="title">{n ? (review.source === 'photo' ? 'Here’s what I see' : 'Here’s my estimate') : 'Nothing found'}</Txt>
            <TextInput value={review.name} onChangeText={s => setReview({ ...review, name: s })} placeholder="Name this meal (optional)" placeholderTextColor={t.c.muted}
              maxLength={160} accessibilityLabel="Meal name"
              style={[t.type.body, { color: t.c.ink, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: t.c.lineStrong, minHeight: 36 }, { outlineStyle: 'none' } as object]} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="alert" size="xs" color={low ? t.c.amber : t.c.muted} />
              <Txt variant="cap" color={low ? t.c.amber : 'muted'} style={{ flexShrink: 1 }}>{low ? 'Rough estimate. Check the portions.' : 'Estimates. Adjust the portions if needed.'}</Txt>
            </View>
          </View>
        </View>
        {review.note ? <Txt variant="sm" color="ink2">{review.note}</Txt> : null}
        {n ? (
          <View style={{ borderRadius: t.radius.md, borderWidth: 1, borderColor: t.c.line, overflow: 'hidden' }} accessibilityLabel="Detected items">
            {review.items.map((it, i) => (
              <ReviewRow key={it.key} it={it} first={i === 0} editing={editKey === it.key} draft={draft} setDraft={setDraft}
                onEdit={() => beginEdit(it)} onDone={finishEdit} onRemove={() => removeItem(i)}
                onStep={dir => { tap('select'); updItems(items => items.map(x => (x.key === it.key ? { ...x, f: nextFactor(x, dir) } : x))); }} />
            ))}
          </View>
        ) : review.removed.length ? (
          <Txt variant="body" color="muted">Everything was removed.</Txt>
        ) : (
          <Notice tone="neutral" icon="info">{`I couldn’t find any food here. Add the items yourself, or try another ${review.source === 'photo' ? 'photo' : 'description'}.`}</Notice>
        )}
        {review.removed.length ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 48, borderRadius: t.radius.sm, backgroundColor: t.c.surface2 }} accessibilityLiveRegion="polite">
            <Txt variant="sm" color="ink2" style={{ flex: 1, minWidth: 0 }} numberOfLines={1}>
              {review.removed.length === 1 ? `Removed ${review.removed[0].item.name || 'item'}` : `Removed ${review.removed.length} items`}
            </Txt>
            <Button label="Undo" size="sm" variant="ghost" onPress={restore} />
          </View>
        ) : null}
        <LinkBtn label="Add an item" icon="plus" onPress={addItem} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: 1, borderTopColor: t.c.line }}>
          <Txt variant="bodyStrong" style={{ flex: 1 }}>Total</Txt>
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
              <Txt variant="h2" num>{int(tot.kcal)}</Txt><Txt variant="sm" color="muted">kcal</Txt>
            </View>
            {tot.hasMacros ? <Txt variant="cap" color="muted" num>{`P ${Math.round(tot.protein)} g · C ${Math.round(tot.carbs)} g · F ${Math.round(tot.fat)} g`}</Txt> : null}
          </View>
        </View>
        <MealPicker value={meal} onChange={setMeal} />
        <LinkBtn label={review.source === 'photo' ? 'Use a different photo' : 'Change the description'} icon="sync" onPress={startOver} />
      </View>
    );
    footer = <View style={{ flex: 1 }}><Button label={n ? `Add ${int(tot.kcal)} kcal` : 'Nothing to add'} block disabled={!n} loading={saving} onPress={saveReview} /></View>;
  } else if (mode === 'photo') {
    body = (
      <View style={{ gap: 14 }}>
        <Pressable onPress={() => pick('camera')} disabled={preparing} accessibilityRole="button" accessibilityLabel="Take a photo of your meal"
          style={({ pressed }) => [{ alignItems: 'center', gap: 10, paddingVertical: 32, paddingHorizontal: 20, borderRadius: t.radius.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.c.brand, backgroundColor: t.c.brandTint }, pressed && { opacity: 0.85 }]}>
          {preparing ? <ActivityIndicator color={t.c.brand} /> : <IconBubble name="camera" tone="brand" solid size={56} />}
          <Txt variant="title" center>{preparing ? 'Preparing your photo…' : 'Take a photo of your meal'}</Txt>
          <Txt variant="sm" color="ink2" center style={{ maxWidth: 300 }}>I’ll spot each item and estimate its calories. You review everything before it’s saved.</Txt>
        </Pressable>
        <Button label="Choose from your photos" icon="image" variant="secondary" block disabled={preparing} onPress={() => pick('library')} />
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
          <View style={{ paddingTop: 2 }}><Icon name="info" size="sm" color={t.c.muted} /></View>
          <Txt variant="sm" color="muted" style={{ flex: 1 }}>Tip: shoot from above in good light. A nutrition label works too.</Txt>
        </View>
        <MealPicker value={meal} onChange={setMeal} />
      </View>
    );
  } else if (mode === 'describe') {
    body = (
      <View style={{ gap: 18 }}>
        <TextField label="What did you eat?" hint="Plain words are fine. Amounts help: “a handful”, “2 tbsp”, “large”." error={textErr}
          multiline value={text} onChangeText={s => { setText(s); setTextErr(null); }} maxLength={2000} autoFocus={!autoPick}
          placeholder="2 eggs scrambled with butter, a slice of sourdough toast and a black coffee" style={{ minHeight: 120 }} />
        <MealPicker value={meal} onChange={setMeal} />
        <Txt variant="sm" color="muted">You’ll review every item before it’s saved.</Txt>
      </View>
    );
    footer = <View style={{ flex: 1 }}><Button label="Estimate calories" icon="sparkle" block onPress={estimate} /></View>;
  } else {
    body = (
      <View style={{ gap: 18 }}>
        <TextField label="Food name" value={manual.name} error={mErr.name} maxLength={160} placeholder="e.g. Turkey sandwich" autoComplete="off"
          onChangeText={s => { setManual({ ...manual, name: s }); setMErr({ ...mErr, name: undefined }); }} />
        <NumberField label="Calories" decimals={0} suffix="kcal" value={manual.kcal} error={mErr.kcal} placeholder="0" maxLength={6}
          onChangeText={s => { setManual({ ...manual, kcal: s }); setMErr({ ...mErr, kcal: undefined }); }} />
        <View style={{ gap: 8 }}>
          <Txt variant="sm" color="ink2" style={{ fontFamily: t.type.bodyStrong.fontFamily }}>Macros <Txt variant="sm" color="muted">(optional)</Txt></Txt>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {(['protein', 'carbs', 'fat'] as const).map(k => (
              <View key={k} style={{ flex: 1, minWidth: 0 }}>
                <NumberField label={k[0].toUpperCase() + k.slice(1)} suffix="g" value={manual[k]} placeholder="0" maxLength={5}
                  onChangeText={s => setManual({ ...manual, [k]: s })} />
              </View>
            ))}
          </View>
        </View>
        <MealPicker value={meal} onChange={setMeal} />
        <View style={{ gap: 8 }}>
          <Txt variant="sm" color="ink2" style={{ fontFamily: t.type.bodyStrong.fontFamily }}>Photo <Txt variant="sm" color="muted">(optional)</Txt></Txt>
          {img ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Image source={{ uri: img.uri }} style={{ width: 64, height: 64, borderRadius: 14, backgroundColor: t.c.surface2 }} contentFit="cover" accessibilityLabel="Attached photo" />
              <Txt variant="sm" color="muted" style={{ flex: 1, minWidth: 0 }}>Saved with this entry.</Txt>
              <IconButton icon="close" accessibilityLabel="Remove photo" filled onPress={() => { discardUpload(); setImg(null); }} />
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1, minWidth: 0 }}><Button label="Camera" icon="camera" variant="secondary" size="sm" block loading={preparing} onPress={() => pick('camera', true)} /></View>
              <View style={{ flex: 1, minWidth: 0 }}><Button label="Photos" icon="image" variant="secondary" size="sm" block disabled={preparing} onPress={() => pick('library', true)} /></View>
            </View>
          )}
        </View>
      </View>
    );
    footer = <View style={{ flex: 1 }}><Button label="Add food" block loading={saving} onPress={saveManual} /></View>;
  }

  return (
    <ModalSheetScreen title="Add food" sub={date === todayKey() ? undefined : `For ${relDay(date)}`} footer={footer}>
      {tabs}
      {body}
    </ModalSheetScreen>
  );
}

function ReviewRow({ it, first, editing, draft, setDraft, onEdit, onDone, onRemove, onStep }: {
  it: ReviewItem; first: boolean; editing: boolean; draft: EditDraft; setDraft: (d: EditDraft) => void;
  onEdit: () => void; onDone: () => void; onRemove: () => void; onStep: (dir: 1 | -1) => void;
}) {
  const t = useTheme();
  const x = itemTotals(it);
  const border = first ? null : { borderTopWidth: 1, borderTopColor: t.c.line };
  if (editing) {
    return (
      <View style={[{ padding: 14, gap: 12, backgroundColor: t.c.surface2 }, border]}>
        <TextField label="Item" value={draft.name} onChangeText={s => setDraft({ ...draft, name: s })} maxLength={120} autoFocus placeholder="e.g. Rice" />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1.2, minWidth: 0 }}><TextField label="Portion" value={draft.portion} onChangeText={s => setDraft({ ...draft, portion: s })} maxLength={80} /></View>
          <View style={{ flex: 1, minWidth: 0 }}><NumberField label="Calories" decimals={0} suffix="kcal" value={draft.kcal} onChangeText={s => setDraft({ ...draft, kcal: s })} maxLength={5} onSubmitEditing={onDone} /></View>
        </View>
        <Button label="Done" icon="check" variant="tonal" size="sm" onPress={onDone} style={{ alignSelf: 'flex-start' }} />
      </View>
    );
  }
  const atMin = atMinFactor(it);
  const portion = scaledPortion(it.portion, it.f);
  return (
    <View style={[{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8, gap: 4 }, border]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel={`Edit ${it.name}`} hitSlop={4}
          style={({ pressed }) => [{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36 }, pressed && { opacity: 0.6 }]}>
          <Txt variant="bodyStrong" numberOfLines={2} style={{ flexShrink: 1 }}>{it.name || 'Item'}</Txt>
          <Icon name="edit" size="xs" color={t.c.muted} />
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
          <Txt variant="bodyStrong" num>{int(x.kcal)}</Txt><Txt variant="cap" color="muted">kcal</Txt>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 999, backgroundColor: t.c.surface2, flexShrink: 1, minWidth: 0 }} accessibilityLabel={`${it.name} portion`}>
          <IconButton icon="minus" accessibilityLabel={`Less ${it.name}`} disabled={atMin} onPress={() => onStep(-1)} />
          <Txt variant="sm" num numberOfLines={1} accessibilityLiveRegion="polite" style={{ flexShrink: 1, minWidth: 56, textAlign: 'center', fontFamily: t.type.bodyStrong.fontFamily }}>{portion}</Txt>
          <IconButton icon="plus" accessibilityLabel={`More ${it.name}`} onPress={() => onStep(1)} />
        </View>
        <View style={{ flex: 1 }} />
        <IconButton icon="trash" accessibilityLabel={`Remove ${it.name}`} color={t.c.muted} onPress={onRemove} />
      </View>
    </View>
  );
}

/* ================= EDIT ================= */
function EditFood({ f, dateKey }: { f: FoodEntry; dateKey: string }) {
  const t = useTheme();
  const url = usePhotoURL(f.photoPath);
  const [name, setName] = useState(f.name);
  const [factor, setFactor] = useState(1);
  const num = (v: number | undefined) => (fin(v) ? String(Math.round(v * 10) / 10) : '');
  const [kcal, setKcal] = useState(num(f.kcal));
  const [mac, setMac] = useState({ protein: num(f.protein), carbs: num(f.carbs), fat: num(f.fat) });
  const [meal, setMeal] = useState<Meal>(f.meal);
  const [time, setTime] = useState(hhmm(f.t));
  const [errs, setErrs] = useState<{ name?: string; kcal?: string }>({});
  const items = (f.items || []).filter(it => it && it.name);
  const srcTxt = f.source === 'photo' ? 'Estimated from a photo' : f.source === 'text' ? 'Estimated from your description' : 'Entered by hand';

  const scale = (x: number) => {
    tap('select');
    setFactor(x);
    setKcal(String(Math.round(f.kcal * x)));
    setMac({ protein: fin(f.protein) ? num(f.protein * x) : mac.protein, carbs: fin(f.carbs) ? num(f.carbs * x) : mac.carbs, fat: fin(f.fat) ? num(f.fat * x) : mac.fat });
  };
  const save = () => {
    const k = parseNum(kcal);
    const e: typeof errs = {};
    if (!name.trim()) e.name = 'Give it a name.';
    if (!fin(k) || k < 0 || k > 10000) e.kcal = 'Enter calories between 0 and 10,000.';
    setErrs(e);
    if (e.name || e.kcal) { tap('warning'); return; }
    const patch: Partial<FoodEntry> = { name: name.trim(), kcal: Math.round(k), meal };
    (['protein', 'carbs', 'fat'] as const).forEach(m => { const v = parseNum(mac[m]); patch[m] = fin(v) && v >= 0 ? v : undefined; });
    if (/^\d{1,2}:\d{2}$/.test(time)) patch.t = timeOn(dateKey, time);
    if (factor !== 1 && items.length) patch.items = items.map(it => ({ ...it, portion: scaledPortion(it.portion, factor), kcal: Math.round(it.kcal * factor) }));
    try { store.updateItem('foods', f.id, patch); tap('success'); router.back(); toast('Saved'); }
    catch { toast('That couldn’t be saved', { tone: 'error' }); }
  };
  const del = () => {
    const undo = store.removeItem('foods', f.id);
    tap('warning');
    router.back();
    toast(`Deleted ${f.name}`, { action: { label: 'Undo', fn: () => undo?.() } });
  };

  return (
    <ModalSheetScreen title="Edit food" sub={`${relDay(dateKey)} · ${fmtTime(f.t)}`}
      footer={<>
        <Button label="Delete" icon="trash" variant="danger" onPress={del} />
        <View style={{ flex: 1 }}><Button label="Save changes" block onPress={save} /></View>
      </>}>
      {f.photoPath ? (
        url ? <Preview uri={url} height={180} /> : (
          <View style={{ height: 180, borderRadius: t.radius.lg, backgroundColor: t.c.surface2, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {url === undefined ? <ActivityIndicator color={t.c.muted} /> : <Icon name="image" size="lg" color={t.c.muted} />}
            {url === null ? <Txt variant="sm" color="muted">Photo unavailable offline</Txt> : null}
          </View>
        )
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name={f.source === 'photo' ? 'camera' : f.source === 'text' ? 'text' : 'form'} size="sm" color={t.c.muted} />
        <Txt variant="sm" color="muted">{srcTxt}</Txt>
      </View>
      {items.length > 1 || (items.length === 1 && items[0].name !== f.name) ? (
        <View style={{ gap: 8 }}>
          <Txt variant="over" color="muted">Includes</Txt>
          <View style={{ borderRadius: t.radius.md, backgroundColor: t.c.surface2, paddingHorizontal: 14, paddingVertical: 6 }}>
            {items.map((it, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'baseline', paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: t.c.line }}>
                <Txt variant="sm" style={{ flex: 1, minWidth: 0 }}>{it.name}{it.portion ? <Txt variant="sm" color="muted">{' · ' + scaledPortion(it.portion, factor)}</Txt> : null}</Txt>
                <Txt variant="sm" num color="ink2">{int(Math.round(it.kcal * factor))}</Txt>
              </View>
            ))}
          </View>
        </View>
      ) : null}
      <TextField label="Name" value={name} error={errs.name} maxLength={160} onChangeText={s => { setName(s); setErrs({ ...errs, name: undefined }); }} />
      {f.kcal > 0 ? (
        <View style={{ gap: 8 }}>
          <Txt variant="sm" color="ink2" style={{ fontFamily: t.type.bodyStrong.fontFamily }}>Portion</Txt>
          <ChipGroup options={[0.5, 0.75, 1, 1.5, 2].map(x => ({ value: String(x), label: fmtQty(x) + '×' }))} value={String(factor)} onChange={v => scale(+v)} accessibilityLabel="Portion" />
          <Txt variant="sm" color="muted">Scales the calories and macros below.</Txt>
        </View>
      ) : null}
      <NumberField label="Calories" decimals={0} suffix="kcal" value={kcal} error={errs.kcal} maxLength={6} onChangeText={s => { setKcal(s); setErrs({ ...errs, kcal: undefined }); }} />
      <View style={{ gap: 8 }}>
        <Txt variant="sm" color="ink2" style={{ fontFamily: t.type.bodyStrong.fontFamily }}>Macros <Txt variant="sm" color="muted">(optional)</Txt></Txt>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {(['protein', 'carbs', 'fat'] as const).map(k => (
            <View key={k} style={{ flex: 1, minWidth: 0 }}>
              <NumberField label={k[0].toUpperCase() + k.slice(1)} suffix="g" value={mac[k]} placeholder="0" maxLength={5} onChangeText={s => setMac({ ...mac, [k]: s })} />
            </View>
          ))}
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <Txt variant="sm" color="ink2" style={{ fontFamily: t.type.bodyStrong.fontFamily }}>Meal</Txt>
        <ChipGroup options={MEAL_OPTS} value={meal} onChange={setMeal} accessibilityLabel="Meal" />
      </View>
      <TimeField value={time} onChange={setTime} />
    </ModalSheetScreen>
  );
}

function Missing() {
  return (
    <ModalSheetScreen title="Edit food">
      <Notice tone="neutral" icon="info">That item no longer exists.</Notice>
    </ModalSheetScreen>
  );
}

/* ================= route entry ================= */
export function AddFoodSheet() {
  const p = useLocalSearchParams<{ date?: string; meal?: string; mode?: string; id?: string }>();
  const [init] = useState(() => {
    const today = todayKey();
    const date = p.date && isValidKey(p.date) && p.date <= today ? p.date : today;
    const meal: Meal = isMeal(p.meal) ? p.meal : date === today ? mealForTime(Date.now()) : 'lunch';
    const found = p.id ? store.findItem('foods', p.id) : null;
    return { date, meal, found };
  });
  if (p.id) return init.found ? <EditFood f={init.found.item} dateKey={keyOf(init.found.item.t)} /> : <Missing />;
  return <AddFood date={init.date} initialMeal={init.meal} initialMode={p.mode} />;
}
