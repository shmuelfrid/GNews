/* OWNER: onboarding builder — replace with the full multi-step flow. This minimal single-page form keeps the app usable:
   finishing calls store.setProfile(...) + first weigh-in; the root gate then routes to /today. */
import { useState } from 'react';
import { View } from 'react-native';
import { Button, Card, ChipGroup, NumberField, PageHeader, Screen, Segmented, TextField, Txt } from '@/components';
import { parseNum, todayKey } from '@/lib/format';
import { seedDemoData } from '@/lib/seed';
import { store } from '@/lib/store';
import { makeUnits } from '@/lib/format';
import type { Sex, Unit } from '@/lib/types';
import { useTheme } from '@/theme';

export default function Onboarding() {
  const t = useTheme();
  const p = store.getState().profile;
  const [name, setName] = useState(p?.name || '');
  const [sex, setSex] = useState<Sex | null>(p?.sex || null);
  const [unit, setUnit] = useState<Unit>(p?.unit || 'lb');
  const [age, setAge] = useState('');
  const [ft, setFt] = useState(''); const [inch, setInch] = useState(''); const [cm, setCm] = useState('');
  const [weight, setWeight] = useState(''); const [goal, setGoal] = useState('');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const u = makeUnits(unit);
  const finish = () => {
    const e: Record<string, string> = {};
    const a = parseNum(age), w = parseNum(weight), g = parseNum(goal);
    const h = unit === 'lb' ? u.ftInToCm(parseNum(ft), parseNum(inch) || 0) : parseNum(cm);
    if (!sex) e.sex = 'Choose one. It changes your resting burn estimate.';
    if (!(a >= 13 && a <= 100)) e.age = 'Enter an age between 13 and 100.';
    if (!(h >= 120 && h <= 230)) e.height = 'Enter your height.';
    if (!(u.from(w) >= 30 && u.from(w) <= 350)) e.weight = 'Enter your current weight.';
    if (!(u.from(g) >= 30 && u.from(g) <= 350)) e.goal = 'Enter a goal weight.';
    setErrs(e);
    if (Object.keys(e).length) return;
    const kg = u.from(w);
    store.setProfile({ name: name.trim(), sex: sex!, unit, birthYear: new Date().getFullYear() - Math.round(a), heightCm: Math.round(h * 10) / 10, startKg: kg, startDate: todayKey(), goalKg: u.from(g), targetDate: null, stepGoal: 8000 });
    if (!store.allWeights().length) store.addItem('weights', { kg, t: Date.now(), tags: [], note: '' });
  };
  return (
    <Screen>
      <PageHeader over="Welcome to Momentum" title="Let’s set up your plan" sub="A few details let us estimate the calories you burn at rest and build a daily target." />
      <Card gap={20}>
        <TextField label="Your name" optional value={name} onChangeText={setName} autoCapitalize="words" />
        <View style={{ gap: 8 }}>
          <Txt variant="sm" color="ink2" style={{ fontFamily: t.type.bodyStrong.fontFamily }}>Units</Txt>
          <Segmented options={[{ value: 'lb', label: 'lb · ft/in' }, { value: 'kg', label: 'kg · cm' }]} value={unit} onChange={v => setUnit(v as Unit)} />
        </View>
        <View style={{ gap: 8 }}>
          <Txt variant="sm" color="ink2" style={{ fontFamily: t.type.bodyStrong.fontFamily }}>Sex</Txt>
          <ChipGroup options={[{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }]} value={sex} onChange={v => setSex(v as Sex)} />
          {errs.sex ? <Txt variant="sm" color={t.c.danger}>{errs.sex}</Txt> : null}
        </View>
        <NumberField label="Age" decimals={0} value={age} onChangeText={setAge} suffix="years" error={errs.age} />
        {unit === 'lb' ? (
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <NumberField label="Height" decimals={0} value={ft} onChangeText={setFt} suffix="ft" error={errs.height} />
            <NumberField label=" " decimals={0} value={inch} onChangeText={setInch} suffix="in" />
          </View>
        ) : <NumberField label="Height" decimals={0} value={cm} onChangeText={setCm} suffix="cm" error={errs.height} />}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <NumberField label="Current weight" value={weight} onChangeText={setWeight} suffix={unit} error={errs.weight} />
          <NumberField label="Goal weight" value={goal} onChangeText={setGoal} suffix={unit} error={errs.goal} />
        </View>
        <Button label="Build my plan" block onPress={finish} />
      </Card>
      {__DEV__ ? <Button label="Load sample data (dev)" variant="ghost" onPress={() => seedDemoData()} /> : null}
    </Screen>
  );
}
