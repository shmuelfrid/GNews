/* Food tab: date switcher, kcal-left budget hero + macros, add actions (camera / library / describe), meals with
   subtotals and photo thumbnails, recent quick re-add, 7-day eaten chart. Tap an item → /add-food?id= (edit/delete). */
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import {
  BarChart, Button, Card, CardHeader, Icon, IconBubble, IconButton, ListRow, Notice, PageHeader, ProgressBar, Screen, Section, Txt, tap, toast,
} from '@/components';
import { aiAvailable, AI_UNAVAILABLE_TEXT } from '@/lib/ai';
import { addDays, equivalents, isValidKey, KCAL_PER_KG } from '@/lib/calc';
import { fmtDateLong, fmtTime, int, kcal as kcalStr, mealForTime, minutes, plural, relDay, timeOn, todayKey, fmtDateShort, weekday } from '@/lib/format';
import { usePhotoURL } from '@/lib/images';
import { store, useBalance, useDay, useDeficits, useToday, useUnits, useVersion } from '@/lib/store';
import type { FoodEntry, Meal } from '@/lib/types';
import { useTheme } from '@/theme';
import { MEAL_ICON, MEAL_IDS, MEAL_LABEL, MEAL_TIME, mealHints } from './portion';

const fin = (v: unknown): v is number => typeof v === 'number' && isFinite(v);
/** AI entry points shown (also true with the web QA hook used by AddFoodSheet) */
const aiOn = () => aiAvailable() || !!(globalThis as { __momentumFoodAiFake?: unknown }).__momentumFoodAiFake;
let lastViewDate: string | null = null; // keep the chosen day across tab switches (like the web view)

/** default timestamp for a new item on a day+meal */
export function defaultT(key: string, meal: Meal): number {
  return key === todayKey() ? Date.now() : timeOn(key, MEAL_TIME[meal] || '12:00');
}

export function openAddFood(params: Record<string, string | undefined>) {
  const p: Record<string, string> = {};
  Object.entries(params).forEach(([k, v]) => { if (v) p[k] = v; });
  router.push({ pathname: '/add-food', params: p } as unknown as Href);
}

/* ---------------- food row (with Storage thumbnail) ---------------- */
function FoodRow({ f, divider }: { f: FoodEntry; divider?: boolean }) {
  const url = usePhotoURL(f.photoPath);
  const t = useTheme();
  const subParts: string[] = [];
  if (f.items && f.items.length > 1) subParts.push(plural(f.items.length, 'item'));
  else if (f.items?.[0]?.portion) subParts.push(f.items[0].portion);
  if (fin(f.t)) subParts.push(fmtTime(f.t));
  if (f.source === 'photo') subParts.push('From photo');
  else if (f.source === 'text') subParts.push('Described');
  const left = url ? undefined : f.photoPath
    ? <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: t.c.surface2, alignItems: 'center', justifyContent: 'center' }}><Icon name="image" size="sm" color={t.c.muted} /></View>
    : <IconBubble name={f.source === 'photo' ? 'camera' : f.source === 'text' ? 'text' : 'food'} tone={f.source === 'manual' ? 'neutral' : 'brand'} size={44} />;
  return (
    <ListRow title={f.name} sub={subParts.join(' · ')} thumb={url || null} left={left} value={int(f.kcal)} unit="kcal" divider={divider} padX={16}
      accessibilityLabel={`Edit ${f.name}, ${int(f.kcal)} kcal`} onPress={() => openAddFood({ id: f.id })} />
  );
}

/* ---------------- date switcher ---------------- */
function DateSwitch({ value, today, onChange }: { value: string; today: string; onChange: (k: string) => void }) {
  const t = useTheme();
  const isToday = value === today;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 999, backgroundColor: t.c.surface, borderWidth: 1, borderColor: t.c.line, ...t.shadow(1) }}>
      <IconButton icon="back" accessibilityLabel="Previous day" onPress={() => { tap('select'); onChange(addDays(value, -1)); }} />
      <Pressable onPress={() => { if (!isToday) { tap('select'); onChange(today); } }} accessibilityRole="button" accessibilityLabel={isToday ? 'Today' : `${relDay(value)}. Jump to today`}
        style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 2, minWidth: 64, alignItems: 'center' }}>
        <Txt variant="sm" style={{ fontFamily: t.type.bodyStrong.fontFamily }} numberOfLines={1}>{isToday ? 'Today' : relDay(value).replace(/^\w+, /, '')}</Txt>
      </Pressable>
      <IconButton icon="chevron" accessibilityLabel="Next day" disabled={isToday} onPress={() => { if (!isToday) { tap('select'); onChange(addDays(value, 1)); } }} />
    </View>
  );
}

