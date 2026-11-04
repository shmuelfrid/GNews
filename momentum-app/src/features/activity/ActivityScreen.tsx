/* Activity tab: date switcher, burn breakdown hero (resting / active / workouts stacked bar), steps ring vs goal with
   source chip + Sync now (Health Connect) / Update, workouts list with Storage photo thumbnails, 7-day active bar
   chart with average, and the Samsung Health import entry points. Port of the web js/views/activity.js. */
import { Image } from 'expo-image';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  BarChart, Button, Card, CardHeader, EmptyState, Icon, IconBubble, IconButton, PageHeader, Ring, Screen, Txt, tap, toast,
} from '@/components';
import { addDays, isValidKey } from '@/lib/calc';
import { fmtDateLong, fmtTime, int, minutes as fmtMin, plural, relDay, todayKey, weekday } from '@/lib/format';
import { usePhotoURL } from '@/lib/images';
import { store, useBalance, useCurrentKg, useDay, useProfile, useToday, useTodayActions, useUnits, useVersion } from '@/lib/store';
import type { WorkoutEntry } from '@/lib/types';
import { useTheme } from '@/theme';
import { hasCorePermissions, syncedLabel, syncHealth, useHealthState } from './healthSync';
import { SOURCE_TEXT, splitNote, typeIcon, typeLabel, weekData, weekSummary } from './model';

const fin = (v: unknown): v is number => typeof v === 'number' && isFinite(v);
let lastViewDate: string | null = null;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const longWeekday = (k: string) => { const w = weekday(k, 3); return DAYS.find(d => d.startsWith(w)) || w; };

export function openSheet(pathname: '/add-workout' | '/health-import', params: Record<string, string | undefined>) {
  const p: Record<string, string> = {};
  Object.entries(params).forEach(([k, v]) => { if (v) p[k] = v; });
  router.push({ pathname, params: p } as unknown as Href);
}
const dayWord = (k: string) => { const t = todayKey(); return k === t ? 'today' : k === addDays(t, -1) ? 'yesterday' : 'on ' + relDay(k); };

/* ---------------- date switcher ---------------- */
function DateSwitch({ value, today, onChange }: { value: string; today: string; onChange: (k: string) => void }) {
  const t = useTheme();
  const isToday = value === today;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 999, backgroundColor: t.c.surface, borderWidth: 1, borderColor: t.c.line, ...t.shadow(1) }}>
      <IconButton icon="back" accessibilityLabel="Previous day" onPress={() => { tap('select'); onChange(addDays(value, -1)); }} />
      <Pressable onPress={() => { if (!isToday) { tap('select'); onChange(today); } }} accessibilityRole="button" accessibilityLabel={isToday ? 'Today' : `${relDay(value)}. Jump to today`}
        style={{ minHeight: 44, justifyContent: 'center', minWidth: 64, alignItems: 'center' }}>
        <Txt variant="sm" style={{ fontFamily: t.type.bodyStrong.fontFamily }} numberOfLines={1}>{isToday ? 'Today' : relDay(value).replace(/^\w+, /, '')}</Txt>
      </Pressable>
      <IconButton icon="chevron" accessibilityLabel="Next day" disabled={isToday} onPress={() => { if (!isToday) { tap('select'); onChange(addDays(value, 1)); } }} />
    </View>
  );
}

