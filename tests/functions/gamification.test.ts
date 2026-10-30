import { afterEach, describe, expect, it } from 'vitest';
import { errorCode, newUser, read, setClock } from './helpers';

afterEach(async () => {
  await setClock(null);
});

const utc = (iso: string) => new Date(iso);

describe('daily challenge (SPEC acceptance 7)', () => {
  it('shows the same 5 questions to two different users on the same UTC date', async () => {
    await setClock(utc('2026-11-03T08:00:00Z'));
    const a = await newUser('Asia/Tokyo');
    const b = await newUser('America/Los_Angeles');
    const ca = await a.call<{ date: string; questions: { id: string; source: unknown }[] }>('getDailyChallenge');
    const cb = await b.call<{ date: string; questions: { id: string; source: unknown }[] }>('getDailyChallenge');
    expect(ca.date).toBe('2026-11-03');
    expect(ca.questions).toHaveLength(5);
    expect(cb).toEqual(ca);
    expect((await read('dailyChallenges/2026-11-03'))?.questionRefs).toEqual(ca.questions.map((q) => q.source));

    await setClock(utc('2026-11-04T00:00:01Z'));
    const next = await a.call<{ date: string; questions: unknown[] }>('getDailyChallenge');
    expect(next.date).toBe('2026-11-04');
    expect(next.questions).not.toEqual(ca.questions);
  });

  it('scores one attempt per day, re-checks answers and ranks by accuracy then time', async () => {
    await setClock(utc('2026-11-05T10:00:00Z'));
    const a = await newUser();
    const challenge = await a.call<{ date: string; questions: { id: string; type: string; answer?: string; expectedOutput?: string; blanks?: string[] }[] }>(
      'getDailyChallenge',
    );
    // Correct answers for everything: the server re-checks the non-code ones.
    const right = challenge.questions.map((q) => ({
      questionId: q.id,
      correct: true,
      answer: { optionId: q.answer, text: q.expectedOutput, blanks: q.blanks },
    }));
    const first = await a.call('submitChallenge', { date: challenge.date, answers: right, seconds: 95 });
    expect(first).toMatchObject({ scored: true, accuracy: 100, correct: 5, total: 5, seconds: 95, rank: 1, streak: 1 });
    expect(await read(`dailyChallenges/${challenge.date}/results/${a.uid}`)).toMatchObject({ accuracy: 100, seconds: 95 });

    // A second attempt is practice: the scored result stands.
    const again = await a.call('submitChallenge', { date: challenge.date, answers: [], seconds: 10 });
    expect(again).toMatchObject({ scored: false, accuracy: 100, seconds: 95, rank: 1 });

    // Claiming `correct` for non-code questions doesn't help.
    const b = await newUser();
    const lies = challenge.questions.map((q) => ({ questionId: q.id, correct: true, answer: { optionId: 'zzz', text: 'nope', blanks: ['nope'] } }));
    const serverChecked = challenge.questions.filter((q) => ['multiple_choice', 'predict_output'].includes(q.type) || (q.type === 'fill_blank' && q.blanks && 'matchMode' in q)).length;
    const res = await b.call<{ accuracy: number; rank: number }>('submitChallenge', { date: challenge.date, answers: lies, seconds: 30 });
    expect(res.accuracy).toBe(Math.round(((5 - serverChecked) / 5) * 100));
    expect(res.rank).toBe(serverChecked > 0 ? 2 : 1);

    // Same accuracy, faster → ranks ahead.
    const c = await newUser();
    expect(await c.call('submitChallenge', { date: challenge.date, answers: right, seconds: 40 })).toMatchObject({ accuracy: 100, rank: 1 });
  });

  it('refuses other dates and anonymous submissions', async () => {
    await setClock(utc('2026-11-06T12:00:00Z'));
    const a = await newUser();
    expect(await errorCode(a.call('submitChallenge', { date: '2026-11-05', answers: [] }))).toBe('functions/failed-precondition');
    expect(await errorCode(a.call('submitChallenge', { date: '2026-11-06' }))).toBe('functions/invalid-argument');
  });
});

describe('streaks across day boundaries (fake clock)', () => {
  it('extends on the next local day, holds within a day and restarts after a gap', async () => {
    const u = await newUser('Europe/Lisbon');
    const complete = () => u.call<{ streak: number }>('completeLesson', { lessonId: 'py-intro-first-program', accuracy: 100 });

    await setClock(utc('2026-11-10T23:30:00Z'));
    expect((await complete()).streak).toBe(1);
    await setClock(utc('2026-11-10T23:55:00Z'));
    expect((await complete()).streak).toBe(1);
    await setClock(utc('2026-11-11T00:05:00Z')); // just past midnight: a new day
    expect((await complete()).streak).toBe(2);
    expect((await read(`users/${u.uid}`))?.streak).toEqual({ count: 2, lastDay: '2026-11-11' });
    expect(await read(`dailyScores/2026-11-11/users/${u.uid}`)).toMatchObject({ streak: 2 });
    await setClock(utc('2026-11-14T09:00:00Z')); // missed two days
    expect((await complete()).streak).toBe(1);
  });

  it('uses the learner’s time zone, not UTC, for the day', async () => {
    const u = await newUser('America/New_York'); // UTC−5 in November
    const complete = () => u.call<{ streak: number }>('completeLesson', { lessonId: 'py-intro-first-program', accuracy: 100 });
    await setClock(utc('2026-11-20T03:00:00Z')); // 22:00 on the 19th in New York
    expect((await complete()).streak).toBe(1);
    await setClock(utc('2026-11-20T06:00:00Z')); // 01:00 on the 20th: same UTC day, next local day
    expect((await complete()).streak).toBe(2);
  });

  it('counts a scored daily challenge towards the streak', async () => {
    const u = await newUser();
    await setClock(utc('2026-11-21T10:00:00Z'));
    await u.call('completeLesson', { lessonId: 'py-intro-first-program', accuracy: 100 });
    await setClock(utc('2026-11-22T10:00:00Z'));
    expect(await u.call('submitChallenge', { date: '2026-11-22', answers: [], seconds: 60 })).toMatchObject({ scored: true, streak: 2 });
  });
});

describe('share bonus', () => {
  it('awards +100 once per user, to the total and today’s leaderboard', async () => {
    await setClock(utc('2026-11-23T10:00:00Z'));
    const u = await newUser();
    expect(await u.call('claimShareBonus')).toEqual({ awarded: 100, totalPoints: 100 });
    expect(await u.call('claimShareBonus')).toEqual({ awarded: 0, totalPoints: 100 });
    expect(await read(`users/${u.uid}`)).toMatchObject({ totalPoints: 100, shareBonusClaimed: true });
    expect(await read(`dailyScores/2026-11-23/users/${u.uid}`)).toMatchObject({ points: 100 });
  });
});
