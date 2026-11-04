/* BMI — approved design (BMI.dc.html), port of weight-tracker/js/views/bmi.js. Stack route reached from Progress (BMI tile) and Profile.
   Focal point: current BMI + category pill + personal BMI scale. Then healthy weight range (+ "Set goal to X" with undo),
   category milestone, BMI trend over tinted bands (+ projection at plan pace), About BMI + waist measurement. */
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { Button, Card, EmptyState, Icon, IconBubble, NumberField, Screen, Segmented, Sheet, tap, toast, Txt } from '@/components';
import { store, useAnalysis, useCurrentKg, usePlan, useProfile, useToday, useUnits } from '@/lib/store';
import { useTheme } from '@/theme';
import { BmiScale, BmiTrend } from './charts';
import {
  b1, build, headSub, heroSub, milestoneCard, parseWaist, rangeCard, trendView, waistLen, waistRow, wRound, type BmiOk, type Rich, type TrendRange,
} from './model';
import { bmiColors } from './palette';

export function BmiScreen() {
  const t = useTheme();
  const U = useUnits();
  const p = useProfile();
  const kg = useCurrentKg();
  const pl = usePlan();
  const a = useAnalysis();
  const today = useToday();
  const [range, setRange] = useState<TrendRange>('All');
  const [justSet, setJustSet] = useState<{ prevKg: number; newKg: number } | null>(null);
  const [waistOpen, setWaistOpen] = useState(false);
  const m = useMemo(() => build(p, kg, pl, a, today), [p, kg, pl, a, today]);

  if (m.state !== 'ok') {
    return (
      <Screen safeTop={false}>
        <Txt variant="body" color="ink2" style={{ paddingTop: 4 }}>{headSub(m.p, U)}</Txt>
        <Card>
          {m.state === 'no-height'
            ? <EmptyState icon="profile" title="Add your height to see your BMI" body="BMI compares your weight with your height. Add it in your profile and this screen fills in."
              action={<Button label="Add your height" onPress={() => router.push('/profile')} />} />
            : <EmptyState icon="scale" title="Log a weigh-in to see your BMI" body="Your BMI is worked out from your trend weight."
              action={<Button label="Log weight" icon="scale" onPress={() => router.push('/log-weight')} />} />}
        </Card>
      </Screen>
    );
  }

  const u = U.unit;
  const rc = rangeCard(m, U);
  const mc = milestoneCard(m, U);
  const tv = trendView(m, range);
  const wr = waistRow(m.p, m.cm, U);
  const showJust = justSet && typeof m.p.goalKg === 'number' && Math.abs(justSet.newKg - m.p.goalKg) < 0.01;

  const setGoal = (target: number) => {
    const prevKg = m.p.goalKg;
    if (typeof prevKg !== 'number') return;
    store.setProfile({ goalKg: target });
    tap('success');
    setJustSet({ prevKg, newKg: target });
    toast('Goal set to ' + wRound(target, U) + ' ' + u, { action: { label: 'Undo', fn: () => undoGoal(prevKg) } });
  };
  const undoGoal = (prevKg: number) => {
    setJustSet(null);
    store.setProfile({ goalKg: prevKg });
    toast('Goal back to ' + wRound(prevKg, U) + ' ' + u);
  };

  return (
    <Screen safeTop={false}>
      <Txt variant="body" color="ink2" style={{ paddingTop: 4 }}>{headSub(m.p, U)}</Txt>

      {/* ---------- hero (focal) ---------- */}
      <Card elevated gap={20}>
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }} accessible accessibilityLabel={'Your BMI today ' + b1(m.bmi) + ', ' + m.cat.label}>
              <Txt variant="hero" num>{b1(m.bmi)}</Txt>
              <Txt variant="title" color="muted">BMI</Txt>
            </View>
            <View style={{ marginLeft: 'auto' }}><CatPill cat={m.cat.key} label={m.cat.label} /></View>
          </View>
          <RichText runs={heroSub(m, U)} variant="sm" />
        </View>
        <BmiScale m={m} U={U} />
      </Card>

      {/* ---------- healthy range ---------- */}
      <Card>
        <View style={{ gap: 6 }}>
          <Txt variant="title" accessibilityRole="header">Your healthy weight range</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
            <Txt variant="display" num color={bmiColors(t.dark).healthy.ink}>{rc.range}</Txt>
            <Txt variant="title" color="muted">{u}</Txt>
            <Txt variant="sm" color="muted">for {U.height(m.cm)}</Txt>
          </View>
        </View>
        <RichText runs={rc.body} variant="body" />
        {rc.note ? (
          <View style={{ padding: 14, borderRadius: t.radius.md, backgroundColor: t.c.surface2 }}>
            <RichText runs={rc.note} variant="sm" />
          </View>
        ) : null}
        {showJust && justSet ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
            <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: t.c.tealTint }}>
              <Icon name="check" size="xs" color={t.c.teal} strokeWidth={2.4} />
            </View>
            <Txt variant="bodyStrong" style={{ flex: 1, minWidth: 0 }} accessibilityLiveRegion="polite">Goal set to {wRound(justSet.newKg, U)} {u}</Txt>
            <Pressable onPress={() => undoGoal(justSet.prevKg)} accessibilityRole="button" accessibilityLabel={'Undo, keep goal at ' + wRound(justSet.prevKg, U) + ' ' + u}
              hitSlop={8} style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' }}>
              <Txt variant="bodyStrong" color={t.c.brand}>Undo</Txt>
            </Pressable>
          </View>
        ) : rc.setGoal ? (
          <Button label={rc.setGoal.label} accessibilityLabel={rc.setGoal.a11y} variant="secondary" size="sm" style={{ alignSelf: 'flex-start' }}
            onPress={() => rc.setGoal && setGoal(rc.setGoal.kg)} />
        ) : null}
      </Card>

      {/* ---------- category milestone ---------- */}
      <Card>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
          <IconBubble name={mc.icon} tone={mc.tone === 'good' ? 'teal' : 'brand'} size={48} />
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <RichText runs={mc.title} variant="title" />
            <RichText runs={mc.sub} variant="sm" muted />
            {mc.foot ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <Icon name="flag" size="sm" color={t.c.brand} />
                <Txt variant="sm" color="ink2" style={{ flex: 1, minWidth: 0 }}>{mc.foot}</Txt>
              </View>
            ) : null}
          </View>
        </View>
      </Card>

      {/* ---------- trend ---------- */}
      <Card>
        <View style={{ gap: 12 }}>
          <View style={{ gap: 2 }}>
            <Txt variant="title" accessibilityRole="header">{tv.title}</Txt>
            <Txt variant="sm" color="muted">{tv.sub}</Txt>
          </View>
          <Segmented accessibilityLabel="Chart range" value={range} onChange={setRange}
            options={(['1M', '3M', 'All'] as TrendRange[]).map(r => ({ value: r, label: r }))} />
        </View>
        <BmiTrend m={m} U={U} range={range} />
      </Card>

      {/* ---------- about + waist ---------- */}
      <Card>
        <Txt variant="title" accessibilityRole="header">About BMI</Txt>
        <Txt variant="body" color="ink2">A screening tool for adults, not a diagnosis. It can’t tell muscle from fat, and the categories are the same for men and women. Some health bodies use lower cutoffs, such as 23 for people of Asian descent. Pair it with your waist: a waist under half your height (a ratio below 0.5) is a good sign.</Txt>
        <Pressable onPress={() => setWaistOpen(true)} accessibilityRole="button"
          accessibilityLabel={wr.has ? 'Update waist measurement, currently ' + waistLen(m.p.waistCm as number, U) : 'Add waist measurement'}
          style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, padding: 12, borderRadius: t.radius.md, backgroundColor: t.c.surface2 }, pressed && { opacity: 0.85 }]}>
          <View style={{ width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: wr.has ? (wr.good ? t.c.tealTint : t.c.amberTint) : t.c.brandTint }}>
            <Ruler color={wr.has ? (wr.good ? t.c.teal : t.c.amber) : t.c.brand} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Txt variant="bodyStrong" color={wr.has ? t.c.ink : t.c.brand}>{wr.title}</Txt>
            <Txt variant="sm" color="muted">{wr.sub}</Txt>
          </View>
          <Icon name="chevron" size="sm" color={t.c.muted} />
        </Pressable>
      </Card>

      <WaistSheet visible={waistOpen} onClose={() => setWaistOpen(false)} m={m} />
    </Screen>
  );
}

