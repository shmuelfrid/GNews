// Real smoke test of the handler (no deploy). Needs ANTHROPIC_API_KEY in env and `npm run build` first.
// Usage: node scripts/smoke.mjs [path/to/health-screenshot.png] [path/to/food.jpg]
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Anthropic = require("@anthropic-ai/sdk").default;
const { handleAnalyze } = require("../lib/analyze.js");

const deps = { client: new Anthropic(), checkRateLimit: async () => {} };
const context = { unit: "lb", weightKg: 90, localDateISO: new Date().toISOString().slice(0, 10), timeZone: "UTC" };
const [shot, foodImg] = process.argv.slice(2);
const runs = [["food_text", { kind: "food_text", text: "2 scrambled eggs with butter, 2 slices of sourdough toast and a latte with whole milk", context }]];
if (shot) {
  const b64 = readFileSync(shot).toString("base64");
  runs.push(["health_screenshot", { kind: "health_screenshot", imageBase64: b64, context }]);
  runs.push(["workout_photo", { kind: "workout_photo", imageBase64: b64, context }]);
}
if (foodImg) runs.push(["food_photo", { kind: "food_photo", imageBase64: readFileSync(foodImg).toString("base64"), context }]);
for (const [name, data] of runs) {
  const t = Date.now();
  try {
    console.log(name, `${Date.now() - t}ms`, JSON.stringify(await handleAnalyze(data, "smoke-user", deps)));
  } catch (e) {
    console.log(name, "ERROR", e.code ?? "", e.message);
  }
}
