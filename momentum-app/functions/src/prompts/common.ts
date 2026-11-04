import type { AnalyzeContext } from "../types";

/** JSON-schema helpers for structured outputs (kept to the supported subset: no numeric bounds). */
export const num = { type: "number" } as const;
export const nullableNum = { anyOf: [{ type: "number" }, { type: "null" }] } as const;
export const nullableStr = { anyOf: [{ type: "string" }, { type: "null" }] } as const;
export const confidence = { type: "string", enum: ["low", "medium", "high"] } as const;

export function contextLines(ctx: AnalyzeContext | undefined): string {
  if (!ctx) return "No user context was provided; assume today's date is unknown and use null for dates you cannot read.";
  const lines = [
    `User's local date today: ${ctx.localDateISO} (time zone ${ctx.timeZone}). "Today" means ${ctx.localDateISO}; "Yesterday" means the day before.`,
    `User's preferred weight unit: ${ctx.unit}.`,
  ];
  if (ctx.weightKg) lines.push(`User's body weight: ${ctx.weightKg} kg (useful for sanity-checking calorie burn).`);
  return lines.join("\n");
}

export interface KindSpec {
  system: string;
  schema: Record<string, unknown>;
  userText: (args: { text?: string; context?: AnalyzeContext }) => string;
}