/* ---------------- burn hero ---------------- */
function BurnCard({ dateKey, isToday }: { dateKey: string; isToday: boolean }) {
  const t = useTheme();
  const u = useUnits();
  const b = useBalance(dateKey);
  const ta = useTodayActions(dateKey);
  const total = isToday ? b.burnSoFar : b.burnExpected;
  const rest = isToday ? b.resting : b.bmr;
  const segs = [
    { label: 'Resting', value: Math.max(0, rest || 0), color: t.c.dRest },
    { label: b.steps != null ? (b.activeEstimated ? 'Active (steps, est.)' : 'Active (steps)') : 'Active', value: Math.max(0, b.active || 0), color: t.c.dActive },
    { label: 'Workouts', value: Math.max(0, b.workouts || 0), color: t.c.dWorkout },
  ];
  const ex = isToday && b.hasFood ? ta?.extraBurnForTarget : null;
  return (
    <Card elevated>
      <View style={{ gap: 4 }}>
        <Txt variant="over" color="muted">{isToday ? 'Burned so far today' : 'Burned ' + dayWord(dateKey)}</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <Txt variant="hero" num>{int(total)}</Txt>
          <Txt variant="title" color="muted">kcal</Txt>
        </View>
      </View>
      <View style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', height: 14, borderRadius: 999, overflow: 'hidden', backgroundColor: t.c.dTrack, gap: 2 }}
          accessible accessibilityLabel={`${int(total)} kcal burned: ` + segs.map(s => `${s.label} ${int(s.value)}`).join(', ')}>
          {segs.filter(s => s.value > 0).map(s => <View key={s.label} style={{ flex: s.value, backgroundColor: s.color }} />)}
        </View>
        <View style={{ gap: 2 }}>
          {segs.map((s, i) => {
            const none = !(s.value > 0);
            return (
              <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 32 }}>
                <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: none ? t.c.dTrack : s.color }} />
                <Txt variant="body" color={none ? 'muted' : 'ink2'} style={{ flex: 1, minWidth: 0 }} numberOfLines={1}>{s.label}</Txt>
                {none ? <Txt variant="sm" color="muted">{i === 1 ? 'No steps yet' : 'None yet'}</Txt>
                  : <Txt variant="bodyStrong" num>{int(s.value)} <Txt variant="sm" color="muted">kcal</Txt></Txt>}
              </View>
            );
          })}
        </View>
      </View>
      {b.workoutsExcluded > 0 ? (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
          <Icon name="info" size="sm" color={t.c.muted} />
          <Txt variant="sm" color="muted" style={{ flex: 1, minWidth: 0 }}>{int(b.workoutsExcluded)} kcal of workouts are already inside your Samsung Health active calories, so they aren’t added twice.</Txt>
        </View>
      ) : null}
      {ex && ex.kcal >= 20 ? (
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, borderRadius: t.radius.md, backgroundColor: t.c.tealTint }}>
          <IconBubble name="flame" tone="teal" size={36} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Txt variant="bodyStrong">Burn {int(ex.kcal)} more kcal to hit today’s target</Txt>
            <Txt variant="sm" color="ink2">≈ {ex.treadmillMin} min on the treadmill ({u.unit === 'kg' ? '5.6 km/h' : '3.5 mph'}, 5%) or ≈ {int(ex.steps)} extra steps</Txt>
          </View>
        </View>
      ) : null}
      <View style={{ gap: 6, borderTopWidth: 1, borderTopColor: t.c.line, paddingTop: 14 }}>
        {isToday && b.burnExpected > b.burnSoFar ? <Txt variant="sm" color="ink2">On track for about <Txt variant="sm" style={{ fontFamily: t.type.bodyStrong.fontFamily }}>{int(b.burnExpected)} kcal</Txt> by the end of today.</Txt> : null}
        <Txt variant="sm" color="muted">Resting burn is what your body uses at rest, from your height, age, sex and weight: {int(b.bmr)} kcal a day{isToday ? ', added as the day goes on.' : '.'}</Txt>
      </View>
    </Card>
  );
}

/* ---------------- add card ---------------- */
function AddCard({ dateKey }: { dateKey: string }) {
  const t = useTheme();
  return (
    <Card onPress={() => openSheet('/add-workout', { date: dateKey })} accessibilityLabel="Add a workout" pad={16}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <IconBubble name="plus" tone="brand" size={48} solid />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Txt variant="title">Add a workout</Txt>
          <Txt variant="sm" color="muted">Photo of your summary, or a quick form</Txt>
        </View>
        <Icon name="chevron" size="md" color={t.c.muted} />
      </View>
    </Card>
  );
}

