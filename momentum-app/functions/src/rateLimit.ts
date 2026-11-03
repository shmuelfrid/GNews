import type { Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

export const AI_CALLS_PER_HOUR = 60;
const WINDOW_MS = 60 * 60 * 1000;

export interface Counter {
  windowStart: number;
  count: number;
}

/** Pure decision: returns the next counter state, or null when over the limit. */
export function nextCounter(prev: Counter | undefined, now: number, limit = AI_CALLS_PER_HOUR): Counter | null {
  if (!prev || typeof prev.windowStart !== "number" || now - prev.windowStart >= WINDOW_MS) return { windowStart: now, count: 1 };
  if ((prev.count ?? 0) >= limit) return null;
  return { windowStart: prev.windowStart, count: (prev.count ?? 0) + 1 };
}

/** Fixed-window per-user counter at users/{uid}/meta/ai (clients cannot write it – see firestore.rules). */
export function firestoreRateLimiter(db: () => Firestore, limit = AI_CALLS_PER_HOUR) {
  return async (uid: string): Promise<void> => {
    const ref = db().doc(`users/${uid}/meta/ai`);
    const ok = await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const next = nextCounter(snap.exists ? (snap.data() as Counter) : undefined, Date.now(), limit);
      if (!next) return false;
      tx.set(ref, { ...next, updatedAt: Date.now() }, { merge: true });
      return true;
    });
    if (!ok) throw new HttpsError("resource-exhausted", `You've used AI ${limit} times this hour. Try again a bit later.`);
  };
}
