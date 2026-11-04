/* PLAN — approved design (Plan.dc.html), port of weight-tracker/js/views/plan.js.
   Focal point: the goal card with the goal-path chart. Then What it takes, Every day, Choose your pace (+ safety), target form, Save.
   Edits are a live draft until "Save plan" writes goalKg + targetDate (+ pace) to the profile. */
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Button, Card, CardHeader, Chip, DateStepper, IconBubble, NumberField, Notice, Screen, tap, toast, Txt } from '@/components';
import { addDays } from '@/lib/calc';
import { int } from '@/lib/format';
import { derived, store, useAnalysis, useBalance, useCurrentKg, useProfile, useToday, useUnits } from '@/lib/store';
import { useTheme } from '@/theme';
import { GoalPathChart } from './GoalPathChart';
import { chartData, dateY, everyDay, fieldErrors, goalText, initDraft, planModel, safety, scenarios, sig, takes, type Draft } from './model';

export function PlanScreen() {
  const t = useTheme();
  const U = useUnits();
  const p = useProfile();
  const today = useToday();
  const kg = useCurrentKg();
  const bal = useBalance(today);
  const a = useAnalysis();
  const [draft, setDraft] = useState<Draft>(() => initDraft(p, derived.plan(), U, today));
  const [draftFor, setDraftFor] = useState(() => sig(p));
  // the saved profile changed elsewhere (or we saved): reset the draft from it
  useEffect(() => {
    if (sig(p) !== draftFor) { setDraft(initDraft(p, derived.plan(), U, today)); setDraftFor(sig(p)); }
  }, [p, draftFor, U, today]);

  const typicalBurn = bal && bal.plan && typeof bal.plan.typicalBurn === 'number' ? bal.plan.typicalBurn : null;
  const m = useMemo(() => planModel(p, draft, kg, bal ? bal.bmr : null, typicalBurn, a, U, today), [p, draft, kg, bal, typicalBurn, a, U, today]);
  const g = goalText(m, U);
  const cd = useMemo(() => chartData(m, U), [m, U]);
  const tk = takes(m, U);
  const ev = everyDay(m, U);
  const sc = scenarios(m, U);
  const warn = safety(m, U);
  const errs = fieldErrors(m, U);
  const u = U.unit;
  const P = m.P;

  const setDate = (k: string) => setDraft(d => ({ ...d, date: k }));
  const save = () => {
    if (!m.goalOk || !m.dateOk) { toast(errs.goal || errs.date || 'Check your target weight and date.', { tone: 'error' }); return; }
    const prev = { goalKg: m.p.goalKg, targetDate: m.p.targetDate, paceKgPerWeek: m.p.paceKgPerWeek };
    store.setProfile({ goalKg: m.goalKg, targetDate: draft.date, paceKgPerWeek: P.kgPerWeek });
    tap('success');
    const msg = typeof P.budget === 'number' && isFinite(P.budget) && !P.goalReached ? 'Plan saved. Your daily budget is ' + int(Math.max(0, P.budget)) + ' kcal.' : 'Plan saved.';
    toast(msg, { action: { label: 'Undo', fn: () => store.setProfile(prev) } });
  };
  const reset = () => { setDraft(initDraft(p, derived.plan(), U, today)); setDraftFor(sig(p)); };

  return (
    <Screen safeTop={false}>
      <Txt variant="body" color="ink2" style={{ paddingTop: 4 }}>Where you are going, by when, and exactly what it takes each day.</Txt>

      {/* ---------- goal (focal) ---------- */}
      <Card elevated gap={14}>
        <Txt variant="over" color="muted">Your goal</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 8 }}>
          <Txt variant="hero" num>{g.goalTxt}</Txt>
          <Txt variant="title" color="muted">{u}</Txt>
          <Txt variant="title" color="ink2">by {g.by}</Txt>
        </View>
        <Txt variant="sm" color="muted">{g.meta}</Txt>
        <Txt variant="title" accessibilityRole="header">{g.takeaway}</Txt>
        {cd ? <GoalPathChart d={cd} /> : null}
        <Legend items={[
          { c: t.c.dTrend, l: 'Your trend', k: 'line' },
          ...(!P.goalReached && m.dateOk ? [{ c: t.c.teal, l: 'Needed pace', k: 'dash' as const }] : []),
          ...(m.projKey || (m.slope != null && m.a.series.length >= 4) ? [{ c: t.c.dProj, l: 'Recent pace', k: 'dot' as const }] : []),
          { c: t.c.dGoal, l: 'Goal', k: 'dash' },
        ]} />
      </Card>

      {/* ---------- what it takes ---------- */}
      <Card>
        <CardHeader title="What it takes" sub={tk.sub} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Take v={tk.perWeek} u={u} l="per week" />
          <Take v={tk.perDay} u={u} l="per day" />
        </View>
        <Take v={tk.kcal} u="kcal" l={tk.word + ' per day'} hero />
      </Card>

      {/* ---------- every day ---------- */}
      <Card>
        <CardHeader title="Every day" />
        {ev.kind === 'needs-profile' ? (
          <>
            <Txt variant="body" color="ink2">Add your height, age and sex in your profile so we can work out your daily calorie budget.</Txt>
            <Button label="Open profile" variant="tonal" size="sm" onPress={() => router.push('/profile')} style={{ alignSelf: 'flex-start' }} />
          </>
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
              <IconBubble name="food" tone="brand" size={44} />
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 6 }}>
                  <Txt variant="body" color="ink2">{ev.kind === 'maintain' ? 'Eat about' : ev.losing ? 'Eat under' : 'Eat at least'}</Txt>
                  <Txt variant="display" num>{ev.kind === 'maintain' ? ev.eat : ev.budget}</Txt>
                  <Txt variant="sm" color="muted">kcal</Txt>
                </View>
                <Txt variant="sm" color="muted">{ev.explain}</Txt>
              </View>
            </View>
            {ev.kind === 'eat' && ev.floor ? <Notice tone="amber" icon="alert">{ev.floor}</Notice> : null}
            {ev.kind === 'eat' && ev.alt ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }} importantForAccessibility="no-hide-descendants">
                  <View style={{ flex: 1, height: 1, backgroundColor: t.c.line }} /><Txt variant="over" color="muted">or</Txt><View style={{ flex: 1, height: 1, backgroundColor: t.c.line }} />
                </View>
                <Txt variant="body" color="ink2">
                  Eat about <Txt variant="bodyStrong">{ev.alt.eat} kcal</Txt> and burn <Txt variant="bodyStrong">{ev.alt.extra} extra</Txt>. That is any one of these:
                </Txt>
                <View style={{ gap: 4 }}>
                  {ev.alt.moves.map(mv => (
                    <View key={mv.t} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 }}>
                      <IconBubble name={mv.icon} tone="teal" size={40} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Txt variant="bodyStrong" numberOfLines={1}>{mv.t}</Txt>
                        <Txt variant="sm" color="muted" numberOfLines={2}>{mv.s}</Txt>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                        <Txt variant="title" num>{mv.n}</Txt><Txt variant="cap" color="muted">{mv.u}</Txt>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            ) : null}
          </>
        )}
      </Card>

      {/* ---------- pace + edit + save ---------- */}
      <Card gap={20}>
        <CardHeader title="Choose your pace" sub="Tap a pace, or set your own date below" />
        {sc.length ? (
          <View style={{ gap: 10 }} accessibilityRole="radiogroup" accessibilityLabel="Choose your pace">
            {sc.map(s => (
              <Pressable key={s.id} onPress={() => { tap('select'); setDate(s.date); }} accessibilityRole="radio" accessibilityState={{ checked: s.on }}
                accessibilityLabel={`${s.label}, ${s.pace}, reach it ${s.dateText}${s.budget ? ', ' + s.budget : ''}${s.badge ? ', ' + s.badge : ''}`}
                style={({ pressed }) => [{
                  flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: 16, paddingVertical: 12, borderRadius: t.radius.md,
                  borderWidth: s.on ? 2 : 1, borderColor: s.on ? t.c.brand : t.c.lineStrong, backgroundColor: s.on ? t.c.brandTint : t.c.surface,
                }, pressed && { opacity: 0.85 }]}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Txt variant="bodyStrong" color={s.on ? t.c.brand : t.c.ink}>{s.label}</Txt>
                    {s.badge ? <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: t.c.amberTint }}><Txt variant="cap" color={t.c.amber}>{s.badge}</Txt></View> : null}
                  </View>
                  <Txt variant="sm" color="muted" num>{s.pace}</Txt>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Txt variant="bodyStrong" num>{s.dateText}</Txt>
                  {s.budget ? <Txt variant="sm" color="muted" num>{s.budget}</Txt> : null}
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}
        {warn ? (
          <Notice tone="amber" icon="alert">
            <View style={{ gap: 10 }}>
              <Txt variant="sm" color="ink2">{warn.text}</Txt>
              {warn.safeDate ? (
                <Button label={'Use a safer date: ' + dateY(warn.safeDate)} variant="secondary" size="sm" style={{ alignSelf: 'flex-start' }}
                  onPress={() => { setDate(warn.safeDate as string); toast('Date moved to ' + dateY(warn.safeDate) + '. Save to keep it.'); }} />
              ) : null}
            </View>
          </Notice>
        ) : null}
        <View style={{ gap: 16 }}>
          <NumberField label="Target weight" suffix={u} value={draft.goal} onChangeText={s => setDraft(d => ({ ...d, goal: s }))} error={errs.goal} placeholder={u === 'lb' ? '180' : '82'} />
          <View style={{ gap: 10 }}>
            <DateStepper label={'Target date · ' + dateY(draft.date)} value={draft.date} onChange={setDate} min={addDays(today, 1)} max={null} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Chip label="−1 week" onPress={() => { const k = addDays(draft.date, -7); setDate(k > today ? k : addDays(today, 1)); }} />
              <Chip label="+1 week" onPress={() => setDate(addDays(draft.date, 7))} />
              <Chip label="+1 month" onPress={() => setDate(addDays(draft.date, 30))} />
            </View>
            {errs.date ? <Txt variant="sm" color={t.c.danger}>{errs.date}</Txt> : null}
          </View>
        </View>
        <View style={{ gap: 8 }}>
          <Button label={m.dirty ? 'Save plan' : 'Plan saved'} icon="check" block disabled={!m.dirty} onPress={save} />
          {m.dirty
            ? <Button label="Undo changes" variant="ghost" block onPress={reset} />
            : <Txt variant="sm" color="muted" center>Change your target or date to update your plan.</Txt>}
        </View>
      </Card>
    </Screen>
  );
}

