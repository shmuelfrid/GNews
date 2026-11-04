/* PROGRESS — approved design (Progress.dc.html), port of weight-tracker/js/views/progress.js.
   Focal point: headline card ("You lost 4.6 lb last week") with goal progress. Then weight trend (range), daily deficit,
   stats grid, weekly change, patterns, milestones. */
import { router } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import {
  BarChart, Button, Card, CardHeader, EmptyState, Icon, IconBubble, LineChart, PageHeader, ProgressBar, Screen, Segmented, Txt,
  type IconName,
} from '@/components';
import { useAnalysis, useCurrentKg, useDeficits, useProfile, useToday, useUnits } from '@/lib/store';
import { useTheme } from '@/theme';
import { bmiColors, type BmiKey } from '@/features/bmi/palette';
import {
  deficitCard, deficitDays, headline, milestoneList, patterns, RANGES, statTiles, weeklyCard, weightCard, type MsItem, type Range, type Tile,
} from './model';

export function ProgressScreen() {
  const [range, setRange] = useState<Range>('3M');
  const [showAllMs, setShowAllMs] = useState(false);
  const t = useTheme();
  const U = useUnits();
  const p = useProfile();
  const today = useToday();
  const a = useAnalysis();
  const n = deficitDays(range);
  const da = useDeficits(n);
  const da30 = useDeficits(30);
  const kg = useCurrentKg();

  const h = useMemo(() => headline(a, U), [a, U]);
  const wc = useMemo(() => weightCard(a, range, U, today), [a, range, U, today]);
  const dc = useMemo(() => deficitCard(da, a, range, U), [da, a, range, U]);
  const tiles = useMemo(() => statTiles(a, da30, p, U, kg, today), [a, da30, p, U, kg, today]);
  const wk = useMemo(() => weeklyCard(a, U), [a, U]);
  const pt = useMemo(() => patterns(a, U), [a, U]);
  const ms = useMemo(() => milestoneList(a, U, showAllMs), [a, U, showAllMs]);
  const yFmt = useMemo(() => (v: number) => v.toFixed(wc.yd), [wc.yd]);
  const u = U.unit;

  return (
    <Screen tabs>
      <View style={{ gap: 16 }}>
        <PageHeader title="Progress" />
        <Segmented accessibilityLabel="Chart range" options={RANGES.map(r => ({ value: r.value, label: r.label }))} value={range} onChange={setRange} />
      </View>

      {/* ---------- focal headline ---------- */}
      {h ? (
        <Card elevated gap={20}>
          <View style={{ gap: 8 }}>
            <Txt variant="over" color="muted">{h.over}</Txt>
            <Txt variant="h1" accessibilityRole="header">
              {h.pre}<Txt variant="h1" color={h.warn ? t.c.amber : t.c.brand} num>{h.num}</Txt>{h.post}
            </Txt>
            <Txt variant="body" color="ink2">{h.sub}</Txt>
          </View>
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <Txt variant="sm" color="ink2" style={{ flex: 1, minWidth: 0 }}>
                <Txt variant="bodyStrong" num>{h.done.toFixed(1)}</Txt> of {h.journey.toFixed(1)} {u} {a.dir < 0 ? 'lost' : 'gained'}
              </Txt>
              <Txt variant="bodyStrong" num>{Math.round(h.frac * 100)}%</Txt>
            </View>
            <ProgressBar value={h.frac} tone="teal" height={10} label={undefined} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Txt variant="cap" color="muted" num>Start {U.n(a.startKg)}</Txt>
              <Txt variant="cap" color="muted" num>Goal {U.n(a.goalKg)}</Txt>
            </View>
          </View>
        </Card>
      ) : (
        <Card elevated>
          <EmptyState icon="progress" title="Your story starts with one weigh-in"
            body="Log your weight and this screen turns into your trend, weekly wins, milestones and the date you will reach your goal."
            action={<Button label="Log a weigh-in" icon="scale" onPress={() => router.push('/log-weight')} />} />
        </Card>
      )}

      {/* ---------- weight trend ---------- */}
      <Card>
        <CardHeader title={wc.title} sub={wc.sub} />
        {a.series.length >= 2 ? (
          <>
            <LineChart dots={wc.dots} line={wc.line} projection={wc.projection} projectionLabel={wc.projectionLabel} goal={wc.goal} goalLabel={wc.goalLabel}
              domain={wc.domain} height={248} yFmt={yFmt} latestLabel={U.n(a.current)} tip={wc.tip} accessibilityLabel={wc.a11y} />
            <Legend items={[
              { kind: 'dot', color: t.c.dDot, label: 'Weigh-ins' },
              { kind: 'line', color: t.c.dTrend, label: 'Trend' },
              ...(wc.legendProjected ? [{ kind: 'dash' as const, color: t.c.dProj, label: 'Projected' }] : []),
              ...(wc.showGoal ? [{ kind: 'dash' as const, color: t.c.dGoal, label: 'Goal' }] : []),
            ]} />
          </>
        ) : (
          <ChartEmpty icon="progress" lead={a.series.length ? 'One weigh-in down.' : 'No weigh-ins yet.'}
            body="Log on a couple more days and your trend line, goal line and projected finish date appear here." />
        )}
      </Card>

      {/* ---------- daily deficit ---------- */}
      <Card>
        <CardHeader title={dc.title} sub={dc.sub} />
        {dc.empty ? (
          <ChartEmpty icon="flame" lead="Log what you eat to see it." body="Each bar shows how far under your budget you stayed, and how much fat that adds up to."
            action={<Button label="Add food" icon="plus" variant="tonal" size="sm" onPress={() => router.push('/add-food')} />} />
        ) : (
          <>
            <BarChart bars={dc.bars} height={200} reference={dc.target > 0 ? { value: dc.target, label: 'Daily goal ' + dc.target.toLocaleString('en-US') + ' kcal' } : null}
              valueFmt={v => (v < 0 ? '−' : '') + Math.round(Math.abs(v)).toLocaleString('en-US')} labels={dc.labelsAll ? 'all' : 'none'} tip={dc.tip} accessibilityLabel={dc.a11y} />
            <Legend items={[{ kind: 'sq', color: t.c.dDeficit, label: 'Deficit' }, { kind: 'sq', color: t.c.dSurplus, label: 'Surplus' }]} />
            {dc.compare ? (
              <View style={{ gap: 12, padding: 16, borderRadius: t.radius.md, backgroundColor: t.c.surface2 }}>
                <View style={{ flexDirection: 'row', gap: 16 }}>
                  <CompareCell label={dc.compare.expLabel} value={dc.compare.exp} unit={u} />
                  <CompareCell label={dc.compare.actLabel} value={dc.compare.act} unit={u} />
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Icon name="info" size="sm" color={t.c.muted} />
                  <Txt variant="sm" color="ink2" style={{ flex: 1, minWidth: 0 }}>{dc.compare.note}</Txt>
                </View>
              </View>
            ) : null}
          </>
        )}
      </Card>

      {/* ---------- stats ---------- */}
      {tiles.length >= 2 ? <StatsGrid tiles={tiles} /> : null}

      {/* ---------- weekly ---------- */}
      <Card>
        <CardHeader title={wk.title} sub={wk.sub} />
        {wk.empty ? <GhostWeeks /> : (
          <BarChart bars={wk.bars} height={180} labels="auto" tip={wk.tip} accessibilityLabel={wk.a11y}
            posColor={wk.losing ? t.c.dSurplus : t.c.dDeficit} negColor={wk.losing ? t.c.dDeficit : t.c.dSurplus}
            valueFmt={v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1)} />
        )}
      </Card>

      {/* ---------- patterns ---------- */}
      {pt ? (
        pt.teaser ? (
          <Card style={{ backgroundColor: t.c.surface2 }}>
            <CardHeader title="Patterns" />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Icon name="sparkle" size="sm" color={t.c.brand} />
              <Txt variant="sm" color="ink2" style={{ flex: 1, minWidth: 0 }}>Weigh in morning and evening on a few days and we will show your daily swing, morning-vs-evening gap and lightest weekday here.</Txt>
            </View>
          </Card>
        ) : (
          <Card>
            <CardHeader title="Patterns in your weigh-ins" />
            <View style={{ gap: 16 }}>
              {pt.rows.map(r => (
                <View key={r.title} style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
                  <IconBubble name={r.icon as IconName} tone={r.tone} size={40} />
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Txt variant="bodyStrong">{r.title}</Txt>
                    <Txt variant="sm" color="muted">{r.sub}</Txt>
                  </View>
                </View>
              ))}
            </View>
          </Card>
        )
      ) : null}

      {/* ---------- milestones ---------- */}
      {ms ? (
        <Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 12 }}>
            <View style={{ flexGrow: 1, flexBasis: 140, minWidth: 0, gap: 2 }}>
              <Txt variant="h2" accessibilityRole="header">Milestones</Txt>
              <Txt variant="sm" color="muted">{ms.sub}</Txt>
            </View>
            {ms.next ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: t.c.brandTint }}>
                <Icon name="flag" size="xs" color={t.c.brand} />
                <Txt variant="cap" color={t.c.brand} numberOfLines={1} style={{ flexShrink: 1 }}>Next: {ms.next}</Txt>
              </View>
            ) : null}
          </View>
          <Grid2>{ms.items.map(it => <MilestoneTile key={it.m.id} it={it} />)}</Grid2>
          {ms.canToggle ? (
            <Pressable onPress={() => setShowAllMs(s => !s)} accessibilityRole="button" accessibilityState={{ expanded: showAllMs }}
              style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Txt variant="bodyStrong" color={t.c.brand}>{showAllMs ? 'Show fewer' : 'See all ' + ms.total + ' milestones'}</Txt>
            </Pressable>
          ) : null}
        </Card>
      ) : null}
    </Screen>
  );
}

