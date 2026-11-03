/* Dev-only UI kit gallery (/dev-kit): every component with live store data — a visual reference for feature builders. */
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import {
  Badge, BarChart, Button, Card, CardHeader, ChipGroup, DateStepper, EmptyState, IconButton, LineChart, ListRow, MultiRing, Notice, NumberField,
  ProgressBar, Screen, Section, Segmented, Sheet, Sparkline, StackedBar, StatRow, StatTile, TextField, TimeField, Toggle, Txt, Value, confirm, toast,
} from '@/components';
import { addDays } from '@/lib/calc';
import { fmtDate, int, todayKey, weekday } from '@/lib/format';
import { seedDemoData } from '@/lib/seed';
import { useAnalysis, useBalance, useDeficits, useUnits } from '@/lib/store';
import { useTheme } from '@/theme';

export default function DevKit() {
  const t = useTheme();
  const u = useUnits();
  const b = useBalance();
  const a = useAnalysis();
  const da = useDeficits(7);
  const [seg, setSeg] = useState('week');
  const [chips, setChips] = useState<string[]>(['Morning']);
  const [date, setDate] = useState(todayKey());
  const [time, setTime] = useState('07:30');
  const [on, setOn] = useState(true);
  const [sheet, setSheet] = useState(false);
  const from = addDays(todayKey(), -30);
  return (
    <Screen safeTop={false}>
      <Section title="Data">
        <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
          <Button label="Seed sample data" variant="tonal" onPress={() => seedDemoData()} />
          <Button label="Open log weight" variant="secondary" onPress={() => router.push('/log-weight')} />
        </View>
      </Section>
      <Section title="Rings">
        <Card elevated style={{ alignItems: 'center' }}>
          <MultiRing size={260} stroke={18} glow accessibilityLabel="Energy rings"
            rings={[
              { value: b.budget > 0 ? b.eaten / b.budget : 0, color: t.c.dEaten, colorTo: t.c.brandGlow },
              { value: b.burnExpected > 0 ? (b.active + b.workouts) / Math.max(1, b.activeExpected + b.workouts) : 0, color: t.c.dActive, colorTo: t.c.dWorkout },
              { value: (b.steps || 0) / 10000, color: t.c.amberFill, colorTo: t.c.amber },
            ]}
            center={<View style={{ alignItems: 'center' }}><Value n={int(Math.max(0, b.left))} size="display" /><Txt variant="sm" color="muted">kcal left</Txt></View>} />
        </Card>
      </Section>
      <Section title="Charts">
        <Card>
          <CardHeader title={`Trend ${u.n(a.current)} ${u.unit}`} sub="Last 30 days" />
          <LineChart height={220}
            dots={a.series.filter(d => d.key >= from).map(d => ({ key: d.key, y: u.to(d.avg) }))}
            line={a.series.filter(d => d.key >= from).map(d => ({ key: d.key, y: u.to(d.trend) }))}
            goal={u.to(a.goalKg)} goalLabel={`Goal ${u.n(a.goalKg, 0)}`}
            projection={a.projKey && a.last ? [{ key: a.last.key, y: u.to(a.current) }, { key: a.projKey, y: u.to(a.goalKg) }] : []}
            projectionLabel={a.projKey ? fmtDate(a.projKey) : undefined}
            latestLabel={u.n(a.current)}
            tip={k => { const d = a.series.find(x => x.key === k); return d ? { title: fmtDate(k), rows: [['Trend', u.w(d.trend)], ['Weigh-ins', String(d.n)]] } : null; }} />
        </Card>
        <Card>
          <CardHeader title={`Under budget ${da.underCount} of ${da.completedCount} days`} sub="Daily deficit, kcal" />
          <BarChart bars={da.days.map(d => ({ label: weekday(d.key, 1), value: d.logged ? d.deficit : 0, highlight: d.partial, muted: !d.logged }))}
            reference={{ value: b.targetDeficit, label: `Target ${int(b.targetDeficit)}` }}
            tip={(bar, i) => ({ title: fmtDate(da.days[i].key), rows: [['Eaten', int(da.days[i].eaten)], ['Burned', int(da.days[i].burn)], ['Deficit', int(da.days[i].deficit)]] })} />
        </Card>
        <Card>
          <StackedBar segments={[{ label: 'Resting', value: b.resting, color: t.c.dRest }, { label: 'Active', value: b.active, color: t.c.dActive }, { label: 'Workouts', value: b.workouts, color: t.c.dWorkout }]} />
          <Sparkline values={a.series.slice(-14).map(d => d.trend)} width={120} height={36} area />
        </Card>
      </Section>
      <Section title="Tiles & rows">
        <StatRow>
          <StatTile label="Eaten" dot={t.c.dEaten} value={int(b.eaten)} unit="kcal" sub={`${int(b.left)} left`} subTone="good" />
          <StatTile label="Burned" dot={t.c.dActive} value={int(b.burnSoFar)} unit="kcal" sub="so far" />
        </StatRow>
        <Card pad={4} gap={0}>
          <ListRow icon="food" title="Chicken burrito bowl" sub="Lunch · 12:30 PM" value="680" unit="kcal" chevron onPress={() => {}} divider />
          <ListRow icon="dumbbell" iconTone="teal" title="Treadmill walk" sub="35 min" value="310" unit="kcal" chevron onPress={() => {}} />
        </Card>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}><Badge text="On track" tone="teal" icon="check" /><Badge text="Over by 120" tone="amber" /><Badge text="AI estimate" icon="sparkle" /></View>
        <ProgressBar value={0.58} label="58% of the way" right="18.4 of 32 lb" />
        <Notice tone="amber" icon="alert" title="Heads up">Your budget is at the safe minimum.</Notice>
        <Card><EmptyState icon="food" title="No meals yet" body="Snap a photo or describe what you ate." action={<Button label="Add food" icon="plus" variant="tonal" />} compact /></Card>
      </Section>
      <Section title="Controls">
        <Segmented options={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }, { value: 'all', label: 'All' }]} value={seg} onChange={setSeg} />
        <ChipGroup multi options={['Morning', 'After workout', 'Before bed']} value={chips} onChange={setChips} />
        <View style={{ flexDirection: 'row', gap: 12 }}><View style={{ flex: 1.3 }}><DateStepper label="Date" value={date} onChange={setDate} /></View><View style={{ flex: 1 }}><TimeField value={time} onChange={setTime} /></View></View>
        <TextField label="Name" placeholder="Food name" />
        <NumberField label="Calories" suffix="kcal" decimals={0} hint="Estimate is fine" />
        <Toggle label="Counted in Samsung Health" sub="Don’t add these calories twice" value={on} onChange={setOn} />
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button label="Primary" onPress={() => toast('Saved', { action: { label: 'Undo', fn: () => toast('Undone') } })} />
          <Button label="Secondary" variant="secondary" onPress={() => setSheet(true)} />
          <Button label="Danger" variant="danger" onPress={() => confirm({ title: 'Delete entry?', body: 'This can’t be undone.', ok: 'Delete', danger: true }).then(r => toast(r ? 'Deleted' : 'Kept'))} />
          <Button label="Ghost" variant="ghost" />
          <IconButton icon="gear" accessibilityLabel="Settings" filled />
        </View>
      </Section>
      <Sheet visible={sheet} onClose={() => setSheet(false)} title="Sheet" sub="Scroll body + sticky footer" footer={<Button label="Done" block onPress={() => setSheet(false)} />}>
        <Txt>Sheets are bottom-anchored on phones and centered cards on wide screens.</Txt>
      </Sheet>
    </Screen>
  );
}
