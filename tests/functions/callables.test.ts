import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { describe, expect, it } from 'vitest';
import { admin, apps, count, errorCode, newUser, projectId, read, today } from './helpers';

describe('claimUsername', () => {
  it('claims case-insensitively unique names and releases old ones', async () => {
    const a = await newUser();
    const b = await newUser();
    const name = `ada${Date.now() % 100000}`;
    expect(await a.call('claimUsername', { username: name.toUpperCase() })).toEqual({ ok: true, username: name });
    expect((await read(`usernames/${name}`))?.uid).toBe(a.uid);
    expect(await read(`users/${a.uid}`)).toMatchObject({ username: name, usernameLower: name });
    expect(await errorCode(b.call('claimUsername', { username: name }))).toBe('functions/already-exists');
    await a.call('claimUsername', { username: `${name}_2` });
    expect(await read(`usernames/${name}`)).toBeUndefined();
    expect(await b.call('claimUsername', { username: name })).toMatchObject({ ok: true });
  });

  it('rejects invalid names and anonymous callers', async () => {
    const a = await newUser();
    expect(await errorCode(a.call('claimUsername', { username: 'no' }))).toBe('functions/invalid-argument');
    expect(await errorCode(a.call('claimUsername', { username: 'bad name!' }))).toBe('functions/invalid-argument');
    const app = initializeApp({ apiKey: 'demo-key', projectId }, `anon-${Date.now()}`);
    apps.push(app);
    const fns = getFunctions(app, 'us-central1');
    connectFunctionsEmulator(fns, '127.0.0.1', 5001);
    expect(await errorCode(httpsCallable(fns, 'claimUsername')({ username: 'anyone' }))).toBe('functions/unauthenticated');
  });
});

describe('submitAnswer', () => {
  it('counts tries server-side, awards once per day and writes the leaderboard row', async () => {
    const u = await newUser();
    await u.call('claimUsername', { username: `scorer${Date.now() % 100000}` });
    const q = { lessonId: 'py-intro-first-program', questionId: 'q02' };
    expect(await u.call('submitAnswer', { ...q, correct: false })).toMatchObject({ points: 0, tries: 1 });
    expect(await u.call('submitAnswer', { ...q, correct: true })).toMatchObject({ correct: true, points: 5, tries: 2, totalPoints: 5 });
    expect(await u.call('submitAnswer', { ...q, correct: true })).toMatchObject({ points: 0, alreadyAwarded: true });
    expect(await u.call('submitAnswer', { lessonId: 'py-intro-first-program', questionId: 'q04', correct: true })).toMatchObject({ points: 10 });

    expect(await read(`users/${u.uid}`)).toMatchObject({ totalPoints: 15 });
    const row = await read(`dailyScores/${today()}/users/${u.uid}`);
    expect(row).toMatchObject({ points: 15 });
    expect(row?.username).toMatch(/^scorer/);
    expect(JSON.stringify(row)).not.toContain('@');
    // The repeat Check after the award is answered without recording an attempt.
    expect(await count(`users/${u.uid}/attempts`)).toBe(3);
  });

  it('re-checks non-code answers instead of trusting `correct`', async () => {
    const u = await newUser();
    const mc = { lessonId: 'py-intro-first-program', questionId: 'q05', correct: true };
    expect(await u.call('submitAnswer', { ...mc, answer: { optionId: 'a' } })).toMatchObject({ correct: false, points: 0 });
    expect(await u.call('submitAnswer', { ...mc, answer: { optionId: 'b' } })).toMatchObject({ correct: true, points: 5 });
    const predict = { lessonId: 'py-intro-first-program', questionId: 'q03', correct: true };
    expect(await u.call('submitAnswer', { ...predict, answer: { text: '7\n3 + 4  \n' } })).toMatchObject({ correct: true, points: 10 });
  });

  it('scores 0 after the solution was viewed', async () => {
    const u = await newUser();
    expect(await u.call('submitAnswer', { lessonId: 'py-intro-first-program', questionId: 'q06', correct: true, viewedSolution: true })).toMatchObject({
      correct: true,
      points: 0,
    });
  });

  it('enforces sequential unlock and the premium paywall', async () => {
    const u = await newUser();
    expect(await errorCode(u.call('submitAnswer', { lessonId: 'py-print-and-comments', questionId: 'q02', correct: true }))).toBe(
      'functions/failed-precondition',
    );
    expect(await errorCode(u.call('submitAnswer', { lessonId: 'py-comparison-logical', questionId: 'q02', correct: true }))).toBe(
      'functions/permission-denied',
    );
    expect(await errorCode(u.call('submitAnswer', { lessonId: 'py-intro-first-program', questionId: 'q01', correct: true }))).toBe('functions/not-found');
    expect(await errorCode(u.call('submitAnswer', { lessonId: 'py-nope', questionId: 'q01', correct: true }))).toBe('functions/not-found');
    expect(await errorCode(u.call('submitAnswer', { lessonId: 'py-intro-first-program' }))).toBe('functions/invalid-argument');

    // Premium with the previous lesson done → open.
    await admin(`users/${u.uid}`, { entitlement: 'premium', premiumUntil: null });
    await admin(`users/${u.uid}/progress/py-arithmetic-assignment`, { completed: true });
    expect(await u.call('submitAnswer', { lessonId: 'py-comparison-logical', questionId: 'q02', correct: true })).toMatchObject({ points: 10 });
  });
});

