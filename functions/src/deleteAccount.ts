import { onCall } from 'firebase-functions/v2/https';
import { auth, db, requireUid, userRef } from './lib/admin';

/**
 * Deletes the caller's account (SPEC §8): profile, progress and attempts are
 * removed, the username is released, and leaderboard rows are anonymised.
 * A callable rather than an auth trigger so the client can wait for it.
 */
export const deleteAccount = onCall(async (request) => {
  const uid = requireUid(request);
  const user = (await userRef(uid).get()).data();
  const batch = db.batch();
  for (const day of (user?.scoreDays as string[] | undefined) ?? []) {
    batch.set(db.doc(`dailyScores/${day}/users/${uid}`), { username: 'former learner' }, { merge: true });
  }
  if (typeof user?.usernameLower === 'string') {
    const nameRef = db.collection('usernames').doc(user.usernameLower);
    if ((await nameRef.get()).data()?.uid === uid) batch.delete(nameRef);
  }
  await batch.commit();
  await db.recursiveDelete(userRef(uid));
  await db.collection('rateLimits').where('__name__', '>=', `${uid}_`).where('__name__', '<', `${uid}_`).get()
    .then((snap) => Promise.all(snap.docs.map((d) => d.ref.delete())));
  await auth.deleteUser(uid);
  return { deleted: true };
});