/* ---------------- steps ---------------- */
function StepsCard({ dateKey, isToday }: { dateKey: string; isToday: boolean }) {
  const t = useTheme();
  const u = useUnits();
  const b = useBalance(dateKey);
  const day = useDay(dateKey);
  const profile = useProfile();
  const hs = useHealthState();
  const goal = profile?.stepGoal || 8000;
  const a = day.activity;
  const steps = b.steps;
  const hcReady = hs.status === 'available' && hasCorePermissions(hs.granted);
  const syncNow = async () => {
    try {
      const r = await syncHealth(7);
      tap('success');
      toast(r.days || r.workouts ? `Synced ${plural(r.days, 'day')}${r.workouts ? ' and ' + plural(r.workouts, 'workout') : ''} from Samsung Health` : 'Up to date. Nothing new in Health Connect.');
    } catch (e) { toast(e instanceof Error ? e.message : 'Sync failed. Try again.', { tone: 'error' }); }
  };
  const f = steps != null ? steps / goal : 0;
  if (steps == null) {
    const hasKcal = a && fin(a.activeKcal);
    return (
      <Card>
        <View style={{ flexDirection: 'row', gap: 18, alignItems: 'center' }}>
          <Ring value={0} size={96} stroke={10} color={t.c.dActive} accessibilityLabel="No steps yet"
            center={<Txt variant="title" num color="muted">0%</Txt>} />
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <Txt variant="over" color="muted">Steps</Txt>
            <Txt variant="h2" color={hasKcal ? 'ink' : 'ink2'}>{hasKcal ? `${int(a!.activeKcal)} active kcal` : 'No steps yet'}</Txt>
            <Txt variant="sm" color="muted">Goal {int(goal)} steps. {hcReady ? 'Sync from Samsung Health or type them in.' : 'Import them from Samsung Health or type them in.'}</Txt>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          {hcReady && isToday
            ? <Button label={hs.syncing ? 'Syncing…' : 'Sync now'} icon="sync" variant="tonal" loading={hs.syncing} onPress={syncNow} />
            : <Button label="Import steps" icon="upload" variant="tonal" onPress={() => openSheet('/health-import', { date: dateKey })} />}
          <Button label="Type them in" variant="ghost" onPress={() => openSheet('/health-import', { date: dateKey, mode: 'manual' })} />
        </View>
      </Card>
    );
  }
  const distKm = a && fin(a.distanceKm) ? a.distanceKm : steps * 0.00075;
  const distTxt = (a && fin(a.distanceKm) ? '' : '≈ ') + u.dist(distKm);
  const togo = Math.max(0, goal - steps);
  const line2 = togo > 0 ? `${int(togo)} to go, about ${Math.max(1, Math.round(togo / 105))} min walking` : 'Goal reached. Nice work.';
  const src = a ? SOURCE_TEXT[a.source] : 'Steps';
  const when = a && fin(a.syncedAt) ? syncedLabel(a.syncedAt, fmtTime, relDay).replace(/^Synced/, a.source === 'manual' ? 'Saved' : 'Synced') : '';
  const isHC = a?.source === 'health-connect';
  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: 18, alignItems: 'center' }}>
        <Ring value={Math.min(1, f)} size={96} stroke={10} color={t.c.dActive} glow accessibilityLabel={`${int(steps)} of ${int(goal)} steps, ${Math.round(f * 100)}%`}
          center={<Txt variant="title" num>{Math.round(f * 100)}%</Txt>} />
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <Txt variant="over" color="muted">Steps</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
            <Txt variant="h1" num>{int(steps)}</Txt>
            <Txt variant="sm" color="muted" num>/ {int(goal)}</Txt>
          </View>
          <Txt variant="sm" color="ink2" numberOfLines={1}>{distTxt} · {int(b.active)} kcal{b.activeEstimated ? ' (est.)' : ''}</Txt>
          <Txt variant="sm" color="muted">{line2}</Txt>
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: 12, borderRadius: t.radius.md, backgroundColor: t.c.surface2 }}>
        <IconBubble name={a?.source === 'manual' ? 'edit' : 'phone'} tone={a?.source === 'manual' ? 'neutral' : 'teal'} size={36} />
        <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 150, minWidth: 0 }}>
          <Txt variant="bodyStrong" numberOfLines={1}>{src.split(' · ')[0]}</Txt>
          <Txt variant="sm" color="muted" numberOfLines={2}>{[when, src.split(' · ')[1] ? 'via ' + src.split(' · ')[1] : ''].filter(Boolean).join(' · ') || 'Saved'}</Txt>
        </View>
        <View style={{ marginLeft: 'auto' }}>{hcReady && isToday
          ? <Button label={hs.syncing ? 'Syncing' : 'Sync now'} size="sm" icon="sync" variant="secondary" loading={hs.syncing} onPress={syncNow} accessibilityLabel="Sync now from Samsung Health" />
          : <Button label="Update" size="sm" icon="sync" variant="secondary" onPress={() => openSheet('/health-import', { date: dateKey, mode: isHC ? 'health-connect' : undefined })} accessibilityLabel="Update steps" />}</View>
      </View>
    </Card>
  );
}

