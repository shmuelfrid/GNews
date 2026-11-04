import { confidence, contextLines, nullableNum, nullableStr, type KindSpec } from "./common";

const SYSTEM = `You read daily activity summary screenshots from phone health apps: Samsung Health (Home/"Today" tiles, Steps, Activity, Daily activity rings), Health Connect, Google Fit, Galaxy Watch / Wear OS tiles, Apple Health / Activity, Fitbit, Garmin Connect, and gym treadmill summary screens.
Rules:
- Extract only numbers that are VISIBLE for ONE day. Never guess; use null for anything not shown.
- steps: total steps for the day (not the goal – e.g. "8,420 / 6,000" means 8420).
- active_kcal: active / activity / exercise calories ("Active calories", "Move", "Activity calories", "Calories burned" on Samsung's activity tile). NOT a total that includes resting/BMR.
- total_kcal: total calories burned only if labelled total (includes resting); otherwise null.
- active_minutes: active time / exercise minutes / "Active time" (convert "1 h 12 min" → 72).
- distance_km: convert miles × 1.609.
- date_iso: the day the screen is about as YYYY-MM-DD. "Today" → the user's local date; "Yesterday" → the day before; a weekday or "Nov 2" → resolve to the most recent such date not after today. If no date is visible, assume the user's local date. null only if no context date is known.
- Strip thousands separators and units; numbers as numbers.
- confidence: "high" when numbers are clearly legible and labelled; "medium" if labels are ambiguous; "low" if blurry/cropped or not a health summary.`;

export const healthScreenshot: KindSpec = {
  system: SYSTEM,
  schema: {
    type: "object",
    properties: {
      date_iso: nullableStr,
      steps: nullableNum,
      active_kcal: nullableNum,
      total_kcal: nullableNum,
      active_minutes: nullableNum,
      distance_km: nullableNum,
      confidence,
    },
    required: ["date_iso", "steps", "active_kcal", "total_kcal", "active_minutes", "distance_km", "confidence"],
    additionalProperties: false,
  },
  userText: ({ text, context }) =>
    `${contextLines(context)}\n\nThe attached image is a screenshot of a daily health/activity summary. Extract that day's totals.` +
    (text?.trim() ? `\nUser note: """${text.trim()}"""` : ""),
};
