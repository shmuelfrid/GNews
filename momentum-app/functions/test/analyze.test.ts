import Anthropic from "@anthropic-ai/sdk";
import { HttpsError } from "firebase-functions/v2/https";
import { describe, expect, it, vi } from "vitest";
import { FALLBACK_BETA, MODEL, handleAnalyze, sniffMediaType, type AnthropicLike, type Deps } from "../src/analyze";
import { nextCounter, AI_CALLS_PER_HOUR } from "../src/rateLimit";
import { MAX_BASE64_CHARS } from "../src/types";

// 1x1 PNG
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]).toString("base64");
const ctx = { unit: "lb" as const, weightKg: 90, localDateISO: "2026-11-03", timeZone: "America/New_York" };

function msg(json: unknown, extra: Partial<Anthropic.Beta.BetaMessage> = {}): Anthropic.Beta.BetaMessage {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: MODEL,
    content: [{ type: "text", text: JSON.stringify(json), citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 50 },
    ...extra,
  } as unknown as Anthropic.Beta.BetaMessage;
}

function deps(response: Anthropic.Beta.BetaMessage | Error, rate: Deps["checkRateLimit"] = async () => {}) {
  const create = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  const client: AnthropicLike = { beta: { messages: { create } } };
  return { d: { client, checkRateLimit: rate } as Deps, create };
}

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(HttpsError);
    return (e as HttpsError).code;
  }
  throw new Error("expected rejection");
}

const food = {
  items: [
    { name: "Grilled chicken", portion: "6 oz", kcal: 280.4, protein_g: 52.2, carbs_g: 0, fat_g: 6 },
    { name: "White rice", portion: "1 cup", kcal: 205, protein_g: 4, carbs_g: 45, fat_g: 0 },
  ],
  total_kcal: 999,
  confidence: "medium",
  notes: "Assumed no sauce",
};

describe("analyze – kinds", () => {
  it("food_text: builds request and normalises result", async () => {
    const { d, create } = deps(msg(food));
    const r = await handleAnalyze({ kind: "food_text", text: "chicken and rice", context: ctx }, "u1", d);
    expect(r).toEqual({
      items: [
        { name: "Grilled chicken", portion: "6 oz", kcal: 280, protein_g: 52, carbs_g: 0, fat_g: 6 },
        { name: "White rice", portion: "1 cup", kcal: 205, protein_g: 4, carbs_g: 45, fat_g: 0 },
      ],
      total_kcal: 485,
      confidence: "medium",
      notes: "Assumed no sauce",
    });
    const body = create.mock.calls[0]![0] as any;
    expect(body.model).toBe("claude-opus-5-5");
    expect(body.max_tokens).toBe(4000);
    expect(body.betas).toEqual([FALLBACK_BETA]);
    expect(body.fallbacks).toBe("default");
    expect(body.output_config.effort).toBe("low");
    expect(body.output_config.format.type).toBe("json_schema");
    expect(body.messages[0].content).toHaveLength(1);
    expect(body.messages[0].content[0].text).toContain("chicken and rice");
    expect(body.messages[0].content[0].text).toContain("2026-11-03");
  });

  it("food_photo: image block before text, media type sniffed", async () => {
    const { d, create } = deps(msg(food));
    await handleAnalyze({ kind: "food_photo", imageBase64: PNG, mediaType: "image/jpeg", context: ctx }, "u1", d);
    const content = (create.mock.calls[0]![0] as any).messages[0].content;
    expect(content[0].type).toBe("image");
    expect(content[0].source).toMatchObject({ type: "base64", media_type: "image/png", data: PNG });
    expect(content[1].type).toBe("text");
  });

  it("workout_photo", async () => {
    const w = { type: "treadmill_walk", start_time_iso: "2026-11-03T07:10:00", duration_min: 35.2, kcal: 310.6, distance_km: 3.333, avg_hr: 128, steps: null, notes: "5% incline", confidence: "high" };
    const { d } = deps(msg(w));
    const r = await handleAnalyze({ kind: "workout_photo", imageBase64: JPEG, context: ctx }, "u1", d);
    expect(r).toEqual({ ...w, kcal: 311, distance_km: 3.33 });
  });

  it("health_screenshot", async () => {
    const h = { date_iso: "2026-11-03", steps: 8420, active_kcal: 380, total_kcal: null, active_minutes: 62, distance_km: 6.1, confidence: "high" };
    const { d, create } = deps(msg(h));
    const r = await handleAnalyze({ kind: "health_screenshot", imageBase64: PNG, context: ctx }, "u1", d);
    expect(r).toEqual(h);
    expect((create.mock.calls[0]![0] as any).system).toContain("Samsung Health");
  });

  it("uses text after a fallback block", async () => {
    const h = { date_iso: null, steps: 100, active_kcal: null, total_kcal: null, active_minutes: null, distance_km: null, confidence: "low" };
    const m = msg(h);
    (m as any).content = [{ type: "fallback", from: { model: MODEL }, to: { model: "x" } }, ...(m.content as any)];
    const { d } = deps(m);
    expect(await handleAnalyze({ kind: "health_screenshot", imageBase64: PNG }, "u1", d)).toEqual(h);
  });
});

