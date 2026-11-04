/* TODAY — approved design (Main.dc.html): hero rings, floating week strip, climb, plan, compact log. */
import { useFocusEffect } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components';
import { useAnalysis, useBalance, useDay, useDeficits, useHeadlines, useProfile, useToday, useTodayActions, useUnits } from '@/lib/store';
import { useTheme } from '@/theme';
import { ClimbCard } from './ClimbCard';
import { Hero } from './Hero';
import { climbData, climbLine, heroCenters, heroModel, planTasks, weekModel, type Focus } from './model';
import { PlanCard } from './PlanCard';
import { TodayLog } from './TodayLog';
import { WeekCard } from './WeekCard';

export function TodayScreen() {
  const t = useTheme();
  const p = useProfile();
  const today = useToday();
  const U = useUnits();
  const b = useBalance(today);
  const ta = useTodayActions(today);
  const a = useAnalysis();
  const da = useDeficits(7);
  const hl = useHeadlines();
  const day = useDay(today);
  const [focus, setFocus] = useState<Focus>('');
  const [daySel, setDaySel] = useState<string | null>(null);

  // the hero is always deep indigo → light status bar while Today is focused
  useFocusEffect(useCallback(() => {
    setStatusBarStyle('light');
    return () => setStatusBarStyle(t.dark ? 'light' : 'dark');
  }, [t.dark]));

  const prof = p || { unit: U.unit, celebrated: [] };
  const h = useMemo(() => heroModel(prof, b, ta), [prof, b, ta]);
  const centers = useMemo(() => heroCenters(b, h), [b, h]);
  const week = useMemo(() => weekModel(da), [da]);
  const cd = useMemo(() => climbData(prof, a, hl, U, today), [prof, a, hl, U, today]);
  const line = useMemo(() => climbLine(a, cd, U), [a, cd, U]);
  const tasks = useMemo(() => planTasks(b, h, day), [b, h, day]);
  const sel = daySel && week.cells.some(c => c.key === daySel) ? daySel : week.cells[week.cells.length - 1]?.key;

  return (
    <Screen tabs safeTop={false} contentStyle={{ gap: 20 }}>
      <View>
        <Hero name={(prof.name || '').trim()} streak={a.streak || 0} today={today} h={h} b={b} center={centers[focus] || centers['']} focus={focus} onFocus={setFocus} />
        {week.cells.length ? <WeekCard title={week.title} cells={week.cells} selected={sel} onSelect={setDaySel} /> : null}
      </View>
      <ClimbCard cd={cd} U={U} today={today} heightCm={prof.heightCm} line={line} />
      <PlanCard tasks={tasks} dayKey={today} />
      <TodayLog day={day} eaten={b.eaten} U={U} dayKey={today} />
    </Screen>
  );
}
