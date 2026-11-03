import Anthropic from "@anthropic-ai/sdk";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { onCall } from "firebase-functions/v2/https";
import { handleAnalyze } from "./analyze";
import { firestoreRateLimiter } from "./rateLimit";

initializeApp();

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const checkRateLimit = firestoreRateLimiter(() => getFirestore());
let client: Anthropic | undefined;

export const analyze = onCall(
  {
    region: "us-central1",
    secrets: [ANTHROPIC_API_KEY],
    memory: "512MiB",
    timeoutSeconds: 120,
    maxInstances: 10,
    cors: true,
  },
  async (request) => {
    client ??= new Anthropic({ apiKey: ANTHROPIC_API_KEY.value(), maxRetries: 2, timeout: 100_000 });
    return handleAnalyze(request.data, request.auth?.uid, { client, checkRateLimit });
  },
);