/* ---------------- pieces ---------------- */
function CatPill({ cat, label }: { cat: BmiOk['cat']['key']; label: string }) {
  const t = useTheme();
  const sw = bmiColors(t.dark)[cat];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 32, paddingHorizontal: 14, borderRadius: 999, backgroundColor: sw.tint }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: sw.band, borderWidth: 1.5, borderColor: sw.ink }} />
      <Txt variant="sm" color={sw.ink} style={{ fontFamily: t.type.over.fontFamily }} numberOfLines={1}>{label}</Txt>
    </View>
  );
}

function RichText({ runs, variant, muted }: { runs: Rich; variant: 'body' | 'sm' | 'title'; muted?: boolean }) {
  const t = useTheme();
  return (
    <Txt variant={variant} color={muted ? 'muted' : variant === 'title' ? 'ink' : 'ink2'}>
      {runs.map((s, i) => (i % 2 ? <Txt key={i} variant={variant} color={t.c.ink} num style={{ fontFamily: t.type.over.fontFamily }}>{s.replace(/ /g, '\u00A0')}</Txt> : s))}
    </Txt>
  );
}

function Ruler({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Rect x={2.5} y={8} width={19} height={8} rx={2} stroke={color} strokeWidth={1.75} />
      <Path d="M6.5 8v3M10.5 8v4M14.5 8v3M18.5 8v4" stroke={color} strokeWidth={1.75} strokeLinecap="round" />
    </Svg>
  );
}

