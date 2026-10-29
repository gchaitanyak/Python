import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp, type DocumentData } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { isPremium } from './rules';

if (getApps().length === 0) initializeApp();
// Here rather than index.ts: every function module imports this file first, so options apply to all of them.
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

export const db = getFirestore();
export const auth = getAuth();
export { FieldValue, Timestamp };

/**
 * Options for every callable. App Check (ARCHITECTURE §5.2) is enforced when the
 * project's functions/.env.<project> sets ENFORCE_APP_CHECK=true; the emulator and
 * tests leave it off. Read at load time because enforceAppCheck takes a plain boolean.
 */
export const callOptions = { enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true' } as const;

/** The caller's uid, or an `unauthenticated` error. */
export function requireUid(request: CallableRequest<unknown>): string {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to save your progress.');
  return uid;
}

export const userRef = (uid: string) => db.collection('users').doc(uid);
export const progressRef = (uid: string, lessonId: string) => userRef(uid).collection('progress').doc(lessonId);

export function userIsPremium(user: DocumentData | undefined, nowMs: number): boolean {
  const until = user?.premiumUntil;
  const premiumUntilMs = until instanceof Timestamp ? until.toMillis() : until == null ? null : 0;
  return isPremium({ entitlement: user?.entitlement, premiumUntilMs }, nowMs);
}

/** Public name on leaderboards: the username, never the email. */
export const displayName = (uid: string, user: DocumentData | undefined): string =>
  typeof user?.username === 'string' ? user.username : `learner_${uid.slice(0, 6).toLowerCase()}`;

/**
 * Fixed-window rate limit per user per function (ARCHITECTURE §5.2).
 * Throws `resource-exhausted` once `limit` calls are made inside one minute.
 */
export async function rateLimit(uid: string, fn: string, limit: number, nowMs = Date.now()): Promise<void> {
  const ref = db.collection('rateLimits').doc(`${uid}_${fn}`);
  const allowed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();
    const windowStart = typeof data?.windowStart === 'number' && nowMs - data.windowStart < 60_000 ? data.windowStart : nowMs;
    const count = windowStart === data?.windowStart ? (data.count as number) : 0;
    if (count >= limit) return false;
    tx.set(ref, { windowStart, count: count + 1 });
    return true;
  });
  if (!allowed) throw new HttpsError('resource-exhausted', 'Too many requests — slow down a little and try again.');
}