/* ---------------- workouts ---------------- */
function WorkoutRow({ w, divider }: { w: WorkoutEntry; divider?: boolean }) {
  const t = useTheme();
  const u = useUnits();
  const url = usePhotoURL(w.photoPath);
  const sp = splitNote(w.note);
  const name = w.name || typeLabel(w.type);
  const sub = [fmtTime(w.t), w.minutes ? fmtMin(w.minutes) : '', fin(w.distanceKm) ? u.dist(w.distanceKm) : '', sp.speed != null ? `${sp.speed} ${sp.unit} · ${sp.incline}%` : '', fin(w.avgHr) ? w.avgHr + ' bpm' : '']
    .filter(Boolean).join(' · ');
  const tag = w.countedInSamsung ? 'In Samsung Health'
    : w.source === 'photo' ? 'From photo' : w.source === 'samsung-export' ? 'Samsung export' : w.source === 'health-connect' ? 'Health Connect' : 'Added manually';
  const thumb = url
    ? <Image source={{ uri: url }} style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: t.c.surface2 }} contentFit="cover" cachePolicy="memory-disk" transition={150} accessibilityLabel="Workout photo" />
    : w.photoPath
      ? <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: t.c.surface2, alignItems: 'center', justifyContent: 'center' }}><Icon name="image" size="sm" color={t.c.muted} /></View>
      : <IconBubble name={typeIcon(w.type)} tone={w.countedInSamsung ? 'neutral' : 'teal'} size={52} />;
  return (
    <View>
      <Pressable onPress={() => openSheet('/add-workout', { id: w.id })} accessibilityRole="button"
        accessibilityLabel={`Edit ${name}, ${int(w.kcal)} kcal${w.countedInSamsung ? ', already counted in Samsung Health' : ''}`}
        style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 14 }, pressed && { backgroundColor: t.c.surface2 }]}>
        {thumb}
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Txt variant="bodyStrong" numberOfLines={1}>{name}</Txt>
          {sub ? <Txt variant="sm" color="muted" numberOfLines={2}>{sub}</Txt> : null}
          {sp.note ? <Txt variant="sm" color="ink2" numberOfLines={1}>{sp.note}</Txt> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: w.countedInSamsung ? t.c.tealTint : t.c.surface2, marginTop: 2 }}>
            {w.countedInSamsung ? <Icon name="phone" size={12} color={t.c.teal} /> : null}
            <Txt variant="cap" color={w.countedInSamsung ? t.c.teal : t.c.ink2} numberOfLines={1}>{tag}</Txt>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
            <Txt variant="title" num color={w.countedInSamsung ? 'muted' : 'ink'}>{int(w.kcal)}</Txt>
            <Txt variant="cap" color="muted">kcal</Txt>
          </View>
        </View>
      </Pressable>
      {divider ? <View style={{ height: 1, backgroundColor: t.c.line, marginHorizontal: 16 }} /> : null}
    </View>
  );
}
function WorkoutsCard({ dateKey, isToday }: { dateKey: string; isToday: boolean }) {
  const day = useDay(dateKey);
  const list = useMemo(() => day.workouts.slice().sort((a, b) => a.t - b.t), [day]);
  const added = list.filter(w => !w.countedInSamsung).reduce((s, w) => s + (w.kcal || 0), 0);
  const meta = list.length ? plural(list.length, 'workout') + (added ? ' · ' + int(added) + ' kcal' : '') : undefined;
  return (
    <Card pad={list.length ? 4 : 20} gap={list.length ? 0 : 16}>
      {list.length ? (
        <>
          <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 }}>
            <CardHeader title={isToday ? 'Workouts today' : 'Workouts ' + dayWord(dateKey)} sub={meta} />
          </View>
          {list.map((w, i) => <WorkoutRow key={w.id} w={w} divider={i < list.length - 1} />)}
        </>
      ) : (
        <>
          <CardHeader title={isToday ? 'Workouts today' : 'Workouts ' + dayWord(dateKey)} />
          <EmptyState compact icon="dumbbell" title={'No workouts ' + (isToday ? 'yet today' : dayWord(dateKey))}
            body="Logged a session your watch didn’t catch? Add it and its calories count toward your burn." />
        </>
      )}
    </Card>
  );
}

