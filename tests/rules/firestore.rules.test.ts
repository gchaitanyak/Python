import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;
const db = (uid?: string) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore());

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
    const a = ctx.firestore();
    const day = Date.now() + 86_400_000;
    await setDoc(doc(a, 'users/alice'), { firstName: 'Alice', tz: 'UTC', entitlement: 'free', totalPoints: 30, username: 'alice' });
    await setDoc(doc(a, 'users/pat'), { firstName: 'Pat', tz: 'UTC', entitlement: 'premium', premiumUntil: null });
    await setDoc(doc(a, 'users/lapsed'), { firstName: 'Lee', tz: 'UTC', entitlement: 'premium', premiumUntil: Timestamp.fromMillis(Date.now() - 1000) });
    await setDoc(doc(a, 'users/term'), { firstName: 'Tam', tz: 'UTC', entitlement: 'premium', premiumUntil: Timestamp.fromMillis(day) });
    await setDoc(doc(a, 'users/alice/progress/py-variables'), { completed: true, bestAccuracy: 80, questionState: {} });
    await setDoc(doc(a, 'users/alice/attempts/a1'), { lessonId: 'py-variables', points: 10 });
    await setDoc(doc(a, 'usernames/alice'), { uid: 'alice' });
    await setDoc(doc(a, 'lessonContent/py-comparison-logical'), { title: 'Comparison', questions: [] });
    await setDoc(doc(a, 'dailyScores/2026-10-29/users/alice'), { username: 'alice', points: 30, streak: 1 });
    await setDoc(doc(a, 'dailyChallenges/2026-10-29'), { questionRefs: [] });
    await setDoc(doc(a, 'dailyChallenges/2026-10-29/results/alice'), { accuracy: 80 });
    await setDoc(doc(a, 'certificates/PUBLIC1234'), { uid: 'alice', public: true, name: 'Alice A' });
    await setDoc(doc(a, 'certificates/HIDDEN5678'), { uid: 'alice', public: false, name: 'Alice A' });
    await setDoc(doc(a, 'groups/g1'), { name: 'Class', adminUids: ['pat'] });
    await setDoc(doc(a, 'groups/g1/members/alice'), { username: 'alice' });
    await setDoc(doc(a, 'hintLogs/h1'), { uid: 'alice', lessonId: 'py-variables', helpful: null });
    await setDoc(doc(a, 'rateLimits/alice_submitAnswer'), { count: 1 });
  });
});

describe('users/{uid}', () => {
  it('is readable only by its owner', async () => {
    await assertSucceeds(getDoc(doc(db('alice'), 'users/alice')));
    await assertFails(getDoc(doc(db('pat'), 'users/alice')));
    await assertFails(getDoc(doc(db(), 'users/alice')));
  });

  it('can be created with profile fields only', async () => {
    await assertSucceeds(setDoc(doc(db('new'), 'users/new'), { firstName: 'Nia', tz: 'Europe/Lisbon', createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db('new2'), 'users/new2'), { firstName: 'Nia', tz: 'UTC', createdAt: serverTimestamp(), entitlement: 'premium' }));
    await assertFails(setDoc(doc(db('new3'), 'users/new3'), { firstName: 'Nia', tz: 'UTC', createdAt: serverTimestamp(), totalPoints: 9999 }));
    await assertFails(setDoc(doc(db('x'), 'users/someone'), { firstName: 'Nia', tz: 'UTC', createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db('new4'), 'users/new4'), { firstName: 'N'.repeat(51), tz: 'UTC', createdAt: serverTimestamp() }));
  });

  it('lets the owner change name and time zone only', async () => {
    await assertSucceeds(updateDoc(doc(db('alice'), 'users/alice'), { firstName: 'Ali', tz: 'Asia/Tokyo' }));
    await assertFails(updateDoc(doc(db('alice'), 'users/alice'), { entitlement: 'premium' }));
    await assertFails(updateDoc(doc(db('alice'), 'users/alice'), { premiumUntil: null }));
    await assertFails(updateDoc(doc(db('alice'), 'users/alice'), { totalPoints: 9999 }));
    await assertFails(updateDoc(doc(db('alice'), 'users/alice'), { streak: { count: 99, lastDay: '2026-10-29' } }));
    await assertFails(updateDoc(doc(db('alice'), 'users/alice'), { username: 'admin' }));
    await assertFails(updateDoc(doc(db('pat'), 'users/alice'), { firstName: 'Hacked' }));
    await assertFails(deleteDoc(doc(db('alice'), 'users/alice')));
  });
});

