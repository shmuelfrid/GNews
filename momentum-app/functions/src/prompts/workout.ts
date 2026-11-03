import { confidence, contextLines, nullableNum, nullableStr, type KindSpec } from "./common";

export const WORKOUT_TYPES = ["treadmill_walk", "treadmill_run", "walk", "run", "cycling", "strength", "swim", "hiit", "yoga", "other"];

const SYSTEM = `You read workout summary screens: smartwatch and phone fitness apps (Samsung Health, Galaxy Watch, Apple Fitness, Garmin, Fitbit, Strava, Google Fit / Health Connect) and gym machine consoles (treadmill, bike, elliptical, rower).
Rules:
- Extract only values that are VISIBLE. Never invent numbers; use null for anything not shown.
- type: one of ${WORKOUT_TYPES.join(", ")}. A treadmill console showing pace under ~9 km/h (5.5 mph) is treadmill_walk, faster is treadmill_run. Elliptical/rower/stair machines → "other" unless clearly HIIT.
- Convert units: duration to minutes (e.g. 35:12 → 35.2), distance to kilometres (1 mi = 1.609 km), energy to kcal (1 kJ = 0.239 kcal). Prefer "active"/"workout" calories over "total" when both are shown.
- start_time_iso: the session start as ISO 8601 local date-time without offset (e.g. "2026-11-03T07:15:00") if a date/time is visible; resolve relative words like "Today"/"Yesterday" using the user's local date. If only a time is shown, assume the user's local date. null if nothing is shown.
- avg_hr in bpm; steps only if shown.
- notes: one short line with other useful visible details (pace, incline, max HR, laps). confidence: honest – "low" if the screen is blurry, cropped, or not a workout summary.`;

export const workoutPhoto: KindSpec = {
  system: SYSTEM,
  schema: {
    type: "object",
    properties: {
      type: { type: "string", enum: WORKOUT_TYPES },
      start_time_iso: nullableStr,
      duration_min: nullableNum,
      kcal: nullableNum,
      distance_km: nullableNum,
      avg_hr: nullableNum,
      steps: nullableNum,
      notes: { type: "string" },
      confidence,
    },
    required: ["type", "start_time_iso", "duration_min", "kcal", "distance_km", "avg_hr", "steps", "notes", "confidence"],
    additionalProperties: false,
  },
  userText: ({ text, context }) =>
    `${contextLines(context)}\n\nThe attached image is a photo or screenshot of a workout summary. Extract the session.` +
    (text?.trim() ? `\nUser note: """${text.trim()}"""` : ""),
};
