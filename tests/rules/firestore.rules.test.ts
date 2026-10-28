import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-python-exercises',
    firestore: { rules: readFileSync(resolve(import.meta.dirname, '../../firestore.rules'), 'utf8') },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/alice'), { firstName: 'Alice', tz: 'UTC', entitlement: 'free' });
    await setDoc(doc(db, 'users/pat'), { firstName: 'Pat', tz: 'UTC', entitlement: 'premium', premiumUntil: null });
    await setDoc(doc(db, 'lessonContent/py-list-methods'), { title: 'List Methods', questions: [] });
  });
});

describe('users', () => {
  it('lets a user read their own profile but not someone else’s', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(getDoc(doc(db, 'users/alice')));
    await assertFails(getDoc(doc(db, 'users/pat')));
  });

  it('lets a user change their first name but not their entitlement', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(updateDoc(doc(db, 'users/alice'), { firstName: 'Ali' }));
    await assertFails(updateDoc(doc(db, 'users/alice'), { entitlement: 'premium' }));
  });
});

describe('lessonContent (paywall)', () => {
  it('is unreadable when signed out or on the free plan', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'lessonContent/py-list-methods')));
    await assertFails(getDoc(doc(env.authenticatedContext('alice').firestore(), 'lessonContent/py-list-methods')));
  });

  it('is readable for premium users and never writable', async () => {
    const db = env.authenticatedContext('pat').firestore();
    await assertSucceeds(getDoc(doc(db, 'lessonContent/py-list-methods')));
    await assertFails(setDoc(doc(db, 'lessonContent/py-list-methods'), { title: 'hacked' }));
    await assertFails(deleteDoc(doc(db, 'lessonContent/py-list-methods')));
  });
});

describe('server-written collections', () => {
  it('rejects client writes to scores and attempts', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(db, 'dailyScores/2026-10-28/users/alice'), { points: 9999 }));
    await assertFails(setDoc(doc(db, 'users/alice/attempts/a1'), { correct: true }));
  });
});
