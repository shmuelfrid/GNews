import Anthropic from "@anthropic-ai/sdk";
import { HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { SPECS } from "./prompts";
import {
  FoodResultSchema,
  HealthResultSchema,
  RequestSchema,
  WorkoutResultSchema,
  type AnalyzeRequest,
  type AnalyzeResult,
  type Kind,
} from "./types";

export const MODEL = "claude-opus-5-5";
export const MAX_TOKENS = 4000;
/** Server-side refusal fallback ("default" scalar form) – see model-migration docs. */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** Minimal slice of the SDK client we use – lets tests inject a fake. */
export type AnthropicLike = {
  beta: { messages: { create: (body: Anthropic.Beta.MessageCreateParamsNonStreaming) => Promise<Anthropic.Beta.BetaMessage> } };
};

export interface Deps {
  client: AnthropicLike;
  /** Throws HttpsError('resource-exhausted') when over quota. */
  checkRateLimit: (uid: string) => Promise<void>;
}

const RESULT_SCHEMAS = {
  food_photo: FoodResultSchema,
  food_text: FoodResultSchema,
  workout_photo: WorkoutResultSchema,
  health_screenshot: HealthResultSchema,
} as const;

export function validateRequest(data: unknown): AnalyzeRequest {
  const parsed = RequestSchema.safeParse(data);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ` : "") + i.message).join("; ");
    throw new HttpsError("invalid-argument", msg.slice(0, 300));
  }
  const req = parsed.data;
  if (req.imageBase64) {
    req.imageBase64 = req.imageBase64.replace(/\s+/g, "");
    if (!req.mediaType) req.mediaType = sniffMediaType(req.imageBase64) ?? "image/jpeg";
  }
  return req;
}

/** Detect the real image type from base64 magic bytes (the API rejects mismatches). */
export function sniffMediaType(b64: string): AnalyzeRequest["mediaType"] | undefined {
  const head = Buffer.from(b64.slice(0, 24), "base64");
  if (head[0] === 0xff && head[1] === 0xd8) return "image/jpeg";
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return "image/png";
  if (head.subarray(0, 4).toString("ascii") === "RIFF" && head.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return undefined;
}

export function buildParams(req: AnalyzeRequest): Anthropic.Beta.MessageCreateParamsNonStreaming {
  const spec = SPECS[req.kind];
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (req.kind !== "food_text" && req.imageBase64) {
    const mediaType = sniffMediaType(req.imageBase64) ?? req.mediaType ?? "image/jpeg";
    content.push({ type: "image", source: { type: "base64", media_type: mediaType, data: req.imageBase64 } });
  }
  content.push({ type: "text", text: spec.userText({ text: req.text, context: req.context }) });
  return {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    system: spec.system,
    output_config: { effort: "low", format: { type: "json_schema", schema: spec.schema } },
    messages: [{ role: "user", content }],
  };
}

/** Text of the final answer: text blocks after the last `fallback` marker (if any). */
function finalText(msg: Anthropic.Beta.BetaMessage): string {
  const blocks = msg.content as Array<{ type: string; text?: string }>;
  let start = 0;
  blocks.forEach((b, i) => {
    if (b.type === "fallback") start = i + 1;
  });
  return blocks
    .slice(start)
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("");
}

function mapSdkError(err: unknown): HttpsError {
  if (err instanceof HttpsError) return err;
  if (err instanceof Anthropic.RateLimitError) return new HttpsError("resource-exhausted", "The AI service is busy. Try again in a minute.");
  if (err instanceof Anthropic.BadRequestError) {
    // Usually an unreadable/corrupt image or one that is too large for the API.
    return new HttpsError("failed-precondition", "The image couldn't be read. Try a clearer or smaller photo.");
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    logger.error("Anthropic auth/permission error – check the ANTHROPIC_API_KEY secret", { status: err.status });
    return new HttpsError("internal", "AI is not configured on the server.");
  }
  if (err instanceof Anthropic.APIConnectionError) return new HttpsError("unavailable", "Couldn't reach the AI service. Try again.");
  if (err instanceof Anthropic.APIError) {
    if (err.status === 529) return new HttpsError("resource-exhausted", "The AI service is busy. Try again in a minute.");
    return new HttpsError("internal", "The AI service had a problem. Try again.");
  }
  logger.error("Unexpected analyze error", { err: String(err) });
  return new HttpsError("internal", "Something went wrong analysing that. Try again.");
}

export function normalizeResult(kind: Kind, value: AnalyzeResult): AnalyzeResult {
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const clean = (n: number | null) => (n == null || !Number.isFinite(n) || n < 0 ? null : r1(n));
  if (kind === "food_photo" || kind === "food_text") {
    const f = value as import("./types").FoodResult;
    const items = f.items
      .map((it) => ({
        name: it.name.trim().slice(0, 120) || "Item",
        portion: it.portion.trim().slice(0, 80),
        kcal: Math.max(0, Math.round(it.kcal)),
        protein_g: Math.max(0, Math.round(it.protein_g)),
        carbs_g: Math.max(0, Math.round(it.carbs_g)),
        fat_g: Math.max(0, Math.round(it.fat_g)),
      }))
      .slice(0, 30);
    return { items, total_kcal: items.reduce((s, it) => s + it.kcal, 0), confidence: f.confidence, notes: f.notes.slice(0, 400) };
  }
  if (kind === "workout_photo") {
    const w = value as import("./types").WorkoutResult;
    return {
      ...w,
      duration_min: clean(w.duration_min),
      kcal: w.kcal == null ? null : clean(Math.round(w.kcal)),
      distance_km: w.distance_km == null ? null : Math.round(w.distance_km * 100) / 100,
      avg_hr: w.avg_hr == null ? null : clean(Math.round(w.avg_hr)),
      steps: w.steps == null ? null : clean(Math.round(w.steps)),
      notes: w.notes.slice(0, 400),
    };
  }
  const h = value as import("./types").HealthResult;
  return {
    ...h,
    date_iso: h.date_iso && /^\d{4}-\d{2}-\d{2}$/.test(h.date_iso) ? h.date_iso : null,
    steps: h.steps == null ? null : clean(Math.round(h.steps)),
    active_kcal: h.active_kcal == null ? null : clean(Math.round(h.active_kcal)),
    total_kcal: h.total_kcal == null ? null : clean(Math.round(h.total_kcal)),
    active_minutes: h.active_minutes == null ? null : clean(Math.round(h.active_minutes)),
    distance_km: h.distance_km == null ? null : Math.round(h.distance_km * 100) / 100,
  };
}

/** Core handler – pure apart from injected deps, so it is unit-testable and smoke-testable locally. */
export async function handleAnalyze(data: unknown, uid: string | undefined, deps: Deps): Promise<AnalyzeResult> {
  if (!uid) throw new HttpsError("unauthenticated", "Sign in to use AI features.");
  const req = validateRequest(data);
  await deps.checkRateLimit(uid);

  let msg: Anthropic.Beta.BetaMessage;
  const t0 = Date.now();
  try {
    msg = await deps.client.beta.messages.create(buildParams(req));
  } catch (err) {
    throw mapSdkError(err);
  }

  logger.info("analyze usage", {
    uid,
    kind: req.kind,
    model: msg.model,
    stop_reason: msg.stop_reason,
    ms: Date.now() - t0,
    input_tokens: msg.usage?.input_tokens,
    output_tokens: msg.usage?.output_tokens,
    iterations: (msg.usage as { iterations?: unknown } | undefined)?.iterations,
  });

  if (msg.stop_reason === "refusal") {
    throw new HttpsError("failed-precondition", "That image or text couldn't be analysed. Try a different photo or describe it in words.");
  }
  if (msg.stop_reason === "max_tokens") {
    throw new HttpsError("internal", "The answer was too long. Try a simpler photo or description.");
  }

  let json: unknown;
  try {
    json = JSON.parse(finalText(msg));
  } catch {
    throw new HttpsError("internal", "The AI returned an unreadable answer. Try again.");
  }
  const parsed = RESULT_SCHEMAS[req.kind].safeParse(json);
  if (!parsed.success) {
    logger.warn("analyze schema mismatch", { kind: req.kind, issues: parsed.error.issues.slice(0, 5) });
    throw new HttpsError("internal", "The AI returned an unexpected answer. Try again.");
  }
  return normalizeResult(req.kind, parsed.data);
}
