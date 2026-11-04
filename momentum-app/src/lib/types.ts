/* Momentum — shared data types. Canonical units: kg, kcal, cm, km; timestamps ms; dates local 'YYYY-MM-DD'. */

export type Unit = 'lb' | 'kg';
export type ThemePref = 'system' | 'light' | 'dark';
export type Sex = 'male' | 'female';
export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snacks';
export type WorkoutTypeId =
  | 'treadmill_walk' | 'treadmill_run' | 'walk' | 'run' | 'cycling' | 'strength' | 'swim' | 'hiit' | 'yoga' | 'other';

export interface Profile {
  name?: string;
  sex?: Sex;
  birthYear?: number;
  heightCm?: number;
  unit: Unit;
  theme?: ThemePref;
  startKg?: number;
  startDate?: string;
  goalKg?: number;
  targetDate?: string | null;
  paceKgPerWeek?: number;
  stepGoal?: number;
  waistCm?: number;
  activityBaseline?: 'low' | 'some' | 'high' | string;
  celebrated: string[];
  createdAt?: number;
  updatedAt?: number;
}

export interface WeightEntry { id: string; kg: number; t: number; tags: string[]; note: string }

export interface FoodItem { name: string; portion: string; kcal: number; protein?: number; carbs?: number; fat?: number }

export interface FoodEntry {
  id: string; t: number; meal: Meal; name: string; kcal: number;
  protein?: number; carbs?: number; fat?: number;
  items: FoodItem[];
  source: 'photo' | 'text' | 'manual';
  /** Firebase Storage path (users/{uid}/photos/...) or 'local:<file uri>' in demo mode. Resolve with photoURL(). */
  photoPath?: string;
  note?: string;
}

export interface WorkoutEntry {
  id: string; t: number; type: WorkoutTypeId | string; name?: string; minutes: number; kcal: number;
  distanceKm?: number; avgHr?: number; steps?: number; note?: string;
  source: 'photo' | 'manual' | 'samsung-export' | 'health-connect';
  countedInSamsung: boolean;
  photoPath?: string;
}

export type ActivitySource = 'samsung-screenshot' | 'samsung-export' | 'health-connect' | 'manual';
export interface Activity {
  steps?: number; activeKcal?: number; totalKcal?: number; activeMinutes?: number; distanceKm?: number;
  source: ActivitySource; syncedAt: number;
}

export interface DayDoc {
  date: string;
  weights: WeightEntry[];
  foods: FoodEntry[];
  workouts: WorkoutEntry[];
  activity: Activity | null;
  /** Today-plan checklist ticks: { eat: true, steps: false, ... } */
  planTicks: Record<string, boolean>;
  updatedAt: number;
}

export type Days = Record<string, DayDoc>;
export type ItemKind = 'weights' | 'foods' | 'workouts';
export type ItemOf<K extends ItemKind> = K extends 'weights' ? WeightEntry : K extends 'foods' ? FoodEntry : WorkoutEntry;