/* ---------------- pieces ---------------- */
type LegendItem = { kind: 'dot' | 'line' | 'dash' | 'sq'; color: string; label: string };
function Legend({ items }: { items: LegendItem[] }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 6 }} accessibilityLabel={'Legend: ' + items.map(i => i.label).join(', ')}>
      {items.map(i => (
        <View key={i.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {i.kind === 'dot' ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: i.color }} />
            : i.kind === 'sq' ? <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: i.color }} />
              : i.kind === 'line' ? <View style={{ width: 16, height: 3, borderRadius: 2, backgroundColor: i.color }} />
                : <View style={{ width: 16, height: 0, borderTopWidth: 2, borderStyle: 'dashed', borderColor: i.color }} />}
          <Txt variant="cap" color="muted">{i.label}</Txt>
        </View>
      ))}
    </View>
  );
}

function ChartEmpty({ icon, lead, body, action }: { icon: IconName; lead: string; body: string; action?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: 12, paddingVertical: 28, paddingHorizontal: 16, borderRadius: t.radius.md, backgroundColor: t.c.surface2 }}>
      <Icon name={icon} size="lg" color={t.c.muted} />
      <Txt variant="sm" color="ink2" center style={{ maxWidth: 320 }}><Txt variant="sm" style={{ fontFamily: t.type.bodyStrong.fontFamily }}>{lead}</Txt> {body}</Txt>
      {action}
    </View>
  );
}

