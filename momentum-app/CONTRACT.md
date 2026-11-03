# Momentum (React Native) — foundation contract

Expo SDK 58 · expo-router · TypeScript strict · Firebase JS SDK (modular) · Claude via the `analyze` callable function.
Functional/visual reference: `../weight-tracker/` (web app) and the approved `.dc.html` artboards. Design rules: the
`anthropic-skills:shmuels-ui-ux` skill (premium, calm, spacious, beautiful dark mode, 44pt targets, ONE primary CTA per screen/sheet).

**Do not edit foundation files** (everything listed in §1 as foundation). If you need something the foundation lacks,
build it inside your feature folder and mention it in your summary.

## 0. Run

```bash
npm install
cp .env.example .env        # fill EXPO_PUBLIC_FIREBASE_* — or leave the API key empty for demo mode
npm start                   # Expo Go (QR) — everything except Health Connect
npx expo run:android        # or: npx eas-cli build --profile development -p android  (dev build: Health Connect)
npm test                    # jest (calc + csv)          · npx tsc --noEmit
npx expo export --platform web   # static web build in dist/ (serve with any SPA server)
```
**Demo mode** (`EXPO_PUBLIC_FIREBASE_API_KEY` unset): AsyncStorage only, photos stored locally (`local:` paths),
AI calls throw `AiError('not-configured')`. **Seed test data:** `seedDemoData()` from `src/lib/seed.ts`
(dev button on onboarding and on `/dev-kit`; on web open `/?seed=1`, `/?theme=dark`, or run `momentumSeed()` in the console).
`/dev-kit` (dev) shows every component with live data.

## 1. File ownership

| Path | Owner |
|---|---|
| `app/_layout.tsx`, `app/index.tsx`, `app/(tabs)/_layout.tsx`, `app/quick-add.tsx`, `app/log-weight.tsx`, `app/dev-kit.tsx`, `app/+html.tsx` | foundation |
| `src/theme/*`, `src/lib/*` (+ `__tests__`), `src/components/*`, `src/features/shell/*`, `src/features/placeholder/*` | foundation |
| `app.json`, `package.json`, `tsconfig.json`, `.env.example`, `jest.tz.js` | foundation (ask before adding deps; use `npx expo install`) |
| `app/(tabs)/today.tsx` + `src/features/today/**` | today builder (also owns `app/plan.tsx` + `src/features/plan/**` unless assigned separately) |
| `app/(tabs)/food.tsx`, `app/add-food.tsx` + `src/features/food/**` | food builder |
| `app/(tabs)/activity.tsx`, `app/add-workout.tsx`, `app/health-import.tsx` + `src/features/activity/**` | activity builder |
| `app/(tabs)/progress.tsx`, `app/bmi.tsx` + `src/features/progress/**`, `src/features/bmi/**` | progress builder |
| `app/profile.tsx` + `src/features/profile/**` | profile builder |
| `app/onboarding.tsx` + `src/features/onboarding/**` | onboarding builder (current file is a minimal working fallback) |
| `functions/**`, `firebase.json`, `firestore.rules`, `storage.rules`, `.firebaserc` | backend builder |

Route files stay thin: `export default function X() { return <XScreen/> }` importing from `src/features/<area>/`.
Imports use the `@/` alias → `src/` (`import { Card } from '@/components'`).

## 2. Routes

| Route | File | Presentation | Params |
|---|---|---|---|
| `/` | `app/index.tsx` | redirect → `/today` or `/onboarding` | |
| `/today` `/food` `/activity` `/progress` | `app/(tabs)/*.tsx` | tabs (custom bar with centre +) | `food`/`activity` may read `?date=YYYY-MM-DD` |
| `/plan` `/profile` `/bmi` | `app/*.tsx` | stack, native header (title set in root layout). Use `<Screen safeTop={false}>` | |
| `/onboarding` | `app/onboarding.tsx` | full screen, no tabs. **Gate:** root redirects here while `!store.profileComplete()` and away when complete | |
| `/quick-add` | foundation | sheet | |
| `/log-weight` | foundation (done) | sheet | `id?` edit · `date?` prefill day · `kg?` prefill |
| `/add-food` | food | sheet | `date?`, `meal?: Meal`, `mode?: 'photo'\|'camera'\|'text'\|'manual'`, `id?` (edit) |
| `/add-workout` | activity | sheet | `date?`, `mode?: 'photo'\|'camera'\|'manual'`, `id?` (edit) |
| `/health-import` | activity | sheet | `date?`, `mode?: 'health-connect'\|'screenshot'\|'export'\|'manual'` |

