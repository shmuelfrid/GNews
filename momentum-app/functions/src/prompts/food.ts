import { confidence, contextLines, num, type KindSpec } from "./common";

const SYSTEM = `You are a careful nutrition estimator inside a calorie-tracking app.
Rules:
- Split the meal into distinct items (e.g. "Grilled chicken", "White rice", "Caesar dressing"). Include cooking oils, sauces, dressings, butter and drinks when they are visible or implied; they are the most commonly missed calories.
- Estimate realistic portions as actually served (restaurant and home portions, not tiny label "serving sizes"). Use visual cues: plate/bowl size (a dinner plate is ~26 cm), utensils, hands, packaging, cans and cups. Write the portion in human terms ("1 cup", "6 oz / 170 g", "2 slices", "1 medium").
- Give kcal, protein_g, carbs_g and fat_g for EVERY item as numbers (never strings or ranges). Round kcal to the nearest 5 and grams to whole numbers. Macros should roughly agree with kcal (4/4/9 kcal per g).
- total_kcal must equal the sum of item kcal.
- If a nutrition label, menu calorie count or barcode panel is readable, use those numbers and say so in notes.
- confidence: "high" only when portions and items are clear (or a label is readable); "medium" for typical meals with some guessing; "low" when the image is unclear, the portion is ambiguous, or hidden ingredients dominate. Be honest.
- notes: one short sentence on key assumptions (e.g. "Assumed 1 tbsp olive oil; no dressing visible"). 
- If there is no food or drink, return items: [], total_kcal: 0, confidence "low" and explain in notes.`;

export const foodSchema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, portion: { type: "string" }, kcal: num, protein_g: num, carbs_g: num, fat_g: num },
        required: ["name", "portion", "kcal", "protein_g", "carbs_g", "fat_g"],
        additionalProperties: false,
      },
    },
    total_kcal: num,
    confidence,
    notes: { type: "string" },
  },
  required: ["items", "total_kcal", "confidence", "notes"],
  additionalProperties: false,
};

export const foodPhoto: KindSpec = {
  system: SYSTEM,
  schema: foodSchema,
  userText: ({ text, context }) =>
    `${contextLines(context)}\n\nThe attached photo shows food or drink the user is about to eat. Identify each item, estimate its portion and nutrition.` +
    (text?.trim() ? `\nThe user added this note (trust it over the photo for things like quantity or ingredients):\n"""\n${text.trim()}\n"""` : ""),
};

export const foodText: KindSpec = {
  system: SYSTEM,
  schema: foodSchema,
  userText: ({ text, context }) =>
    `${contextLines(context)}\n\nThe user described what they ate:\n"""\n${(text ?? "").trim()}\n"""\nSplit it into items. When a quantity is not stated assume a typical portion and say so in the portion text. Use brand/restaurant nutrition if a specific product or chain is named.`,
};