function CompareCell({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 4, justifyContent: 'space-between' }}>
      <Txt variant="cap" color="muted">{label}</Txt>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <Txt variant="h2" num>{value}</Txt><Txt variant="sm" color="muted">{unit}</Txt>
      </View>
    </View>
  );
}

function Grid2({ children }: { children: ReactNode[] }) {
  const rows: ReactNode[][] = [];
  children.forEach((c, i) => { if (i % 2 === 0) rows.push([c]); else rows[rows.length - 1].push(c); });
  return (
    <View style={{ gap: 12 }}>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 12 }}>
          {r}{r.length === 1 ? <View style={{ flex: 1 }} /> : null}
        </View>
      ))}
    </View>
  );
}

function StatsGrid({ tiles }: { tiles: Tile[] }) {
  return <Grid2>{tiles.map(tl => <StatCell key={tl.label} tile={tl} />)}</Grid2>;
}

function StatCell({ tile }: { tile: Tile }) {
  const t = useTheme();
  const bc = bmiColors(t.dark);
  const subColor = tile.tone === 'good' ? t.c.good : tile.tone === 'warn' ? t.c.amber : t.c.muted;
  const body = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Txt variant="sm" color="muted" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>{tile.label}</Txt>
        {tile.bmi ? <Icon name="chevron" size="sm" color={t.c.muted} /> : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <Txt variant="h1" num numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ flexShrink: 1 }}>{tile.value}</Txt>
        {tile.unit ? <Txt variant="sm" color="muted">{tile.unit}</Txt> : null}
      </View>
      {tile.bmi ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: bc[tile.bmi.key as BmiKey].band }} />
          <Txt variant="sm" color={bc[tile.bmi.key as BmiKey].ink} numberOfLines={1}>{tile.cap}</Txt>
        </View>
      ) : <Txt variant="sm" color={subColor} numberOfLines={2}>{tile.cap}</Txt>}
    </>
  );
  const st = { flex: 1, minWidth: 0, gap: 4, padding: 16, borderRadius: t.radius.md, backgroundColor: t.c.surface, borderWidth: 1, borderColor: t.c.cardBorder, ...t.shadow(1) };
  if (tile.bmi) return (
    <Pressable onPress={() => router.push('/bmi')} accessibilityRole="button" accessibilityLabel={`BMI ${tile.value}, ${tile.cap}. See BMI details`}
      style={({ pressed }) => [st, pressed && { opacity: 0.85 }]}>{body}</Pressable>
  );
  return <View style={st} accessible accessibilityLabel={`${tile.label}: ${tile.value} ${tile.unit || ''}. ${tile.cap}`}>{body}</View>;
}

