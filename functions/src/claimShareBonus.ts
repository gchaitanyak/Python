import { onCall } from 'firebase-functions/v2/https';
import { awardPoints } from './lib/activity';
import { callOptions, db, rateLimit, requireUid, userRef } from './lib/admin';
import { now as clockNow } from './lib/clock';

export const SHARE_BONUS = 100;

/** +100 points once per user for sharing a completed lesson (SPEC §5.2, honour system). */
export const claimShareBonus = onCall(callOptions, async (request) => {
  const uid = requireUid(request);
  await rateLimit(uid, 'claimShareBonus', 5);
  const now = await clockNow();
  return db.runTransaction(async (tx) => {
    const user = (await tx.get(userRef(uid))).data();
    if (user?.shareBonusClaimed) return { awarded: 0, totalPoints: user.totalPoints ?? 0 };
    tx.set(userRef(uid), { shareBonusClaimed: true }, { merge: true });
    awardPoints(tx, uid, user, now, SHARE_BONUS);
    return { awarded: SHARE_BONUS, totalPoints: (user?.totalPoints ?? 0) + SHARE_BONUS };
  });
});