function WaistSheet({ visible, onClose, m }: { visible: boolean; onClose: () => void; m: BmiOk }) {
  const U = useUnits();
  const inch = U.unit === 'lb';
  const cur = typeof m.p.waistCm === 'number' && m.p.waistCm > 0 ? m.p.waistCm : null;
  const toDisp = (cm: number) => (inch ? (cm / 2.54).toFixed(1).replace(/\.0$/, '') : String(Math.round(cm)));
  const [val, setVal] = useState(cur ? toDisp(cur) : '');
  const [err, setErr] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(false);
  if (visible !== wasOpen) { setWasOpen(visible); if (visible) { setVal(cur ? toDisp(cur) : ''); setErr(null); } }
  const cm = parseWaist(val, U);
  const ratio = isFinite(cm) ? cm / m.cm : NaN;
  const half = m.cm / 2;
  const save = () => {
    if (!isFinite(cm)) { setErr('Enter a waist between ' + (inch ? '16 and 98 in' : '40 and 250 cm') + '.'); return; }
    store.setProfile({ waistCm: cm });
    tap('success'); onClose(); toast('Waist saved');
  };
  const remove = () => {
    const prev = cur;
    store.setProfile({ waistCm: undefined });
    onClose();
    toast('Waist removed', { action: { label: 'Undo', fn: () => store.setProfile({ waistCm: prev ?? undefined }) } });
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={cur ? 'Update waist' : 'Add waist measurement'} sub="Waist-to-height is a simple check that BMI misses."
      footer={
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {cur ? <Button label="Remove" variant="secondary" onPress={remove} style={{ flex: 1 }} /> : null}
          <Button label="Save waist" onPress={save} style={{ flex: 2 }} />
        </View>
      }>
      <View style={{ gap: 12 }}>
        <NumberField label="Waist" suffix={inch ? 'in' : 'cm'} value={val} placeholder={inch ? '34' : '86'} autoFocus
          onChangeText={s => { setVal(s); setErr(null); }} onSubmitEditing={save} error={err}
          hint={'Measure around your middle, just above the hip bones, after breathing out. Target: under ' + toDisp(half) + (inch ? ' in' : ' cm') + '.'} />
        {isFinite(ratio) ? (
          <Txt variant="sm" color="ink2" accessibilityLiveRegion="polite">Waist-to-height {ratio.toFixed(2)}{ratio < 0.5 ? ' · under 0.5, a healthy sign' : ' · target under 0.5'}</Txt>
        ) : null}
      </View>
    </Sheet>
  );
}