describe('users/{uid}/progress', () => {
  it('is readable only by its owner', async () => {
    await assertSucceeds(getDoc(doc(db('alice'), 'users/alice/progress/py-variables')));
    await assertFails(getDoc(doc(db('pat'), 'users/alice/progress/py-variables')));
  });

  it('only accepts question drafts from the owner', async () => {
    await assertSucceeds(updateDoc(doc(db('alice'), 'users/alice/progress/py-variables'), { questionState: { q02: { draft: 'x = 1' } } }));
    await assertFails(updateDoc(doc(db('alice'), 'users/alice/progress/py-variables'), { completed: true, bestAccuracy: 100 }));
    await assertFails(updateDoc(doc(db('alice'), 'users/alice/progress/py-variables'), { scoring: { q02: { points: 50 } } }));
    await assertFails(setDoc(doc(db('alice'), 'users/alice/progress/py-numbers-math'), { completed: true }));
    await assertFails(updateDoc(doc(db('pat'), 'users/alice/progress/py-variables'), { questionState: {} }));
    await assertFails(deleteDoc(doc(db('alice'), 'users/alice/progress/py-variables')));
  });
});

describe('users/{uid}/attempts', () => {
  it('is readable by the owner and never client-writable', async () => {
    await assertSucceeds(getDoc(doc(db('alice'), 'users/alice/attempts/a1')));
    await assertFails(getDoc(doc(db('pat'), 'users/alice/attempts/a1')));
    await assertFails(setDoc(doc(db('alice'), 'users/alice/attempts/a2'), { points: 100 }));
    await assertFails(updateDoc(doc(db('alice'), 'users/alice/attempts/a1'), { points: 100 }));
  });
});

describe('usernames', () => {
  it('is public to read and never client-writable', async () => {
    await assertSucceeds(getDoc(doc(db(), 'usernames/alice')));
    await assertFails(setDoc(doc(db('pat'), 'usernames/pat'), { uid: 'pat' }));
    await assertFails(setDoc(doc(db('pat'), 'usernames/alice'), { uid: 'pat' }));
    await assertFails(deleteDoc(doc(db('alice'), 'usernames/alice')));
  });
});

describe('lessonContent (paywall)', () => {
  const ref = (uid?: string) => doc(db(uid), 'lessonContent/py-comparison-logical');
  it('is unreadable signed out, on the free plan, or after premium lapses', async () => {
    await assertFails(getDoc(ref()));
    await assertFails(getDoc(ref('alice')));
    await assertFails(getDoc(ref('lapsed')));
    await assertFails(getDoc(ref('no-profile')));
  });

  it('is readable for premium users (open-ended or not yet expired) and never writable', async () => {
    await assertSucceeds(getDoc(ref('pat')));
    await assertSucceeds(getDoc(ref('term')));
    await assertFails(setDoc(ref('pat'), { title: 'x' }));
    await assertFails(deleteDoc(ref('pat')));
  });
});

describe('dailyScores (leaderboards)', () => {
  it('is public to read, including the top-10 query, and never client-writable', async () => {
    await assertSucceeds(getDocs(query(collection(db(), 'dailyScores/2026-10-29/users'), orderBy('points', 'desc'), limit(10))));
    await assertFails(setDoc(doc(db('alice'), 'dailyScores/2026-10-29/users/alice'), { username: 'alice', points: 9999 }));
    await assertFails(updateDoc(doc(db('alice'), 'dailyScores/2026-10-29/users/alice'), { points: 9999 }));
    await assertFails(setDoc(doc(db('pat'), 'dailyScores/2026-10-29/users/pat'), { username: 'pat', points: 1 }));
  });
});

