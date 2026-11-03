/* Log weight sheet (route /log-weight?id=&date=&kg=). New: big number + stepper, date, time, tags, note.
   Edit (id): same + Delete with Undo. Delta vs trend shown live. */
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { TextInput, View, type TextInputInstance } from 'react-native';
import { Button, ChipGroup, DateStepper, IconButton, ModalSheetScreen, TextField, TimeField, Txt, tap, toast } from '@/components';
import { isValidKey, keyOf } from '@/lib/calc';
import { WEIGH_TAGS, fmtTime, hhmm, parseNum, relDay, timeOn, todayKey } from '@/lib/format';
import { derived, store, useUnits } from '@/lib/store';
import { useTheme } from '@/theme';

export default function LogWeight() {
  const t = useTheme();
  const u = useUnits();
  const params = useLocalSearchParams<{ id?: string; date?: string; kg?: string }>();
  const found = params.id ? store.findItem('weights', params.id) : null;
  const editing = found?.item || null;
  const init = useMemo(() => {
    const last = store.allWeights().slice(-1)[0];
    const kg = editing ? editing.kg : isFinite(+(params.kg ?? NaN)) ? +params.kg! : last ? last.kg : store.getState().profile?.startKg || 80;
    return {
      kg, value: u.n(kg),
      date: editing ? keyOf(editing.t) : isValidKey(params.date) ? params.date : todayKey(),
      time: editing ? hhmm(editing.t) : hhmm(Date.now()),
      tags: editing ? editing.tags.slice() : new Date().getHours() < 11 ? ['Morning'] : [],
      note: editing?.note || '',
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [value, setValue] = useState(init.value);
  const [date, setDate] = useState(init.date);
  const [time, setTime] = useState(init.time);
  const [tags, setTags] = useState<string[]>(init.tags);
  const [note, setNote] = useState(init.note);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<TextInputInstance>(null);
  const step = u.unit === 'lb' ? 0.2 : 0.1;
  const minU = Math.ceil(u.to(20)), maxU = Math.floor(u.to(400));

  const v = parseNum(value);
  const trend = derived.currentKg();
  const hasHistory = store.allWeights().length > 0;
  const delta = isFinite(v) && trend != null && hasHistory ? u.from(v) - trend : null;
  const deltaText = delta == null ? '' : Math.abs(u.to(delta)) < 0.05 ? 'Right on your trend' : `${u.signed(delta)} ${u.unit} vs your trend (${u.n(trend)})`;

  const bump = (dir: 1 | -1) => {
    tap('select');
    const base = isFinite(v) ? v : u.to(init.kg);
    setValue((Math.round((base + step * dir) * 10) / 10).toFixed(1));
    setErr(null);
  };
  const save = () => {
    const kg = u.from(v);
    if (!isFinite(v) || kg < 20 || kg > 400) { setErr(`Enter a weight between ${minU} and ${maxU} ${u.unit}.`); input.current?.focus(); return; }
    const item = { kg, t: timeOn(date, time), tags, note: note.trim() };
    if (editing) { store.updateItem('weights', editing.id, item); toast('Weigh-in updated'); }
    else { store.addItem('weights', item); toast(`Logged ${u.n(kg)} ${u.unit}`); }
    tap('success');
    router.back();
  };
  const del = () => {
    if (!editing) return;
    const undo = store.removeItem('weights', editing.id);
    tap('warning');
    router.back();
    toast('Weigh-in deleted', { action: { label: 'Undo', fn: () => undo?.() } });
  };

  return (
    <ModalSheetScreen
      title={editing ? 'Edit weigh-in' : 'Log weight'}
      sub={editing ? `${relDay(keyOf(editing.t))} at ${fmtTime(editing.t)}` : 'Weigh in as often as you like. Your trend smooths it out.'}
      footer={<>
        {editing ? <Button label="Delete" icon="trash" variant="danger" onPress={del} /> : null}
        <View style={{ flex: 1 }}><Button label={editing ? 'Save changes' : 'Save weigh-in'} block onPress={save} /></View>
      </>}>
      <View style={{ alignItems: 'center', gap: 8, paddingTop: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <IconButton icon="minus" filled accessibilityLabel={`Decrease by ${step} ${u.unit}`} onPress={() => bump(-1)} size={48} />
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 16, borderWidth: 2, borderColor: err ? t.c.danger : 'transparent' }}>
            <TextInput ref={input} value={value} onChangeText={s => { setValue(s.replace(/[^0-9.,]/g, '')); setErr(null); }}
              keyboardType="decimal-pad" inputMode="decimal" selectTextOnFocus maxLength={6} accessibilityLabel={`Weight in ${u.unit}`}
              onSubmitEditing={save} returnKeyType="done"
              style={[t.type.hero, t.type.num, { color: t.c.ink, textAlign: 'center', width: 150, padding: 0 }, { outlineStyle: 'none' } as object]} />
            <Txt variant="title" color="muted">{u.unit}</Txt>
          </View>
          <IconButton icon="plus" filled accessibilityLabel={`Increase by ${step} ${u.unit}`} onPress={() => bump(1)} size={48} />
        </View>
        <Txt variant="sm" color={err ? t.c.danger : 'muted'} center style={{ minHeight: 18 }}>{err || deltaText}</Txt>
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1.3 }}><DateStepper label="Date" value={date} onChange={setDate} /></View>
        <View style={{ flex: 1 }}><TimeField value={time} onChange={setTime} /></View>
      </View>
      <View style={{ gap: 8 }}>
        <Txt variant="sm" color="ink2" style={{ fontFamily: t.type.bodyStrong.fontFamily }}>Tags <Txt variant="sm" color="muted">(optional)</Txt></Txt>
        <ChipGroup multi options={WEIGH_TAGS} value={tags} onChange={setTags} accessibilityLabel="Tags" />
      </View>
      <TextField label="Note" optional value={note} onChangeText={setNote} maxLength={280} placeholder="e.g. after a long run" returnKeyType="done" />
    </ModalSheetScreen>
  );
}
