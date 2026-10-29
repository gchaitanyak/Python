import { randomBytes } from 'node:crypto';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db, rateLimit, requireUid, Timestamp, userRef } from './lib/admin';
import { certificateName, certificateProgress, credentialIdFrom } from './lib/certificate';
import { now as clockNow } from './lib/clock';
import { curriculum } from './lib/content';

const certRef = (id: string) => db.collection('certificates').doc(id);

function newCredentialId(): string {
  const bytes = randomBytes(32);
  let i = 0;
  return credentialIdFrom(() => (i < bytes.length ? bytes[i++]! : randomBytes(1)[0]!));
}

/**
 * Issues the caller's certificate once every lesson in modules 1–12 is complete
 * (SPEC §5.5). The name is fixed at first issue; calling again returns the same
 * credential and only adds optional modules finished since.
 */
export const generateCertificate = onCall(async (request) => {
  const uid = requireUid(request);
  const d = (request.data ?? {}) as Record<string, unknown>;
  await rateLimit(uid, 'generateCertificate', 5);

  const progress = await userRef(uid).collection('progress').where('completed', '==', true).get();
  const status = certificateProgress(curriculum, new Set(progress.docs.map((doc) => doc.id)));
  if (!status.eligible) {
    throw new HttpsError('failed-precondition', `Finish every lesson in modules 1–12 first (${status.done} of ${status.required} done).`);
  }

  const existing = (await userRef(uid).get()).data()?.certificateId;
  if (typeof existing === 'string') {
    await certRef(existing).set({ modules: status.modules }, { merge: true });
    return { credentialId: existing };
  }

  const named = certificateName(d.name, d.confirmName);
  if (!named.ok) throw new HttpsError('invalid-argument', named.error);
  const issuedAt = Timestamp.fromDate(await clockNow());

  return db.runTransaction(async (tx) => {
    const user = (await tx.get(userRef(uid))).data();
    // Two tabs racing: the first one wins and both get its credential.
    if (typeof user?.certificateId === 'string') return { credentialId: user.certificateId as string };
    let id = newCredentialId();
    while ((await tx.get(certRef(id))).exists) id = newCredentialId();
    tx.create(certRef(id), { uid, name: named.name, issuedAt, modules: status.modules, public: true });
    tx.set(userRef(uid), { certificateId: id }, { merge: true });
    return { credentialId: id };
  });
});
