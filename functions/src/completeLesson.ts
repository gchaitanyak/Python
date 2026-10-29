import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { recordActivity } from './lib/activity';
import { db, progressRef, rateLimit, requireUid, Timestamp, userIsPremium, userRef } from './lib/admin';
import { now as clockNow } from './lib/clock';
import { findPlaced, nextLessonId } from './lib/content';
import { currentStreak, lessonAccess, previousLessonId } from './lib/rules';

/**
 * Marks a lesson complete: keeps the best accuracy, updates last-practised,
 * and extends the streak (consecutive local days with a completed lesson or challenge).
 */
export const completeLesson = onCall(async (request) => {
  const uid = requireUid(request);
  const d = (request.data ?? {}) as Record<string, unknown>;
  if (typeof d.lessonId !== 'string' || typeof d.accuracy !== 'number' || !Number.isFinite(d.accuracy)) {
    throw new HttpsError('invalid-argument', 'lessonId and accuracy are required.');
  }
  const lessonId = d.lessonId;
  const accuracy = Math.round(Math.min(100, Math.max(0, d.accuracy)));
  await rateLimit(uid, 'completeLesson', 20);

  const placed = findPlaced(lessonId);
  const now = await clockNow();
  const prevId = placed ? previousLessonId(placed) : undefined;

  return db.runTransaction(async (tx) => {
    const [userSnap, progressSnap, prevSnap] = await Promise.all([
      tx.get(userRef(uid)),
      tx.get(progressRef(uid, lessonId)),
      prevId ? tx.get(progressRef(uid, prevId)) : Promise.resolve(undefined),
    ]);
    const user = userSnap.data();
    const access = lessonAccess(placed, userIsPremium(user, now.getTime()), !prevId || prevSnap?.data()?.completed === true);
    if (access !== 'open') throw new HttpsError(access === 'finish-previous' ? 'failed-precondition' : 'permission-denied', 'This lesson is locked.');

    const prevBest = progressSnap.data()?.bestAccuracy;
    const bestAccuracy = Math.max(typeof prevBest === 'number' ? prevBest : 0, accuracy);
    tx.set(
      progressRef(uid, lessonId),
      { completed: true, bestAccuracy, lastAccuracy: accuracy, lastPractisedAt: Timestamp.fromDate(now) },
      { merge: true },
    );

    const streak = recordActivity(tx, uid, user, now);
    return { streak: currentStreak(streak, streak.lastDay!), bestAccuracy, nextLessonId: nextLessonId(lessonId) };
  });
});
