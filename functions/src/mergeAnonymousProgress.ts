import { onCall } from 'firebase-functions/v2/https';
import { callOptions, db, FieldValue, progressRef, rateLimit, requireUid, Timestamp, userRef } from './lib/admin';
import { curriculum } from './lib/content';
import { sanitiseMerge } from './lib/rules';

/**
 * Copies anonymous (localStorage) completion into the account, once per
 * account. Only free lessons; points aren't transferred because they were
 * never checked by the server.
 */
export const mergeAnonymousProgress = onCall(callOptions, async (request) => {
  const uid = requireUid(request);
  await rateLimit(uid, 'mergeAnonymousProgress', 5);
  const entries = sanitiseMerge((request.data as { progress?: unknown } | null)?.progress, curriculum, Date.now());

  return db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef(uid));
    if (userSnap.data()?.mergedAnonymousAt) return { merged: 0, alreadyMerged: true };
    const existing = await Promise.all(entries.map((e) => tx.get(progressRef(uid, e.lessonId))));
    entries.forEach((e, i) => {
      const prev = existing[i]!.data();
      const prevMs = prev?.lastPractisedAt instanceof Timestamp ? prev.lastPractisedAt.toMillis() : 0;
      tx.set(
        progressRef(uid, e.lessonId),
        {
          completed: true,
          bestAccuracy: Math.max(typeof prev?.bestAccuracy === 'number' ? prev.bestAccuracy : 0, e.bestAccuracy),
          lastPractisedAt: Timestamp.fromMillis(Math.max(prevMs, e.lastPractisedAtMs)),
        },
        { merge: true },
      );
    });
    tx.set(userRef(uid), { mergedAnonymousAt: FieldValue.serverTimestamp() }, { merge: true });
    return { merged: entries.length, alreadyMerged: false };
  });
});