Sheet routes are `transparentModal` + fade: render **`<ModalSheetScreen title sub footer>`** as the root (it draws the scrim
and the sliding bottom sheet; closing = `router.back()`). Navigate with `router.push({ pathname: '/add-food', params: { date } })`.
From one sheet to another use `router.replace(...)`. Typed routes are off; params are strings — parse them.

## 3. Data — `src/lib/types.ts`, `src/lib/store.ts`

Canonical units **kg, kcal, cm, km**, timestamps **ms**, dates local `'YYYY-MM-DD'`. Never store display units.
```ts
Profile { name?, sex?: 'male'|'female', birthYear?, heightCm?, unit: 'lb'|'kg', theme?: 'system'|'light'|'dark',
  startKg?, startDate?, goalKg?, targetDate?: string|null, paceKgPerWeek?, stepGoal?, waistCm?, activityBaseline?: 'low'|'some'|'high',
  celebrated: string[], createdAt?, updatedAt? }
DayDoc { date, weights: WeightEntry[], foods: FoodEntry[], workouts: WorkoutEntry[], activity: Activity|null, planTicks: Record<string,boolean>, updatedAt }
WeightEntry  { id, kg, t, tags: string[], note }
FoodEntry    { id, t, meal: 'breakfast'|'lunch'|'dinner'|'snacks', name, kcal, protein?, carbs?, fat?, items: {name, portion, kcal, protein?, carbs?, fat?}[],
               source: 'photo'|'text'|'manual', photoPath?, note? }
WorkoutEntry { id, t, type (WORKOUT_TYPES id), name?, minutes, kcal, distanceKm?, avgHr?, steps?, note?,
               source: 'photo'|'manual'|'samsung-export'|'health-connect', countedInSamsung: boolean, photoPath? }
Activity     { steps?, activeKcal?, totalKcal?, activeMinutes?, distanceKm?, source: 'samsung-screenshot'|'samsung-export'|'health-connect'|'manual', syncedAt }
```
Firestore: `users/{uid}` = Profile, `users/{uid}/days/{YYYY-MM-DD}` = DayDoc. Storage: `users/{uid}/photos/{date}/{id}.jpg`.
Entries are cleaned on write (invalid → `addItem` throws; unknown fields dropped). `countedInSamsung: true` = calories already in
the day's active kcal, so they are NOT added again to burn.

### Hooks (re-render on change)
| Hook | Returns |
|---|---|
| `useProfile()` | `Profile \| null` |
| `useUnits()` | `Units` for the profile unit (see §5) |
| `useDay(key)` | `DayDoc` (stable empty doc when none) |
| `useDays()` | `Record<key, DayDoc>` |
| `useDayRange(from, to)` | `DayDoc[]` ascending, inclusive (missing → empty docs) |
| `useToday()` | today's key (updates at midnight) · `useMinute()` ticks every minute |
| `useBalance(key?)` | `calc.balance` for key (default today) — see §4 |
| `usePlan()` · `useAnalysis()` · `useDeficits(n=7)` · `useHeadlines()` · `useTodayActions(key?)` · `useCurrentKg()` | derived data (memoized per data version + minute) |
| `useSync()` | `'demo'\|'connecting'\|'cloud'\|'offline'\|'error'` · `useStore()` whole state (`{ready, profile, days, v, sync, uid, isAnonymous, email, syncError}`) · `useVersion()` |

Non-hook reads: `store.getState()`, `derived.balance(key)` etc. (same as hooks), `store.getDay(key)`, `store.dayKeys()`,
`store.allWeights() / allFoods() / allWorkouts()` (ascending by `t`), `store.recentFoods(limit=12)`, `store.findItem(kind, id)` → `{kind, key, item} | null`,
`store.profileComplete(p?)`.