/* ---------------- hero ---------------- */
function Hero({ dateKey, isToday }: { dateKey: string; isToday: boolean }) {
  const t = useTheme();
  const u = useUnits();
  const b = useBalance(dateKey);
  const hasBudget = fin(b.budget) && b.budget > 0;
  const left = fin(b.left) ? b.left : 0;
  const gain = !!b.gain;
  const over = hasBudget && left < 0 && !gain;
  const dayWord = isToday ? 'today' : 'on ' + relDay(dateKey);
  let overline: string, num: string, unit: string;
  if (!hasBudget) { overline = 'Eaten ' + dayWord; num = int(b.eaten); unit = 'kcal'; }
  else if (gain) {
    if (left <= 0) { overline = 'Target reached ' + dayWord; num = int(-left); unit = 'kcal above target'; }
    else { overline = isToday ? 'Left to eat today' : 'Short of target ' + dayWord; num = int(left); unit = isToday ? 'kcal to go' : 'kcal short'; }
  } else if (over) { overline = 'Over budget ' + dayWord; num = int(-left); unit = 'kcal over'; }
  else if (isToday) { overline = 'Left to eat today'; num = int(left); unit = 'kcal left'; }
  else { overline = 'Under budget ' + dayWord; num = int(left); unit = 'kcal under'; }
  const frac = hasBudget ? Math.max(0, Math.min(1, b.eaten / b.budget)) : 0;
  const hasMacros = (b.protein || 0) + (b.carbs || 0) + (b.fat || 0) > 0;
  const burnWord = isToday ? 'expected burn' : 'burned';
  const tgt = b.targetDeficit;
  const eq = over && isToday ? equivalents(-left, b.kg) : null;

  return (
    <Card elevated gap={18} accessibilityLabel="Calorie budget">
      <View style={{ gap: 4 }}>
        <Txt variant="over" color={over ? t.c.amber : 'muted'}>{overline}</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <Txt variant="hero" num color={over ? t.c.amber : t.c.ink} numberOfLines={1} adjustsFontSizeToFit>{num}</Txt>
          <Txt variant="title" color="muted">{unit}</Txt>
        </View>
      </View>
      {hasBudget ? (
        <View style={{ gap: 8 }}>
          <ProgressBar value={over ? 1 : frac} tone={over ? 'amber' : 'brand'} height={10} label="" />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <Txt variant="sm" color="muted"><Txt variant="sm" num style={{ fontFamily: t.type.bodyStrong.fontFamily }}>{int(b.eaten)}</Txt> eaten</Txt>
            <Txt variant="sm" color="muted">of <Txt variant="sm" num style={{ fontFamily: t.type.bodyStrong.fontFamily }}>{int(b.budget)}</Txt> {gain ? 'target' : 'budget'}</Txt>
          </View>
          {fin(b.burnExpected) && fin(tgt) ? (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
              <View style={{ paddingTop: 2 }}><Icon name="info" size="sm" color={t.c.muted} /></View>
              <Txt variant="sm" color="muted" style={{ flex: 1, minWidth: 0 }}>
                {int(b.burnExpected)} {burnWord}{tgt > 0 ? ` − ${int(tgt)} deficit goal` : tgt < 0 ? ` + ${int(-tgt)} surplus goal` : ''}
                {b.belowFloor ? ` = ${int(b.rawBudget)}, raised to the ${int(b.budget)} kcal safe minimum` : ` = ${int(b.budget)} kcal budget`}
              </Txt>
            </View>
          ) : null}
        </View>
      ) : null}
      {hasMacros ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {([['Protein', b.protein], ['Carbs', b.carbs], ['Fat', b.fat]] as const).map(([l, v]) => (
            <View key={l} style={{ flex: 1, minWidth: 0, paddingVertical: 12, paddingHorizontal: 12, borderRadius: t.radius.md, backgroundColor: t.c.surface2, gap: 2 }}>
              <Txt variant="cap" color="muted" numberOfLines={1}>{l}</Txt>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                <Txt variant="h2" num numberOfLines={1}>{int(v || 0)}</Txt>
                <Txt variant="sm" color="muted">g</Txt>
              </View>
            </View>
          ))}
        </View>
      ) : null}
      {eq && fin(eq.treadmillMin) && eq.treadmillMin > 0 ? (
        <Notice tone="amber" icon="flame">
          {`A ${minutes(eq.treadmillMin)} treadmill walk (${u.unit === 'kg' ? '5.6 km/h' : '3.5 mph'}, 5% incline) burns the extra ${int(-left)} kcal` +
            (eq.treadmillMin > 60 ? '. Big days happen: easing off a little over the next few days evens it out.' : fin(eq.steps) && eq.steps > 0 ? `, or about ${int(Math.round(eq.steps / 100) * 100)} extra steps.` : '.')}
        </Notice>
      ) : null}
      {b.belowFloor && isToday ? (
        <Notice tone="amber" icon="alert">
          <Txt variant="sm" color="ink2">
            {`Your plan needs more than food alone today: eating under ${int(b.budgetFloor)} kcal isn’t safe, so the rest has to come from moving more. `}
            <Txt variant="sm" color={t.c.brand} onPress={() => router.push('/plan' as Href)} style={{ fontFamily: t.type.bodyStrong.fontFamily }}>Pick a gentler pace</Txt>
          </Txt>
        </Notice>
      ) : null}
    </Card>
  );
}

