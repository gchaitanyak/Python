import type { DocumentData, Transaction } from 'firebase-admin/firestore';
import { db, displayName, FieldValue, userRef } from './admin';
import { localDay, nextStreak, utcDay, type Streak } from './rules';

/**
 * Counts today towards the streak (a completed lesson or daily challenge, SPEC §5.2)
 * and makes sure today's leaderboard row exists with the current streak.
 * Writes only, so it can run after a transaction's reads.
 */
export function recordActivity(tx: Transaction, uid: string, user: DocumentData | undefined, now: Date): Streak {
  const streak = nextStreak(user?.streak as Streak | undefined, localDay(now, user?.tz ?? 'UTC'));
  const day = utcDay(now);
  tx.set(userRef(uid), { streak, scoreDays: FieldValue.arrayUnion(day) }, { merge: true });
  tx.set(
    db.doc(`dailyScores/${day}/users/${uid}`),
    { username: displayName(uid, user), streak: streak.count, points: FieldValue.increment(0), updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  return streak;
}

/** Adds points to the user's total and today's leaderboard row. */
export function awardPoints(tx: Transaction, uid: string, user: DocumentData | undefined, now: Date, points: number): void {
  const day = utcDay(now);
  tx.set(userRef(uid), { totalPoints: FieldValue.increment(points), scoreDays: FieldValue.arrayUnion(day) }, { merge: true });
  tx.set(
    db.doc(`dailyScores/${day}/users/${uid}`),
    { username: displayName(uid, user), points: FieldValue.increment(points), updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}