describe("analyze – validation & errors", () => {
  it("requires auth", async () => {
    const { d, create } = deps(msg(food));
    expect(await code(handleAnalyze({ kind: "food_text", text: "x" }, undefined, d))).toBe("unauthenticated");
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    [{ kind: "nope" }],
    [{ kind: "food_text" }],
    [{ kind: "food_text", text: "   " }],
    [{ kind: "food_photo" }],
    [{ kind: "health_screenshot", imageBase64: "data:image/png;base64,AAA" }],
    [{ kind: "food_photo", imageBase64: PNG, mediaType: "image/gif" }],
    [{ kind: "food_text", text: "x", context: { unit: "st", localDateISO: "2026-11-03", timeZone: "UTC" } }],
    [{ kind: "food_text", text: "x".repeat(2001) }],
    [null],
  ])("invalid-argument for %j", async (data) => {
    const { d, create } = deps(msg(food));
    expect(await code(handleAnalyze(data, "u1", d))).toBe("invalid-argument");
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects images over the size limit", async () => {
    const { d } = deps(msg(food));
    expect(await code(handleAnalyze({ kind: "food_photo", imageBase64: "A".repeat(MAX_BASE64_CHARS + 4) }, "u1", d))).toBe("invalid-argument");
  });

  it("refusal -> failed-precondition", async () => {
    const { d } = deps(msg({}, { stop_reason: "refusal", content: [] } as any));
    expect(await code(handleAnalyze({ kind: "food_photo", imageBase64: PNG }, "u1", d))).toBe("failed-precondition");
  });

  it("max_tokens / bad JSON / wrong shape -> internal", async () => {
    expect(await code(handleAnalyze({ kind: "food_text", text: "x" }, "u1", deps(msg(food, { stop_reason: "max_tokens" })).d))).toBe("internal");
    const bad = msg(food);
    (bad as any).content = [{ type: "text", text: "not json" }];
    expect(await code(handleAnalyze({ kind: "food_text", text: "x" }, "u1", deps(bad).d))).toBe("internal");
    expect(await code(handleAnalyze({ kind: "food_text", text: "x" }, "u1", deps(msg({ items: "x" })).d))).toBe("internal");
  });

  it("rate limiter rejection -> resource-exhausted, no API call", async () => {
    const { d, create } = deps(msg(food), async () => {
      throw new HttpsError("resource-exhausted", "slow down");
    });
    expect(await code(handleAnalyze({ kind: "food_text", text: "x" }, "u1", d))).toBe("resource-exhausted");
    expect(create).not.toHaveBeenCalled();
  });

  it("maps SDK errors", async () => {
    const h = new Headers();
    const cases: Array<[Error, string]> = [
      [new Anthropic.RateLimitError(429, { type: "error" }, "rl", h), "resource-exhausted"],
      [new Anthropic.BadRequestError(400, { type: "error" }, "bad image", h), "failed-precondition"],
      [new Anthropic.AuthenticationError(401, { type: "error" }, "auth", h), "internal"],
      [new Anthropic.InternalServerError(500, { type: "error" }, "boom", h), "internal"],
      [new Anthropic.APIConnectionError({ message: "down" }), "unavailable"],
      [new Error("weird"), "internal"],
    ];
    for (const [err, c] of cases) {
      expect(await code(handleAnalyze({ kind: "food_text", text: "x" }, "u1", deps(err).d))).toBe(c);
    }
  });
});

describe("helpers", () => {
  it("sniffMediaType", () => {
    expect(sniffMediaType(PNG)).toBe("image/png");
    expect(sniffMediaType(JPEG)).toBe("image/jpeg");
    expect(sniffMediaType(Buffer.from("RIFF\0\0\0\0WEBPVP8 ").toString("base64"))).toBe("image/webp");
  });

  it("nextCounter windows and limits", () => {
    const now = 1_000_000_000;
    expect(nextCounter(undefined, now)).toEqual({ windowStart: now, count: 1 });
    expect(nextCounter({ windowStart: now, count: 5 }, now + 10)).toEqual({ windowStart: now, count: 6 });
    expect(nextCounter({ windowStart: now, count: AI_CALLS_PER_HOUR }, now + 10)).toBeNull();
    expect(nextCounter({ windowStart: now, count: AI_CALLS_PER_HOUR }, now + 3_600_000)).toEqual({ windowStart: now + 3_600_000, count: 1 });
  });
});