/* ---------------- add actions ---------------- */
function Actions({ dateKey }: { dateKey: string }) {
  if (!aiOn()) {
    return (
      <View style={{ gap: 12 }}>
        <Button label="Add food" icon="plus" block onPress={() => openAddFood({ date: dateKey, mode: 'manual' })} />
        <Notice tone="neutral" icon="info">{AI_UNAVAILABLE_TEXT + ' For now, enter calories yourself.'}</Notice>
      </View>
    );
  }
  return (
    <View style={{ gap: 12 }}>
      <Button label="Snap a photo" icon="camera" block onPress={() => openAddFood({ date: dateKey, mode: 'camera' })} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}><Button label="Photos" accessibilityLabel="Choose a photo" icon="image" variant="secondary" block onPress={() => openAddFood({ date: dateKey, mode: 'library' })} /></View>
        <View style={{ flex: 1, minWidth: 0 }}><Button label="Describe" accessibilityLabel="Describe it" icon="text" variant="secondary" block onPress={() => openAddFood({ date: dateKey, mode: 'text' })} /></View>
      </View>
    </View>
  );
}

/* ---------------- meals ---------------- */
function AddLink({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 16, borderRadius: 14 }, pressed && { backgroundColor: t.c.surface2 }]}>
      <Icon name="plus" size="sm" color={t.c.brand} strokeWidth={2.2} />
      <Txt variant="bodyStrong" color={t.c.brand}>{label}</Txt>
    </Pressable>
  );
}
function MealCard({ meal, list, hint, dateKey, isToday, hasBudget, target }: { meal: Meal; list: FoodEntry[]; hint?: number; dateKey: string; isToday: boolean; hasBudget: boolean; target: number }) {
  const t = useTheme();
  const subtotal = list.reduce((s, f) => s + (f.kcal || 0), 0);
  const lower = MEAL_LABEL[meal].toLowerCase();
  return (
    <Card pad={4} gap={0}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }}>
        <Txt variant="title" style={{ flex: 1, minWidth: 0 }} accessibilityRole="header">{MEAL_LABEL[meal]}</Txt>
        {list.length ? (
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
            <Txt variant="bodyStrong" num>{int(subtotal)}</Txt><Txt variant="cap" color="muted">kcal</Txt>
          </View>
        ) : <Txt variant="sm" color="muted">{isToday ? 'Not logged yet' : 'Nothing logged'}</Txt>}
      </View>
      {list.map((f, i) => <FoodRow key={f.id} f={f} divider={i < list.length - 1} />)}
      {!list.length && isToday && hasBudget ? (
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', marginHorizontal: 12, marginTop: 6, padding: 14, borderRadius: t.radius.md, backgroundColor: t.c.surface2 }}>
          <IconBubble name={MEAL_ICON[meal]} tone="brand" size={40} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Txt variant="bodyStrong">{hint && hint > 0 ? `${MEAL_LABEL[meal]} budget: about ${int(hint)} kcal` : 'You’ve used today’s budget'}</Txt>
            <Txt variant="sm" color="muted">{hint && hint > 0
              ? (target > 0 ? `Stay at or under it to keep today’s ${int(target)} kcal deficit.` : 'That keeps you on plan for today.')
              : 'If you’re hungry, pick something light: a broth soup or veg is under 100 kcal.'}</Txt>
          </View>
        </View>
      ) : null}
      <View style={{ paddingVertical: 4 }}>
        <AddLink label={list.length ? `Add to ${lower}` : `Add ${lower}`} onPress={() => openAddFood({ date: dateKey, meal })} />
      </View>
    </Card>
  );
}