### Mutations (`store.*`; persist locally at once, sync to Firestore debounced, last-writer-wins per day)
| Call | Notes |
|---|---|
| `setProfile(patch)` → Profile | shallow merge; creates profile if missing; theme switches live |
| `addItem(kind, item)` → item | `kind: 'weights'\|'foods'\|'workouts'`; day derived from `item.t`; id auto |
| `updateItem(kind, id, patch)` → item | moves days if `t` changes day |
| `removeItem(kind, id)` → `undo()` | pair with `toast('Deleted', {action:{label:'Undo', fn: undo}})` |
| `setActivity(key, activity\|null)` → `undo()` | replaces the day's activity |
| `setActivityBulk({key: activity}, {merge?})` → count | Samsung export / Health Connect multi-day |
| `addItemsBulk(kind, items)` → days touched | dedupes by `id` (give imports stable ids: `'sh-…'`, `'hc-…'`) |
| `setPlanTick(key, taskId, on)` | Today-plan checklist |
| `updateDay(key, fn)` | low-level: `fn(clone)` mutates a clone |
| `importDays(map, {replace?})` | JSON import / seed |
| `resetAll()` (async) · `exportJSON()` | wipe local + cloud · JSON string |

Haptics: call `tap('success')` after saves, `tap('warning')` on delete (from `@/components`).

## 4. `src/lib/calc.ts` (pure; faithful port of the web calc.js; `npm test`)
`age bmr bmrFor dayFraction bmrSoFar dailyWeights trendAt currentKg activeFor workoutsFor eatenFor hasActivity avgActive`
`equivalents(kcal,kg)→{kcal,treadmillMin,walkMin,runMin,steps,perMin,perStep}` · `kcalPerMin stepKcal WORKOUT_TYPES workoutType(idOrText) estimateWorkoutKcal(type,min,kg) MET BASELINE_ACTIVE`
`plan(profile,{currentKg,now,typicalBurn})→Plan` (dir, remainingKg, goalReached, targetDate, daysLeft, kgPerWeek, kcalPerDay, targetDeficit, budget, minKcal, tooFast, lowBudget, pastTarget, safe, safeKgPerWeek, safeDate, scenarios[relaxed|steady|ambitious], progress, changeKg)
`balance(profile,days,key,now)` → `{eaten, resting, bmr, active, activeEstimated, steps, activeAvg7, activeExpected, workouts, workoutsExcluded, burnSoFar, burnExpected, deficitSoFar, deficitExpected, targetDeficit, budget, rawBudget, left, over, overBy, belowFloor, budgetFloor, gain, protein, carbs, fat, foodCount, hasFood, hasActivity, kg, plan, isToday, isPast, isFuture}`
`todayActions(balance)→{eatUnder,left,overBy,burnToFix,extraBurnForTarget}` · `weightAnalysis(profile,days,now)` (series, current, latest, totalChange, progress, remaining, goalReached, weeks, lastWeek, thisWeek, bestWeek, change7, paceAll, pace4, projKey, projDays, scheduleDays, neededPace, streak, longest, best30, morningVsEvening, swing, daysSinceLog, milestones{weight,streaks,all,next}, toward(d), dir, unit, trendAt(k))
`milestones newlyCrossed deficitAnalysis(profile,days,now,n)→{days[{key,logged,partial,eaten,burn,budget,deficit,under,target}],completedCount,underCount,total,avg,expectedKg,actualKg,streakUnder,best,today,gain}`
`headlines(profile,days,now)→[{text, parts}]` — **parts alternate plain / emphasised** (odd index = bold): render `parts.map((s,i)=> <Txt style={i%2?bold:null}>{s}</Txt>)`.
BMI: `bmi(kg,cm)` · `bmiCategory(b)→{key,label,min,max}` (18.5/25/30) · `healthyWeightRange(cm)→{minKg,maxKg}` · `bmiForWeight` · `weightForBmi` · `BMI_CATS`.
Date helpers: `keyOf fromKey addDays diffDays weekStartKey isValidKey`, `LB`, `KCAL_PER_KG`.
Celebrations of newly crossed milestones are automatic (`CelebrationHost` in root) — screens only list milestones.