function MilestoneTile({ it }: { it: MsItem }) {
  const t = useTheme();
  const { m } = it;
  const badgeBg = m.earned ? t.c.tealTint : it.isNext ? t.c.brandTint : t.c.surface;
  const badgeFg = m.earned ? t.c.teal : it.isNext ? t.c.brand : t.c.muted;
  return (
    <View style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 6, paddingVertical: 16, paddingHorizontal: 12, borderRadius: t.radius.md, backgroundColor: t.c.surface2 }}
      accessible accessibilityLabel={`${m.title}. ${it.sub}. ${m.earned ? 'Earned' : 'Not yet earned'}`}>
      <View style={{
        width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 4, backgroundColor: badgeBg,
        borderWidth: m.earned ? 0 : 1.5, borderStyle: it.isNext ? 'solid' : 'dashed', borderColor: it.isNext ? t.c.brand : t.c.lineStrong,
      }}>
        <Icon name={it.icon} size="lg" color={badgeFg} />
      </View>
      <Txt variant="sm" center style={{ fontFamily: t.type.title.fontFamily }}>{m.title}</Txt>
      <Txt variant="cap" color={it.isNext ? 'ink2' : 'muted'} num center>{it.sub}</Txt>
      {!m.earned ? (
        <View style={{ width: '72%', height: 4, borderRadius: 2, backgroundColor: t.c.dTrack, overflow: 'hidden', marginTop: 4 }}>
          <View style={{ width: `${it.frac * 100}%`, height: '100%', backgroundColor: t.c.brand, borderRadius: 2 }} />
        </View>
      ) : null}
    </View>
  );
}

function GhostWeeks() {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, height: 120, paddingHorizontal: 8 }} importantForAccessibility="no-hide-descendants">
      {[40, 62, 30, 55, 48, 70, 36].map((h, i) => <View key={i} style={{ flex: 1, height: `${h}%`, borderRadius: 6, backgroundColor: t.c.dTrack }} />)}
    </View>
  );
}