function FirstRun({ dateKey, isToday, budget, left }: { dateKey: string; isToday: boolean; budget: number; left: number }) {
  const t = useTheme();
  const hints = mealHints({ breakfast: 0, lunch: 0, dinner: 0, snacks: 0 }, left);
  return (
    <Card gap={20}>
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
        <IconBubble name="food" tone="brand" size={48} />
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Txt variant="title">{isToday ? 'Log your first meal of the day' : `Nothing logged on ${relDay(dateKey)}`}</Txt>
          <Txt variant="sm" color="muted">{aiOn()
            ? 'Snap a photo or describe it in plain words. You’ll see an estimate of the calories and macros, and you can change anything before it’s saved.'
            : 'Enter a name and calories. Adding protein, carbs and fat is optional.'}</Txt>
        </View>
      </View>
      {isToday && budget > 0 ? (
        <View style={{ gap: 8 }}>
          <Txt variant="over" color="muted">{`A simple way to split ${int(budget)} kcal`}</Txt>
          <View style={{ borderRadius: t.radius.md, backgroundColor: t.c.surface2, overflow: 'hidden' }}>
            {MEAL_IDS.map((m, i) => (
              <Pressable key={m} onPress={() => openAddFood({ date: dateKey, meal: m })} accessibilityRole="button" accessibilityLabel={`Add ${MEAL_LABEL[m]}, about ${int(hints[m] || 0)} kcal`}
                style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 14, borderTopWidth: i ? 1 : 0, borderTopColor: t.c.line }, pressed && { opacity: 0.7 }]}>
                <Icon name={MEAL_ICON[m]} size="sm" color={t.c.brand} />
                <Txt variant="bodyStrong" style={{ flex: 1, minWidth: 0 }}>{MEAL_LABEL[m]}</Txt>
                <Txt variant="sm" color="muted">about <Txt variant="sm" num style={{ fontFamily: t.type.bodyStrong.fontFamily, color: t.c.ink }}>{int(hints[m] || 0)}</Txt></Txt>
                <Icon name="plus" size="sm" color={t.c.brand} />
              </Pressable>
            ))}
          </View>
        </View>
      ) : (
        <Button label="Add food" icon="plus" variant="tonal" onPress={() => openAddFood({ date: dateKey })} />
      )}
    </Card>
  );
}

/* ---------------- recent ---------------- */
function Recent({ dateKey, isToday }: { dateKey: string; isToday: boolean }) {
  const t = useTheme();
  const v = useVersion();
  const recent = useMemo(() => store.recentFoods(8), [v]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!recent.length) return null;
  const reAdd = (f: FoodEntry) => {
    const meal = isToday ? mealForTime(Date.now()) : f.meal;
    try {
      const item = store.addItem('foods', {
        t: defaultT(dateKey, meal), meal, name: f.name, kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat,
        items: f.items || [], source: f.source, photoPath: f.photoPath, note: f.note,
      });
      tap('success');
      toast(`Added ${f.name} to ${MEAL_LABEL[meal].toLowerCase()}`, { action: { label: 'Undo', fn: () => { store.removeItem('foods', item.id); } } });
    } catch { toast('That couldn’t be added.', { tone: 'error' }); }
  };
  return (
    <Section title="Recent" action={<Txt variant="sm" color="muted">Tap to add again</Txt>}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }} style={{ marginHorizontal: -20 }}
        contentInset={{ left: 0 }}>
        <View style={{ width: 12 }} />
        {recent.map(f => (
          <Pressable key={f.id} onPress={() => reAdd(f)} accessibilityRole="button" accessibilityLabel={`Add ${f.name}, ${int(f.kcal)} kcal`}
            style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, maxWidth: 240, paddingHorizontal: 14, borderRadius: 999, backgroundColor: t.c.surface, borderWidth: 1, borderColor: t.c.lineStrong }, pressed && { opacity: 0.8 }]}>
            <Icon name="plus" size="xs" color={t.c.brand} strokeWidth={2.4} />
            <Txt variant="sm" numberOfLines={1} style={{ flexShrink: 1, fontFamily: t.type.bodyStrong.fontFamily }}>{f.name}</Txt>
            <Txt variant="sm" color="muted" num>{int(f.kcal)}</Txt>
          </Pressable>
        ))}
        <View style={{ width: 12 }} />
      </ScrollView>
    </Section>
  );
}

