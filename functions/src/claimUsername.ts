import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { callOptions, db, requireUid, userRef } from './lib/admin';
import { normaliseUsername } from './lib/rules';

/** Claims a unique, case-insensitive username; releases the caller's previous one. */
export const claimUsername = onCall(callOptions, async (request) => {
  const uid = requireUid(request);
  const parsed = normaliseUsername((request.data as { username?: unknown } | null)?.username);
  if (!parsed.ok) throw new HttpsError('invalid-argument', parsed.error);
  const { username } = parsed;

  await db.runTransaction(async (tx) => {
    const nameRef = db.collection('usernames').doc(username);
    const [nameSnap, userSnap] = await Promise.all([tx.get(nameRef), tx.get(userRef(uid))]);
    const owner = nameSnap.data()?.uid;
    if (owner && owner !== uid) throw new HttpsError('already-exists', 'That username is taken. Try another.');
    const previous = userSnap.data()?.usernameLower;
    if (typeof previous === 'string' && previous !== username) tx.delete(db.collection('usernames').doc(previous));
    tx.set(nameRef, { uid });
    tx.set(userRef(uid), { username, usernameLower: username }, { merge: true });
  });
  return { ok: true, username };
});
