import { onSchedule } from 'firebase-functions/v2/scheduler';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { recordActivity } from './lib/activity';
import { db, displayName, FieldValue, rateLimit, requireUid, userRef } from './lib/admin';
import { challengeAccuracy, challengeLessonIds, challengeQuestions, pickChallenge, type ChallengeRef } from './lib/challenge';
import { now as clockNow } from './lib/clock';
import { curriculum, loadLesson } from './lib/content';
import { checkAnswer, currentStreak, serverCheckable, utcDay } from './lib/rules';
import type { Lesson, Question, SubmittedAnswer } from './lib/types';

interface ChallengeDoc {
  date: string;
  questionRefs: ChallengeRef[];
  questions: (Question & { source: ChallengeRef })[];
}

/** Returns the challenge for a UTC date, creating it once (the same for everyone that day). */
export async function ensureChallenge(date: string): Promise<ChallengeDoc> {
  const ref = db.doc(`dailyChallenges/${date}`);
  const snap = await ref.get();
  if (snap.exists) return snap.data() as ChallengeDoc;
  const lessons = challengeLessonIds(curriculum)
    .map(loadLesson)
    .filter((l): l is Lesson => !!l);
  const questionRefs = pickChallenge(date, lessons);
  const doc: ChallengeDoc = { date, questionRefs, questions: challengeQuestions(questionRefs, loadLesson) };
  try {
    await ref.create({ ...doc, createdAt: FieldValue.serverTimestamp() });
  } catch (err) {
    // Someone else created it first; theirs is identical by construction.
    if ((err as { code?: number }).code !== 6) throw err;
  }
  return (await ref.get()).data() as ChallengeDoc;
}

/** Scheduled builder: today's challenge at 00:00 UTC. */
export const buildDailyChallenge = onSchedule({ schedule: '0 0 * * *', timeZone: 'UTC' }, async () => {
  await ensureChallenge(utcDay(await clockNow()));
});

/** Today's challenge for the /daily/ page. Public: anyone may view and practise it. */
export const getDailyChallenge = onCall(async () => {
  const date = utcDay(await clockNow());
  const { questionRefs: _refs, ...challenge } = await ensureChallenge(date);
  return challenge;
});

async function rankOf(date: string, accuracy: number, seconds: number): Promise<number> {
  const results = db.collection(`dailyChallenges/${date}/results`);
  const [better, faster] = await Promise.all([
    results.where('accuracy', '>', accuracy).count().get(),
    results.where('accuracy', '==', accuracy).where('seconds', '<', seconds).count().get(),
  ]);
  return better.data().count + faster.data().count + 1;
}

/**
 * Scores today's challenge: one scored attempt per user per day; later attempts
 * are practice and return the scored result. Non-code answers are re-checked.
 * A scored attempt counts towards the streak.
 */
export const submitChallenge = onCall(async (request) => {
  const uid = requireUid(request);
  const d = (request.data ?? {}) as { date?: unknown; answers?: unknown; seconds?: unknown };
  if (typeof d.date !== 'string' || !Array.isArray(d.answers)) throw new HttpsError('invalid-argument', 'date and answers are required.');
  await rateLimit(uid, 'submitChallenge', 10);

  const now = await clockNow();
  if (d.date !== utcDay(now)) throw new HttpsError('failed-precondition', 'That challenge has ended. Try today’s instead.');
  const challenge = await ensureChallenge(d.date);
  const answers = new Map(
    (d.answers as { questionId?: unknown; correct?: unknown; answer?: SubmittedAnswer }[])
      .filter((a) => a && typeof a.questionId === 'string')
      .map((a) => [a.questionId as string, a]),
  );
  const seconds = typeof d.seconds === 'number' && Number.isFinite(d.seconds) ? Math.round(Math.min(3600, Math.max(5, d.seconds))) : 3600;
  const resultRef = db.doc(`dailyChallenges/${d.date}/results/${uid}`);

  const outcome = await db.runTransaction(async (tx) => {
    const [existing, userSnap] = await Promise.all([tx.get(resultRef), tx.get(userRef(uid))]);
    const user = userSnap.data();
    if (existing.exists) {
      const r = existing.data()!;
      return { scored: false, accuracy: r.accuracy as number, seconds: r.seconds as number, correct: r.correct as number, streak: currentStreak(user?.streak, user?.streak?.lastDay ?? '') };
    }
    const correct = challenge.questions.filter((q) => {
      const a = answers.get(q.id);
      return serverCheckable(q) ? checkAnswer(q, a?.answer) : a?.correct === true;
    }).length;
    const accuracy = challengeAccuracy(correct, challenge.questions.length);
    tx.set(resultRef, { accuracy, seconds, correct, username: displayName(uid, user), at: FieldValue.serverTimestamp() });
    const streak = recordActivity(tx, uid, user, now);
    return { scored: true, accuracy, seconds, correct, streak: streak.count };
  });
  return { ...outcome, total: challenge.questions.length, rank: await rankOf(d.date, outcome.accuracy, outcome.seconds) };
});
