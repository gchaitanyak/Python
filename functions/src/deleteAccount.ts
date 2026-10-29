import { logger } from 'firebase-functions/v2';
import { onCall } from 'firebase-functions/v2/https';
import { FieldPath } from 'firebase-admin/firestore';
import { removeUserFromGroups } from './groups';
import { auth, callOptions, db, requireUid, userRef } from './lib/admin';
import { stripe, STRIPE_SECRET_KEY } from './lib/stripe';

/**
 * Deletes the caller's account (SPEC §8): profile, progress and attempts are
 * removed (with AI hint logs), the username is released, leaderboard rows are anonymised,
 * and the learner leaves their groups (a group left with no admin is closed).
 * Any active subscription is cancelled so a deleted account is never billed again.
 * A certificate stays verifiable only if the learner asks (`keepCertificate`);
 * it is then detached from the account, otherwise it is deleted.
 * A callable rather than an auth trigger so the client can wait for it.
 */
export const deleteAccount = onCall({ ...callOptions, secrets: [STRIPE_SECRET_KEY] }, async (request) => {
  const uid = requireUid(request);
  const keepCertificate = (request.data as { keepCertificate?: unknown } | null)?.keepCertificate === true;
  const user = (await userRef(uid).get()).data();
  if (typeof user?.stripeSubscriptionId === 'string' && user.subscriptionStatus !== 'canceled') {
    await stripe()
      .subscriptions.cancel(user.stripeSubscriptionId)
      .catch((err: Error) => logger.error('Could not cancel subscription on account deletion', { uid, error: err.message }));
  }
  await removeUserFromGroups(uid, user?.groups as Record<string, unknown> | undefined, Date.now());
  const batch = db.batch();
  for (const day of (user?.scoreDays as string[] | undefined) ?? []) {
    batch.set(db.doc(`dailyScores/${day}/users/${uid}`), { username: 'former learner' }, { merge: true });
  }
  if (typeof user?.certificateId === 'string') {
    const cert = db.collection('certificates').doc(user.certificateId);
    if (keepCertificate) batch.set(cert, { uid: null }, { merge: true });
    else batch.delete(cert);
  }
  if (typeof user?.usernameLower === 'string') {
    const nameRef = db.collection('usernames').doc(user.usernameLower);
    if ((await nameRef.get()).data()?.uid === uid) batch.delete(nameRef);
  }
  await batch.commit();
  await db.recursiveDelete(userRef(uid));
  await db.collection('rateLimits').where('__name__', '>=', `${uid}_`).where('__name__', '<', `${uid}_`).get()
    .then((snap) => Promise.all(snap.docs.map((d) => d.ref.delete())));
  for (const name of ['hintLogs', 'hintQuota']) {
    await db.collection(name).where('uid', '==', uid).get().then((snap) => Promise.all(snap.docs.map((doc) => doc.ref.delete())));
  }
  await auth.deleteUser(uid);
  return { deleted: true };
});