describe('completeLesson', () => {
  it('marks completion, keeps the best accuracy, starts a streak and unlocks the next lesson', async () => {
    const u = await newUser('Asia/Tokyo');
    expect(await u.call('completeLesson', { lessonId: 'py-intro-first-program', accuracy: 70 })).toEqual({
      streak: 1,
      bestAccuracy: 70,
      nextLessonId: 'py-print-and-comments',
    });
    await u.call('completeLesson', { lessonId: 'py-intro-first-program', accuracy: 40 });
    expect(await read(`users/${u.uid}/progress/py-intro-first-program`)).toMatchObject({ completed: true, bestAccuracy: 70, lastAccuracy: 40 });
    expect((await read(`users/${u.uid}`))?.streak).toMatchObject({ count: 1 });
    expect(await read(`dailyScores/${today()}/users/${u.uid}`)).toMatchObject({ streak: 1, points: 0 });
    expect(await u.call('submitAnswer', { lessonId: 'py-print-and-comments', questionId: 'q02', correct: true })).toMatchObject({ points: 10 });
  });

  it('rejects locked lessons and bad input', async () => {
    const u = await newUser();
    expect(await errorCode(u.call('completeLesson', { lessonId: 'py-print-and-comments', accuracy: 100 }))).toBe('functions/failed-precondition');
    expect(await errorCode(u.call('completeLesson', { lessonId: 'py-variables', accuracy: 'high' }))).toBe('functions/invalid-argument');
  });

  it('rate-limits to 20 calls a minute', async () => {
    const u = await newUser();
    for (let i = 0; i < 20; i++) await u.call('completeLesson', { lessonId: 'py-variables', accuracy: 100 });
    expect(await errorCode(u.call('completeLesson', { lessonId: 'py-variables', accuracy: 100 }))).toBe('functions/resource-exhausted');
  });
});

describe('mergeAnonymousProgress', () => {
  it('merges free completed lessons once per account', async () => {
    const u = await newUser();
    const progress = [
      { lessonId: 'py-intro-first-program', completed: true, bestAccuracy: 88, lastPractisedAt: new Date().toISOString() },
      { lessonId: 'py-comparison-logical', completed: true, bestAccuracy: 100, lastPractisedAt: new Date().toISOString() },
    ];
    expect(await u.call('mergeAnonymousProgress', { progress })).toEqual({ merged: 1, alreadyMerged: false });
    expect(await read(`users/${u.uid}/progress/py-intro-first-program`)).toMatchObject({ completed: true, bestAccuracy: 88 });
    expect(await read(`users/${u.uid}/progress/py-comparison-logical`)).toBeUndefined();
    expect((await read(`users/${u.uid}`))?.totalPoints).toBeUndefined();
    expect(await u.call('mergeAnonymousProgress', { progress })).toEqual({ merged: 0, alreadyMerged: true });
  });
});

describe('deleteAccount', () => {
  it('removes data, releases the username, anonymises leaderboard rows and deletes the login', async () => {
    const u = await newUser();
    const name = `gone${Date.now() % 100000}`;
    await u.call('claimUsername', { username: name });
    await u.call('submitAnswer', { lessonId: 'py-intro-first-program', questionId: 'q02', correct: true });
    expect(await u.call('deleteAccount')).toEqual({ deleted: true });
    expect(await read(`users/${u.uid}`)).toBeUndefined();
    expect(await count(`users/${u.uid}/attempts`)).toBe(0);
    expect(await read(`usernames/${name}`)).toBeUndefined();
    expect(await read(`dailyScores/${today()}/users/${u.uid}`)).toMatchObject({ username: 'former learner' });
    expect(await errorCode(signInWithEmailAndPassword(getAuth(u.app), u.email, 'correct-horse-battery'))).toBe('auth/user-not-found');
  });
});