describe('dailyChallenges', () => {
  it('is public to read and never client-writable', async () => {
    await assertSucceeds(getDoc(doc(db(), 'dailyChallenges/2026-10-29')));
    await assertSucceeds(getDoc(doc(db(), 'dailyChallenges/2026-10-29/results/alice')));
    await assertFails(setDoc(doc(db('alice'), 'dailyChallenges/2026-10-30'), { questionRefs: [] }));
    await assertFails(setDoc(doc(db('alice'), 'dailyChallenges/2026-10-29/results/alice'), { accuracy: 100 }));
  });
});

describe('certificates', () => {
  it('shows public certificates to anyone and private ones to the owner only', async () => {
    await assertSucceeds(getDoc(doc(db(), 'certificates/PUBLIC1234')));
    await assertSucceeds(getDoc(doc(db('alice'), 'certificates/HIDDEN5678')));
    await assertFails(getDoc(doc(db('pat'), 'certificates/HIDDEN5678')));
    await assertFails(setDoc(doc(db('alice'), 'certificates/FAKE000000'), { uid: 'alice', public: true }));
  });
});

describe('groups', () => {
  it('lets admins read the group and members; members see only themselves', async () => {
    await assertSucceeds(getDoc(doc(db('pat'), 'groups/g1')));
    await assertFails(getDoc(doc(db('alice'), 'groups/g1')));
    await assertSucceeds(getDoc(doc(db('pat'), 'groups/g1/members/alice')));
    await assertSucceeds(getDoc(doc(db('alice'), 'groups/g1/members/alice')));
    await assertFails(getDoc(doc(db('bob'), 'groups/g1/members/alice')));
    await assertFails(setDoc(doc(db('pat'), 'groups/g1/members/bob'), { username: 'bob' }));
    await assertFails(updateDoc(doc(db('pat'), 'groups/g1'), { premiumSeats: 100 }));
  });
});

describe('feedback', () => {
  const valid = (uid: string) => ({ uid, lessonId: 'py-variables', rating: 'up', text: 'Clear!', createdAt: serverTimestamp() });
  it('accepts well-formed feedback from signed-in users as themselves', async () => {
    await assertSucceeds(addDoc(collection(db('alice'), 'feedback'), valid('alice')));
    await assertFails(addDoc(collection(db(), 'feedback'), valid('alice')));
    await assertFails(addDoc(collection(db('alice'), 'feedback'), valid('pat')));
    await assertFails(addDoc(collection(db('alice'), 'feedback'), { ...valid('alice'), rating: 'meh' }));
    await assertFails(addDoc(collection(db('alice'), 'feedback'), { ...valid('alice'), text: 'x'.repeat(2001) }));
    await assertFails(addDoc(collection(db('alice'), 'feedback'), { ...valid('alice'), extra: true }));
  });

  it('is never readable by clients', async () => {
    await assertFails(getDocs(collection(db('alice'), 'feedback')));
  });
});

describe('hintLogs', () => {
  it('lets the owner read and set only `helpful`', async () => {
    await assertSucceeds(getDoc(doc(db('alice'), 'hintLogs/h1')));
    await assertSucceeds(updateDoc(doc(db('alice'), 'hintLogs/h1'), { helpful: true }));
    await assertFails(updateDoc(doc(db('alice'), 'hintLogs/h1'), { helpful: 'very' }));
    await assertFails(updateDoc(doc(db('alice'), 'hintLogs/h1'), { lessonId: 'other' }));
    await assertFails(updateDoc(doc(db('pat'), 'hintLogs/h1'), { helpful: false }));
    await assertFails(setDoc(doc(db('alice'), 'hintLogs/h2'), { uid: 'alice' }));
  });
});

describe('everything else', () => {
  it('denies unknown and function-only collections', async () => {
    await assertFails(getDoc(doc(db('alice'), 'rateLimits/alice_submitAnswer')));
    await assertFails(setDoc(doc(db('alice'), 'rateLimits/alice_submitAnswer'), { count: 0 }));
    await assertFails(setDoc(doc(db('alice'), 'anything/else'), { a: 1 }));
  });
});
