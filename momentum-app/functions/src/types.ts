import { z } from "zod";

export const KINDS = ["food_photo", "food_text", "workout_photo", "health_screenshot"] as const;
export type Kind = (typeof KINDS)[number];

export const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

/** ~8 MB of base64 text (≈6 MB of image bytes). */
export const MAX_BASE64_CHARS = 8 * 1024 * 1024;
export const MAX_TEXT_CHARS = 2000;

export const ContextSchema = z.object({
  unit: z.enum(["lb", "kg"]),
  weightKg: z.number().positive().max(700).optional(),
  localDateISO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeZone: z.string().min(1).max(64),
});
export type AnalyzeContext = z.infer<typeof ContextSchema>;

export const RequestSchema = z
  .object({
    kind: z.enum(KINDS),
    text: z.string().max(MAX_TEXT_CHARS).optional(),
    imageBase64: z
      .string()
      .max(MAX_BASE64_CHARS, "image too large")
      .regex(/^[A-Za-z0-9+/=\r\n]+$/, "imageBase64 must be plain base64 (no data: prefix)")
      .optional(),
    mediaType: z.enum(MEDIA_TYPES).optional(),
    context: ContextSchema.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "food_text") {
      if (!v.text || !v.text.trim()) ctx.addIssue({ code: "custom", message: "text is required for food_text" });
    } else if (!v.imageBase64) {
      ctx.addIssue({ code: "custom", message: `imageBase64 is required for ${v.kind}` });
    }
  });
export type AnalyzeRequest = z.infer<typeof RequestSchema>;

const Confidence = z.enum(["low", "medium", "high"]);
const nnum = z.number().nullable();

export const FoodResultSchema = z.object({
  items: z.array(
    z.object({
      name: z.string(),
      portion: z.string(),
      kcal: z.number(),
      protein_g: z.number(),
      carbs_g: z.number(),
      fat_g: z.number(),
    }),
  ),
  total_kcal: z.number(),
  confidence: Confidence,
  notes: z.string(),
});
export type FoodResult = z.infer<typeof FoodResultSchema>;

export const WorkoutResultSchema = z.object({
  type: z.string(),
  start_time_iso: z.string().nullable(),
  duration_min: nnum,
  kcal: nnum,
  distance_km: nnum,
  avg_hr: nnum,
  steps: nnum,
  notes: z.string(),
  confidence: Confidence,
});
export type WorkoutResult = z.infer<typeof WorkoutResultSchema>;

export const HealthResultSchema = z.object({
  date_iso: z.string().nullable(),
  steps: nnum,
  active_kcal: nnum,
  total_kcal: nnum,
  active_minutes: nnum,
  distance_km: nnum,
  confidence: Confidence,
});
export type HealthResult = z.infer<typeof HealthResultSchema>;

export type AnalyzeResult = FoodResult | WorkoutResult | HealthResult;