## 5. `src/lib/format.ts`
`todayKey() timeOn(key,'HH:MM')→ms hhmm(t) parseTime(s)→'HH:MM'|null fmtDate(k, withYear?) 'Nov 3' fmtDateLong 'Tuesday, November 3' fmtDateShort 'Tue, Nov 3' weekday(k,1|3) fmtTime(t) '7:05 PM' relDay(k) 'Today'|'Yesterday'|'Tue, Nov 3'`
`int(n) '1,420' fixed(n,d) signedInt '+120'/'−120' kcal(n) pct(x) minutes(m) '1 h 5 min' parseNum(s) plural(n,w) greeting() mealForTime(t) uid() clamp mean sum`
`MEALS`, `WEIGH_TAGS`. Every formatter returns '–' for non-finite input — never print NaN.
`makeUnits(unit)` / `useUnits()` → `{unit, to(kg), from(v), n(kg,d=1) '193.6', w(kg) '193.6 lb', abs(dKg), signed(dKg) '−4.6', dist(km) '3.3 mi', distUnit(), distTo(km), distFrom(v), height(cm) '5′ 10″', cmToFtIn(cm), ftInToCm(ft,in)}`.

## 6. AI — `src/lib/ai.ts` (Claude via callable `analyze`, us-central1, 120 s timeout)
```ts
const ctl = new AbortController();               // Cancel button → ctl.abort()
try {
  const img = await pickAndPrepare('camera');     // images.ts; null = cancelled
  if (!img) return;
  const r = await analyzeFoodPhoto(img, { signal: ctl.signal });  // FoodAiResult {items:[{name,portion,kcal,protein_g,carbs_g,fat_g}], total_kcal, confidence, notes}
  const photoPath = await savePhoto(img, dateKey);                 // upload the SAME resized image
  setDraft(foodDraft(r, { source: 'photo', meal, t, photoPath }));  // → editable review card, user confirms, then store.addItem('foods', draft)
} catch (e) {
  const err = e as AiError;                       // err.code, err.message = friendly copy
  if (err.code === 'cancelled') return;
  if (isFatal(err.code)) showManualForm();        // 'not-configured' (demo mode)
  toast(err.message, { tone: 'error' });
}
```
`analyzeFoodPhoto(img)`, `analyzeFoodText(text)`, `analyzeWorkoutPhoto(img)` → `WorkoutAiResult {type, start_time_iso|null, duration_min|null, kcal|null, distance_km|null, avg_hr|null, steps|null, notes, confidence}`,
`analyzeHealthScreenshot(img)` → `HealthAiResult {date_iso|null, steps|null, active_kcal|null, total_kcal|null, active_minutes|null, distance_km|null, confidence}`.
`img` = uri string, `PickedImage`, or `PreparedImage` (preferred). Helpers: `foodDraft(r, {source, meal?, t?, photoPath?})`, `workoutDraft(r, {photoPath?, fallbackT?})`, `activityDraft(r)→{date, activity}`.
`aiAvailable()` (false in demo mode → show `AI_UNAVAILABLE_TEXT` + manual form). Error codes: `not-configured unauthenticated invalid-argument resource-exhausted failed-precondition deadline-exceeded unavailable cancelled internal`.
Rules: results ALWAYS go to an editable review card before saving; show a "Thinking…" state with Cancel during the call (5–60 s); never call AI in loops.

## 7. Images — `src/lib/images.ts`
`pickImage('camera'|'library')→PickedImage|null` (throws `ImageError('permission')` with friendly copy) · `prepareImage(img, maxEdge=1568, compress=0.8)→PreparedImage {uri,width,height,base64,mediaType:'image/jpeg'}` ·
`pickAndPrepare(source)` · `savePhoto(prepared, dateKey)→photoPath` (Storage upload, or `local:` copy in demo mode) ·
`usePhotoURL(photoPath)→string|null|undefined` · `photoURL(path)` · `deletePhoto(path)` (call only when the entry is permanently gone, not on undo-able delete).
Display: `<Image source={{ uri }} cachePolicy="memory-disk" />` from `expo-image`, or `ListRow thumb={uri}`.