function Take({ v, u, l, hero }: { v: string; u: string; l: string; hero?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 2, padding: 16, borderRadius: t.radius.md, backgroundColor: hero ? t.c.brandTint : t.c.surface2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <Txt variant={hero ? 'display' : 'h1'} num color={hero ? t.c.brand : t.c.ink} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{v}</Txt>
        <Txt variant="sm" color="muted">{u}</Txt>
      </View>
      <Txt variant="sm" color="muted">{l}</Txt>
    </View>
  );
}

function Legend({ items }: { items: { c: string; l: string; k: 'line' | 'dash' | 'dot' }[] }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 6 }} accessibilityLabel={'Legend: ' + items.map(i => i.l).join(', ')}>
      {items.map(i => (
        <View key={i.l} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {i.k === 'line' ? <View style={{ width: 16, height: 3, borderRadius: 2, backgroundColor: i.c }} />
            : i.k === 'dot' ? <View style={{ width: 16, height: 0, borderTopWidth: 3, borderStyle: 'dotted', borderColor: i.c }} />
              : <View style={{ width: 16, height: 0, borderTopWidth: 2, borderStyle: 'dashed', borderColor: i.c }} />}
          <Txt variant="cap" color="muted">{i.l}</Txt>
        </View>
      ))}
    </View>
  );
}
