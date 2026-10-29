import { doc, getDoc } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import real from '../../content/curriculum.json';
import { admin, errorCode, newUser, read } from './helpers';

const required = real.modules.filter((m) => m.requiredForCertificate).flatMap((m) => m.lessons.map((l) => l.id));

async function completeAll(uid: string, ids = required) {
  await Promise.all(ids.map((id) => admin(`users/${uid}/progress/${id}`, { completed: true, bestAccuracy: 90 })));
}

describe('generateCertificate (SPEC acceptance 6)', () => {
  it('refuses until every lesson in modules 1–12 is complete', async () => {
    const u = await newUser();
    await completeAll(u.uid, required.slice(0, -1));
    expect(await errorCode(u.call('generateCertificate', { name: 'Ada Lovelace', confirmName: 'Ada Lovelace' }))).toBe('functions/failed-precondition');
    expect((await read(`users/${u.uid}`))?.certificateId).toBeUndefined();
  });

  it('issues a public certificate once, with a fixed name', async () => {
    const u = await newUser();
    await completeAll(u.uid);
    expect(await errorCode(u.call('generateCertificate', { name: 'Ada Lovelace', confirmName: 'Ada Lovelase' }))).toBe('functions/invalid-argument');

    const { credentialId } = await u.call<{ credentialId: string }>('generateCertificate', { name: ' Ada  Lovelace', confirmName: 'Ada Lovelace' });
    expect(credentialId).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/);
    const cert = await read(`certificates/${credentialId}`);
    expect(cert).toMatchObject({ uid: u.uid, name: 'Ada Lovelace', public: true });
    expect(cert?.modules).toHaveLength(12);
    expect((await read(`users/${u.uid}`))?.certificateId).toBe(credentialId);

    // A second call can't rename it.
    const again = await u.call<{ credentialId: string }>('generateCertificate', { name: 'Someone Else', confirmName: 'Someone Else' });
    expect(again.credentialId).toBe(credentialId);
    expect((await read(`certificates/${credentialId}`))?.name).toBe('Ada Lovelace');

    // Anyone can read it by id (the public page and the search).
    const stranger = await newUser();
    expect((await getDoc(doc(stranger.db, 'certificates', credentialId))).data()?.name).toBe('Ada Lovelace');
  });

  it('deleting the account removes the certificate unless the learner keeps it', async () => {
    const keep = await newUser();
    const drop = await newUser();
    await Promise.all([completeAll(keep.uid), completeAll(drop.uid)]);
    const kept = (await keep.call<{ credentialId: string }>('generateCertificate', { name: 'Kim Keep', confirmName: 'Kim Keep' })).credentialId;
    const dropped = (await drop.call<{ credentialId: string }>('generateCertificate', { name: 'Dee Drop', confirmName: 'Dee Drop' })).credentialId;

    await keep.call('deleteAccount', { keepCertificate: true });
    await drop.call('deleteAccount', {});
    expect(await read(`certificates/${kept}`)).toMatchObject({ uid: null, name: 'Kim Keep', public: true });
    expect(await read(`certificates/${dropped}`)).toBeUndefined();
  });
});