## 8. Health — `src/lib/health.ts` (Health Connect; Samsung Health syncs into it)
`healthSupported()` (sync; false in Expo Go / iOS / web) · `getHealthStatus()→'unsupported'|'not-installed'|'needs-update'|'available'` · `HEALTH_UNSUPPORTED_TEXT` ·
`requestHealthPermissions()→string[]` · `grantedHealthPermissions()` · `openHealthSettings()` ·
`readDay(key)→{date, steps, activeKcal, totalKcal, distanceKm, workouts: Partial<WorkoutEntry>[] (ids 'hc-…', countedInSamsung:true)}` · `healthDayToActivity(day)` · `readRecentDays(n)` · `readLatestWeight(days)`.
Typical sync: `const d = await readDay(k); const a = healthDayToActivity(d); if (a) store.setActivity(k, a); store.addItemsBulk('workouts', d.workouts)`.
Copy rule: be honest — "Samsung Health syncs into Health Connect. On other devices, import a screenshot or your data export."

## 9. CSV — `src/lib/csv.ts`
`pickTextFiles({multiple})→[{name,text}]` · `isUsefulSamsungFile(name)` · `parseSamsung(files)→{days:{key:Activity}, workouts, files:{steps,exercise,summary,skipped}, from, to}` (then `store.setActivityBulk(days,{merge:true})` + `store.addItemsBulk('workouts', workouts)`) ·
`toAppCSV(days)` / `parseAppCSV(text, unit)` (round-trip; also accepts `date,weight` logs) · `shareTextFile(name, text, mime='text/csv')` (share sheet on native, download on web) · `csvRows`, `parseTs`, `dayKeyOf`.

## 10. Theme — `src/theme`
`useTheme()` → `{c, dark, space, layout, radius, type, font, shadow(level)}`; `useColors()`. Colors (both themes): surfaces `bg surface surface2 elevated line lineStrong segOn scrim`, text `ink ink2 muted disabled`,
brand `brand brandHover brandTint onBrand brandGlow`, `teal tealFill tealTint amber amberFill amberTint danger dangerTint good goodTint`,
data `dEaten dRest dActive dWorkout dDeficit dSurplus dTrend dDot dGoal dProj dGrid dTrack`. Never hardcode hex in features.
Type variants (`<Txt variant>`): `hero 48/800 · display 36/800 · h1 28/700 · h2 20/700 · title 17/600 · body 15 · bodyStrong 15/600 · sm 13/500 · cap 12/600 · over 12/700 caps`; `num` prop = tabular figures.
Layout: `pageX 20 · cardPad 20 · gap 16 · sectionGap 32 · tabBarH 64 · primaryH 52 · hit 44`; radius `xs 8 · sm 12 (inputs) · md 16 (tiles) · lg 20 (cards) · xl 24 (sheets) · pill`.
Theme follows `profile.theme` (`store.setProfile({theme})`).

