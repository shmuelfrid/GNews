/* ONBOARDING — three calm steps: 1 About you · 2 Your weight · 3 Your plan (live preview + safety check).
   Finishing writes the profile + first weigh-in; the root gate then routes to /today. */
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Badge, Button, Card, ChipGroup, DateStepper, Field, Icon, Notice, NumberField, Screen, Segmented, tap, TextField, toast, Txt } from '@/components';
import * as C from '@/lib/calc';
import { addDays, fmtDate, int, makeUnits } from '@/lib/format';
import { seedDemoData } from '@/lib/seed';
import { derived, store } from '@/lib/store';
import type { Unit } from '@/lib/types';
import { useTheme } from '@/theme';
import { BASELINES, finishPatch, fmt1, initDraft, preview, QUICK_DATES, switchUnit, validate, weightNotes, type Draft, type Errors, type Pace } from './model';
import { FormRow } from './FormRow';

const STEPS = [
  { title: 'Let’s set up your plan', sub: 'A few details so we can work out the calories your body burns at rest.' },
  { title: 'Where you are, where you’re going', sub: 'Your starting point and the weight you’d like to reach.' },
  { title: 'Choose your pace', sub: 'We’ll turn it into a simple daily target: what to eat and what to burn.' },
];
const PACE_SUB: Record<Pace, string> = { relaxed: 'Gentle and easy to keep up', steady: 'The sweet spot for most people', ambitious: 'Faster, needs more discipline' };

function Preview({ d, onSafe }: { d: Draft; onSafe: (k: string) => void }) {
  const t = useTheme();
  const pv = preview(d);
  if (!pv) return null;
  const { pl, bmr } = pv;
  const U = makeUnits(d.unit);
  if (pl.goalReached) return <Notice tone="teal" icon="check">You’re already at your goal weight. We’ll help you hold steady.</Notice>;
  const lose = pl.dir < 0;
  const cells = [
    ['Daily ' + (lose ? 'deficit' : 'surplus'), int(pl.kcalPerDay), 'kcal'],
    ['Eat about', int(pl.lowBudget ? pl.minKcal : pl.budget), pl.lowBudget ? 'kcal a day, the safe minimum' : 'kcal a day'],
    ['Resting burn', int(bmr), 'kcal a day'],
    ['Weeks to go', pl.weeksLeft != null ? String(Math.max(1, Math.round(pl.weeksLeft))) : '–', 'weeks'],
  ];
  const why = pl.tooFast || pl.lowBudget
    ? (pl.tooFast ? 'That’s faster than 1% of your body weight a week, which is hard to sustain and costs muscle. ' : '') +
      (pl.lowBudget ? (pl.tooFast ? 'It would also put' : 'That would put') + ' your daily budget under ' + int(pl.minKcal) + ' kcal, which is too little to eat.' : '')
    : null;
  return (
    <View style={{ gap: 12 }} accessibilityLiveRegion="polite">
      <View style={{ borderRadius: t.radius.lg, backgroundColor: t.c.brandTint, padding: 20, gap: 4 }} accessibilityLabel="Your plan preview">
        <Txt variant="over" color="brand">Your plan</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <Txt variant="display" num>{fmt1(U.to(pl.kgPerWeek))}</Txt>
          <Txt variant="title" color="ink2">{d.unit} a week</Txt>
        </View>
        <Txt variant="sm" color="ink2">{(lose ? 'Lose ' : 'Gain ') + fmt1(U.to(pl.remainingKg)) + ' ' + d.unit}{pl.targetDate ? <Txt variant="sm" style={t.font(700)}>{' by ' + fmtDate(pl.targetDate, true)}</Txt> : null}</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, rowGap: 14 }}>
          {cells.map(c => (
            <View key={c[0]} style={{ width: '50%', paddingRight: 8, gap: 2 }}>
              <Txt variant="cap" color="muted">{c[0]}</Txt>
              <Txt variant="title" num style={t.font(700)}>{c[1]}</Txt>
              <Txt variant="cap" color="muted" style={t.font(500)}>{c[2]}</Txt>
            </View>
          ))}
        </View>
      </View>
      {why ? (
        <Notice tone="amber" icon="alert">
          <View style={{ gap: 10 }}>
            <Txt variant="sm" color="ink2">{why}</Txt>
            {pl.safeDate ? <Button label={'Use a safer date: ' + fmtDate(pl.safeDate, true)} variant="secondary" size="sm" onPress={() => onSafe(pl.safeDate as string)} /> : null}
          </View>
        </Notice>
      ) : null}
    </View>
  );
}