/* ---------------- week chart ---------------- */
function Week({ dateKey, today }: { dateKey: string; today: string }) {
  const t = useTheme();
  const u = useUnits();
  const da = useDeficits(7);
  if (!da || !Array.isArray(da.days) || da.days.filter(d => d.logged).length < 2) return null;
  const comp = da.completedCount;
  const title = comp >= 1 ? `${da.gain ? 'Hit your calorie target' : 'Under budget'} ${da.underCount} of the last ${plural(comp, 'day')}` : 'Your eating this week';
  const sub = comp >= 1 && fin(da.total)
    ? (da.total >= 0 ? `${int(da.total)} kcal saved` + (da.total >= 1000 ? ` ≈ ${u.abs(da.total / KCAL_PER_KG)} ${u.unit} of fat` : '') : `${int(-da.total)} kcal over in total`)
    : 'Each bar is what you ate that day';
  return (
    <Card>
      <CardHeader title={title} sub={sub} />
      <BarChart height={190} labels="auto" valueFmt={int} accessibilityLabel="Calories eaten each of the last 7 days"
        bars={da.days.map(d => ({
          label: d.key === today ? 'Today' : weekday(d.key),
          value: d.logged ? d.eaten : 0,
          color: d.logged && !da.gain && d.eaten > d.budget ? t.c.dSurplus : t.c.dEaten,
          muted: d.partial, highlight: d.key === dateKey,
        }))}
        tip={(_, i) => {
          const d = da.days[i];
          if (!d.logged) return { title: fmtDateShort(d.key), rows: [['Eaten', 'Not logged']] };
          const diff = d.budget - d.eaten;
          return { title: fmtDateShort(d.key) + (d.partial ? ' (so far)' : ''), rows: [['Eaten', kcalStr(d.eaten)], ['Budget', kcalStr(d.budget)], [diff >= 0 ? 'Under' : 'Over', kcalStr(Math.abs(diff))]] };
        }} />
      {!da.gain ? (
        <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: t.c.dEaten }} /><Txt variant="sm" color="muted">Within budget</Txt></View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: t.c.dSurplus }} /><Txt variant="sm" color="muted">Over budget</Txt></View>
        </View>
      ) : null}
    </Card>
  );
}

/* ---------------- screen ---------------- */
export function FoodScreen() {
  const today = useToday();
  const params = useLocalSearchParams<{ date?: string }>();
  const clampKey = (k: string | null | undefined) => (k && isValidKey(k) && k <= today ? k : today);
  const [key, setKey] = useState(() => clampKey(params.date || lastViewDate));
  useEffect(() => { if (params.date && isValidKey(params.date)) setKey(clampKey(params.date)); }, [params.date]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { lastViewDate = key; }, [key]);
  const dateKey = key > today ? today : key;
  const isToday = dateKey === today;
  const day = useDay(dateKey);
  const b = useBalance(dateKey);
  const foods = useMemo(() => day.foods.slice().sort((a, c) => a.t - c.t), [day]);
  const byMeal = useMemo(() => {
    const m: Record<Meal, FoodEntry[]> = { breakfast: [], lunch: [], dinner: [], snacks: [] };
    foods.forEach(f => (m[f.meal] || m.snacks).push(f));
    return m;
  }, [foods]);
  const hasBudget = fin(b.budget) && b.budget > 0;
  const hints = mealHints({ breakfast: byMeal.breakfast.length, lunch: byMeal.lunch.length, dinner: byMeal.dinner.length, snacks: byMeal.snacks.length }, b.left);

  return (
    <Screen tabs>
      <PageHeader over={fmtDateLong(dateKey)} title="Food" actions={<DateSwitch value={dateKey} today={today} onChange={k => setKey(clampKey(k))} />} />
      <View style={{ gap: 16 }}>
        <Hero dateKey={dateKey} isToday={isToday} />
        <Actions dateKey={dateKey} />
      </View>
      {foods.length ? (
        <View style={{ gap: 16 }}>
          {MEAL_IDS.map(m => <MealCard key={m} meal={m} list={byMeal[m]} hint={hints[m]} dateKey={dateKey} isToday={isToday} hasBudget={hasBudget} target={b.targetDeficit} />)}
        </View>
      ) : <FirstRun dateKey={dateKey} isToday={isToday} budget={hasBudget ? b.budget : 0} left={b.left} />}
      <Recent dateKey={dateKey} isToday={isToday} />
      <Week dateKey={dateKey} today={today} />
    </Screen>
  );
}