## 11. Components — `import { … } from '@/components'`
| Component | Props (main) |
|---|---|
| `Screen` | `tabs?` (pad for tab bar — use on tab screens), `header?`, `maxWidth=760`, `safeTop=true` (false under a native header), `static?`, `refreshControl?`. Children are spaced 32pt (section rhythm). |
| `PageHeader` | `over?, title, sub?, actions?` |
| `Section` / `SectionHeader` | `title, sub?, action?: {label,onPress} \| node` (+ children, 12pt gap) |
| `Card` / `CardHeader` | `tint?: 'brand'\|'teal'\|'amber', pad=20, gap=16, onPress?, elevated?, style` · `CardHeader {title, sub?, action?}` |
| `StatTile` / `StatRow` | `label, value, unit?, sub?, subTone?: 'good'\|'warn'\|'muted', dot?: color, icon?, inset?, onPress?` — max 2 per row |
| `ListRow` | `title, sub?, icon?, iconTone?, thumb?: uri, left?, value?, unit?, valueTone?, right?, chevron?, onPress?, onLongPress?, divider?, padX=16` (inside `Card pad={4} gap={0}`) |
| `Txt` | `variant, color?: token or color, num?, center?` + Text props |
| `Value` | big number + small unit: `n, unit?, size?: 'hero'\|'display'\|'h1'\|'h2'\|'title'` |
| `Icon` / `IconBubble` | `name: IconName, size?: 'xs'\|'sm'\|'md'\|'lg'\|'xl'\|number, color?` · `IconBubble {name, tone, size=40, solid?}` |
| `Button` | `label, onPress, variant: 'primary'(pill 52, ONE per screen)\|'secondary'\|'tonal'\|'ghost'\|'danger', size?: 'md'\|'sm', icon?, iconRight?, loading?, disabled?, block?` |
| `IconButton` | `icon, accessibilityLabel (required), onPress, filled?, tone?, size=44` |
| `Chip` / `ChipGroup` | `ChipGroup {options: (string\|{value,label,icon?})[], value, onChange, multi?, scroll?}` |
| `Segmented` | `options: {value,label,icon?}[], value, onChange, size?` |
| `TextField` / `NumberField` | `label, hint?, error?, optional?, suffix?, icon?, multiline?` + TextInput props · `NumberField {decimals=1}` (value is a string; parse with `parseNum`) |
| `Field`, `FieldRow` | label/hint/error shell for custom inputs · wrapping row |
| `DateStepper` | `value: key, onChange, label?, max? (default today; null = none), min?` |
| `TimeField` | `value: 'HH:MM', onChange, label?` |
| `Toggle` | `label, sub?, value, onChange` |
| `Badge` · `ProgressBar` · `Notice` · `EmptyState` · `Divider` · `Dot` | `Badge {text, tone, icon?}` · `ProgressBar {value 0..1, tone?, color?, label?, right?, height?}` · `Notice {tone, icon, title?, children}` · `EmptyState {icon, title, body?, action?, compact?}` |
| `Sheet` | in-screen modal sheet: `visible, onClose, title?, sub?, footer?, scroll=true` |
| `ModalSheetScreen` | root of a sheet ROUTE: `title?, sub?, footer?, scroll?, onClose?` |
| `toast(msg, {action?, duration?, tone?})` | undo pattern; `confirm({title, body?, ok?, cancel?, danger?}) → Promise<boolean>`; `celebrate({title, sub?, kind?})` |
| `tap(kind)` | haptics: `'light'\|'success'\|'warning'\|'select'` |
| `MultiRing` / `Ring` | `rings: {value 0..1, color, colorTo?, track?}[]` (outer first), `size, stroke, gap, glow?, endDot?, center?: node, accessibilityLabel` |
| `LineChart` | `dots?, line?: {key, y}[]` (DISPLAY units), `goal?, goalLabel?, projection?, projectionLabel?, domain?: {from,to}, height=240, yFmt, latestLabel?, tip?: key → {title, rows:[label,value][]} \| null, area?, emptyText?, accessibilityLabel` |
| `BarChart` | `bars: {label, value, highlight?, muted?, color?}[], reference?: {value, label?}, valueFmt, labels: 'auto'\|'all'\|'none', height=200, posColor?, negColor?, tip?(bar,i), onBarPress?` — positive = teal (deficit), negative = amber |
| `StackedBar` | `segments: {label, value, color}[], max?, legend=true, valueFmt, height` |
| `Sparkline` | `values, width=96, height=32, color?, area?` |
Charts are width-responsive (onLayout), 12pt labels, thinned ticks. Each chart gets a one-sentence takeaway title computed from data (put it in `CardHeader`).
Icons (`IconName`): `today food activity progress plan target profile plus minus close check chevron back down up trash edit camera image text form scale flame steps dumbbell heart rest moon sun system sparkle upload download info alert trophy clock calendar route phone sync cloud gear flag bolt more logo`.

## 12. Rules (from spec)
One focal point per screen; summaries first, details behind "See all"/sheets; ≤2 stat tiles per row on phones; text never collides
(`flex:1, minWidth:0` on text containers, `numberOfLines` where needed, numbers `num`). No emoji (use `Icon`). Dark mode must look
intentional — use tokens only. Every touch target ≥ 44pt and has an `accessibilityLabel`. Respect reduced motion (`prefersReducedMotion()`).
Verify with: `npx tsc --noEmit`, `npm test`, `npx expo export --platform android`, and a 390×844 web screenshot (light + dark).