export function OnboardingScreen() {
  const t = useTheme();
  const [d, setD] = useState<Draft>(() => initDraft(store.getState().profile, store.allWeights().length ? derived.currentKg() : null));
  const [errs, setErrs] = useState<Errors>({});
  const set = (patch: Partial<Draft>, clear?: keyof Errors) => { setD(x => ({ ...x, ...patch })); if (clear && errs[clear]) setErrs(e => ({ ...e, [clear]: undefined })); };
  const st = STEPS[d.step - 1];
  const notes = weightNotes(d);
  const scenarios = useMemo(() => { const pv = preview({ ...d, mode: 'pace' }); return pv ? pv.pl.scenarios : []; }, [d]);
  const toTop = () => {}; // Screen is keyed by step, so each step starts at the top

  const next = () => {
    const e = validate(d);
    setErrs(e);
    if (Object.keys(e).length) { tap('warning'); return; }
    if (d.step < 3) { setD(x => ({ ...x, step: (x.step + 1) as Draft['step'] })); toTop(); return; }
    const hadWeights = store.allWeights().length > 0;
    const r = finishPatch(d, store.getState().profile, hadWeights);
    if (!r) return;
    store.setProfile(r.patch);
    if (!hadWeights || d.weightEdited) store.addItem('weights', { kg: r.kg, t: Date.now(), tags: new Date().getHours() < 11 ? ['Morning'] : [], note: '' });
    tap('success');
    setTimeout(() => toast('You’re all set' + (r.patch.name ? ', ' + r.patch.name : '') + '. Here’s your day.'), 300);
  };
  const back = () => { setErrs({}); setD(x => ({ ...x, step: Math.max(1, x.step - 1) as Draft['step'] })); toTop(); };

  return (
    <Screen key={'step' + d.step} maxWidth={560}>
      <View style={{ gap: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: t.c.brand, alignItems: 'center', justifyContent: 'center' }}><Icon name="logo" size={20} color={t.c.onBrand} /></View>
          <Txt variant="title" style={t.font(700)}>Momentum</Txt>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }} accessible accessibilityLabel={'Step ' + d.step + ' of 3'}>
          {[1, 2, 3].map(i => <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= d.step ? t.c.brand : t.c.line }} />)}
        </View>
        <View style={{ gap: 6 }}>
          <Txt variant="over" color="muted">Step {d.step} of 3</Txt>
          <Txt variant="h1" accessibilityRole="header">{st.title}</Txt>
          <Txt color="ink2">{st.sub}</Txt>
        </View>
      </View>

      <Card gap={24}>
        {d.step === 1 ? (
          <>
            <FormRow><TextField label="What should we call you?" optional value={d.name} onChangeText={v => set({ name: v })} autoCapitalize="words" autoComplete="given-name" maxLength={40} placeholder="First name" /></FormRow>
            <FormRow><Field label="Units">
              <Segmented size="lg" accessibilityLabel="Units" options={[{ value: 'lb', label: 'lb · ft/in' }, { value: 'kg', label: 'kg · cm' }]} value={d.unit} onChange={v => setD(x => switchUnit(x, v as Unit))} />
            </Field></FormRow>
            <FormRow><Field label="Sex" hint="Men and women burn slightly different calories at rest, so this keeps your numbers accurate." error={errs.sex}>
              <Segmented size="lg" accessibilityLabel="Sex" options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} value={d.sex as 'male' | 'female'} onChange={v => set({ sex: v as Draft['sex'] }, 'sex')} />
            </Field></FormRow>
            <View style={{ maxWidth: 220, flexDirection: 'row' }}>
              <NumberField label="Age" decimals={0} value={d.age} onChangeText={v => set({ age: v }, 'age')} suffix="years" placeholder="34" error={errs.age} />
            </View>
            {d.unit === 'lb' ? (
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1, minWidth: 0, flexDirection: 'row' }}><NumberField label="Height" decimals={0} value={d.ft} onChangeText={v => set({ ft: v }, 'height')} suffix="ft" placeholder="5" accessibilityLabel="Height, feet" /></View>
                  <View style={{ flex: 1, minWidth: 0, flexDirection: 'row' }}><NumberField label=" " decimals={0} value={d.inch} onChangeText={v => set({ inch: v }, 'height')} suffix="in" placeholder="10" accessibilityLabel="Height, inches" /></View>
                </View>
                {errs.height ? <Txt variant="sm" color="danger">{errs.height}</Txt> : null}
              </View>
            ) : <FormRow><NumberField label="Height" decimals={0} value={d.cm} onChangeText={v => set({ cm: v }, 'height')} suffix="cm" placeholder="178" error={errs.height} /></FormRow>}
          </>
        ) : null}

        {d.step === 2 ? (
          <>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1, minWidth: 0, flexDirection: 'row' }}><NumberField label="Your weight now" value={d.weight} onChangeText={v => set({ weight: v, weightEdited: true }, 'weight')} suffix={d.unit} placeholder={d.unit === 'lb' ? '193.6' : '87.8'} error={errs.weight} /></View>
              <View style={{ flex: 1, minWidth: 0, flexDirection: 'row' }}><NumberField label="Goal weight" value={d.goal} onChangeText={v => set({ goal: v }, 'goal')} suffix={d.unit} placeholder={d.unit === 'lb' ? '180' : '82'} error={errs.goal} /></View>
            </View>
            {notes.amount ? <Notice tone="brand" icon="flag"><Txt variant="sm" color="ink2">That’s <Txt variant="sm" style={t.font(700)}>{notes.amount}</Txt>. We’ll celebrate every 5 {d.unit} along the way.</Txt></Notice> : null}
            {notes.lowGoal ? <Notice tone="amber" icon="alert"><Txt variant="sm" color="ink2">That goal is below a healthy weight for your height. Consider aiming for about <Txt variant="sm" style={t.font(700)}>{notes.lowGoal}</Txt> or more.</Txt></Notice> : null}
          </>
        ) : null}

        {d.step === 3 ? (
          <>
            <FormRow><Field label="How do you want to set your pace?">
              <Segmented size="lg" accessibilityLabel="Plan type" options={[{ value: 'pace', label: 'Steady pace' }, { value: 'date', label: 'By a date' }]} value={d.mode}
                onChange={v => set({ mode: v as Draft['mode'], date: v === 'date' && !d.date ? QUICK_DATES()[0].value : d.date }, 'date')} />
            </Field></FormRow>
            {d.mode === 'date' ? (
              <View style={{ gap: 12 }}>
                <DateStepper label="Reach my goal by" value={d.date || QUICK_DATES()[0].value} onChange={k => set({ date: k }, 'date')} min={addDays(C.keyOf(Date.now()), 14)} max={null} />
                <Txt variant="sm" color="muted">{d.date ? fmtDate(d.date, true) : ''}</Txt>
                <ChipGroup options={QUICK_DATES()} value={d.date} onChange={v => set({ date: v as string }, 'date')} />
                {errs.date ? <Txt variant="sm" color="danger">{errs.date}</Txt> : null}
              </View>
            ) : (
              <FormRow><Field label="Pick a pace">
                <View style={{ gap: 8 }} accessibilityRole="radiogroup">
                  {scenarios.length ? scenarios.map(s => {
                    const on = s.id === d.pace;
                    return (
                      <Pressable key={s.id} onPress={() => { tap('select'); set({ pace: s.id }); }} accessibilityRole="radio" accessibilityState={{ checked: on }}
                        accessibilityLabel={s.label + ', ' + fmt1(makeUnits(d.unit).to(s.kgPerWeek)) + ' ' + d.unit + ' a week, reach goal ' + fmtDate(s.date, true)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, padding: 14, borderRadius: t.radius.md, borderWidth: on ? 2 : 1,
                          borderColor: on ? t.c.brand : t.c.lineStrong, backgroundColor: on ? t.c.brandTint : t.c.surface }}>
                        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                          <Txt variant="bodyStrong">{s.label} <Txt variant="sm" color="muted">· {fmt1(makeUnits(d.unit).to(s.kgPerWeek))} {d.unit}/week</Txt></Txt>
                          <Txt variant="sm" color="muted" style={t.font(400)}>{PACE_SUB[s.id]}</Txt>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 4 }}>
                          <Txt variant="sm" num style={t.font(600)}>{fmtDate(s.date, true)}</Txt>
                          {s.safe ? null : <Badge text="Too fast" tone="amber" />}
                        </View>
                      </Pressable>
                    );
                  }) : <Txt variant="sm" color="muted">Enter your weights first.</Txt>}
                </View>
              </Field></FormRow>
            )}
            <FormRow><Field label="How active is a normal day?" optional hint="Just a starting guess. Once you import steps from Samsung Health, your real numbers take over.">
              <ChipGroup options={BASELINES.map(b => ({ value: b.value, label: b.label }))} value={d.baseline} onChange={v => set({ baseline: v as Draft['baseline'] })} />
            </Field></FormRow>
            <Preview d={d} onSafe={k => set({ mode: 'date', date: k }, 'date')} />
          </>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 4 }}>
          {d.step > 1 ? <Button label="Back" variant="secondary" icon="back" onPress={back} /> : <View />}
          <View style={{ flex: d.step > 1 ? 1 : undefined, minWidth: 0, maxWidth: 260, marginLeft: 'auto' }}>
            <Button label={d.step < 3 ? 'Continue' : 'Start my plan'} iconRight={d.step < 3 ? 'chevron' : 'check'} onPress={next} block />
          </View>
        </View>
      </Card>

      {d.step === 1 ? (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingHorizontal: 4, marginTop: -12 }}>
          <Icon name="info" size="sm" color={t.c.muted} />
          <Txt variant="sm" color="muted" style={{ flex: 1, minWidth: 0 }}>Your details stay in your account and are only used to calculate your numbers.</Txt>
        </View>
      ) : null}
      {__DEV__ ? <Button label="Load sample data (dev)" variant="ghost" onPress={() => seedDemoData()} /> : null}
    </Screen>
  );
}