/* ---------------- week chart ---------------- */
function WeekCard({ dateKey, today }: { dateKey: string; today: string }) {
  const t = useTheme();
  const v = useVersion();
  const kgNow = useCurrentKg();
  const profile = useProfile();
  const kg = fin(kgNow) ? kgNow : profile?.startKg || 80;
  const wk = useMemo(() => weekData(k => store.getDay(k), dateKey, kg), [dateKey, kg, v]); // eslint-disable-line react-hooks/exhaustive-deps
  const s = weekSummary(wk, today, longWeekday, int);
  if (!s.any) {
    return (
      <Card>
        <CardHeader title="Your week of activity" />
        <EmptyState compact icon="progress" title="Nothing to chart yet" body="Import steps from Samsung Health or add a workout. Each day becomes a bar here, so you can see your most active days." />
      </Card>
    );
  }
  const bars = wk.map(d => ({
    label: d.key === today ? 'Today' : weekday(d.key, 3), value: d.total,
    highlight: d.key === s.bestKey, muted: d.key === today && d.key !== s.bestKey,
    color: d.key === s.bestKey ? t.c.dWorkout : t.c.dActive,
  }));
  return (
    <Card>
      <CardHeader title={s.title} sub={'Active calories, last 7 days' + (s.avg != null ? ` · avg ${int(s.avg)}` : '')} />
      <BarChart bars={bars} height={168} labels="auto" reference={s.avg != null ? { value: s.avg, label: 'avg' } : null}
        accessibilityLabel={'Active calories per day: ' + bars.map(b => `${b.label} ${int(b.value)}`).join(', ') + (s.avg != null ? `. Average ${int(s.avg)}.` : '')}
        tip={(_, i) => {
          const d = wk[i];
          if (!d.has) return { title: relDay(d.key), rows: [['Activity', 'Nothing logged']] };
          const rows: [string, string][] = [['Steps & activity', int(d.active) + ' kcal']];
          if (d.workouts) rows.push(['Workouts', int(d.workouts) + ' kcal']);
          if (d.steps != null) rows.push(['Steps', int(d.steps)]);
          return { title: relDay(d.key) + (d.key === today ? ' (so far)' : ''), rows };
        }} />
      {s.takeaway ? (
        <Txt variant="sm" color="ink2">{s.takeaway.text}{s.takeaway.bold ? <Txt variant="sm" style={{ fontFamily: t.type.bodyStrong.fontFamily }} color="ink">{s.takeaway.bold}</Txt> : null}{s.takeaway.after || ''}</Txt>
      ) : null}
    </Card>
  );
}

/* ---------------- Samsung Health import ---------------- */
function SamsungCard({ dateKey }: { dateKey: string }) {
  const hs = useHealthState();
  const hcPossible = hs.status === 'available' || hs.status === 'not-installed' || hs.status === 'needs-update';
  const hcReady = hs.status === 'available' && hasCorePermissions(hs.granted);
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconBubble name="phone" tone="teal" size={40} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="title">{hcReady ? 'Samsung Health is connected' : 'Import from Samsung Health'}</Txt>
          {hcReady ? <Txt variant="sm" color="muted">{syncedLabel(hs.lastSync, fmtTime, relDay)} · syncs when you open the app</Txt> : null}
        </View>
      </View>
      <Txt variant="body" color="ink2">
        {hcReady ? 'Steps, active calories and workouts come in through Health Connect. Workouts from your watch are listed but never counted twice.'
          : hcPossible ? 'Connect Health Connect once and your steps, active calories and workouts sync automatically.'
            : 'Samsung Health syncs into Health Connect on Android. Here, import a screenshot or your data export and we’ll read your steps and calories.'}
      </Txt>
      {hcPossible && !hcReady ? (
        <Button label="Connect Samsung Health" icon="sync" variant="tonal" block onPress={() => openSheet('/health-import', { date: dateKey, mode: 'health-connect' })} />
      ) : null}
      <View style={{ gap: 10 }}>
        <Button label="Import a screenshot" icon="camera" variant="secondary" block onPress={() => openSheet('/health-import', { date: dateKey, mode: 'screenshot' })} />
        <Button label="Import your data export" icon="upload" variant="secondary" block onPress={() => openSheet('/health-import', { date: dateKey, mode: 'export' })} />
        <Button label="Type steps in" variant="ghost" iconRight="chevron" block onPress={() => openSheet('/health-import', { date: dateKey, mode: 'manual' })} />
      </View>
    </Card>
  );
}

/* ---------------- screen ---------------- */
export function ActivityScreen() {
  const today = useToday();
  const params = useLocalSearchParams<{ date?: string }>();
  const clampKey = (k: string | null | undefined) => (k && isValidKey(k) && k <= today ? k : today);
  const [key, setKey] = useState(() => clampKey(params.date || lastViewDate));
  useEffect(() => { if (params.date && isValidKey(params.date)) setKey(clampKey(params.date)); }, [params.date]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { lastViewDate = key; }, [key]);
  const dateKey = key > today ? today : key;
  const isToday = dateKey === today;
  return (
    <Screen tabs>
      <PageHeader over={fmtDateLong(dateKey)} title="Activity" actions={<DateSwitch value={dateKey} today={today} onChange={k => setKey(clampKey(k))} />} />
      <BurnCard dateKey={dateKey} isToday={isToday} />
      <View style={{ gap: 16 }}>
        <AddCard dateKey={dateKey} />
        <StepsCard dateKey={dateKey} isToday={isToday} />
        <WorkoutsCard dateKey={dateKey} isToday={isToday} />
      </View>
      <WeekCard dateKey={dateKey} today={today} />
      <SamsungCard dateKey={dateKey} />
    </Screen>
  );
}
