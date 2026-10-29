import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db, displayName, FieldValue, progressRef, rateLimit, requireUid, userIsPremium, userRef } from './lib/admin';
import { findPlaced, loadLesson } from './lib/content';
import { checkAnswer, isGradable, lessonAccess, localDay, pointsFor, previousLessonId, serverCheckable, utcDay } from './lib/rules';
import type { SubmittedAnswer } from './lib/types';

interface Input {
  lessonId: string;
  questionId: string;
  correct: boolean;
  viewedSolution?: boolean;
  answer?: SubmittedAnswer;
}

/** Per question, per day: the server's record of tries and the award. */
export interface ScoringState {
  day: string;
  tries: number;
  correct: boolean;
  firstTry: boolean;
  viewedSolution: boolean;
  points: number;
}

const ACCESS_ERRORS = {
  'not-found': ['not-found', 'That lesson does not exist.'],
  'coming-soon': ['not-found', 'That lesson is not available yet.'],
  upgrade: ['permission-denied', 'This lesson needs a premium plan.'],
  'finish-previous': ['failed-precondition', 'Finish the previous lesson first.'],
} as const;

export function parseInput(data: unknown): Input {
  const d = (data ?? {}) as Record<string, unknown>;
  if (typeof d.lessonId !== 'string' || typeof d.questionId !== 'string' || typeof d.correct !== 'boolean') {
    throw new HttpsError('invalid-argument', 'lessonId, questionId and correct are required.');
  }
  const a = d.answer as Record<string, unknown> | undefined;
  const answer: SubmittedAnswer | undefined =
    a && typeof a === 'object'
      ? {
          optionId: typeof a.optionId === 'string' ? a.optionId.slice(0, 50) : undefined,
          text: typeof a.text === 'string' ? a.text.slice(0, 5000) : undefined,
          blanks: Array.isArray(a.blanks) ? a.blanks.slice(0, 20).map((b) => String(b).slice(0, 200)) : undefined,
        }
      : undefined;
  return { lessonId: d.lessonId, questionId: d.questionId, correct: d.correct, viewedSolution: d.viewedSolution === true, answer };
}

/**
 * Records one Check. Points are recomputed here (SPEC §4.3): the server counts
 * tries itself, re-checks non-code answers, and awards each question at most
 * once per day. Writes the attempt, the user's total and today's leaderboard row.
 */
export const submitAnswer = onCall(async (request) => {
  const uid = requireUid(request);
  const input = parseInput(request.data);
  await rateLimit(uid, 'submitAnswer', 60);

  const lesson = loadLesson(input.lessonId);
  const placed = findPlaced(input.lessonId);
  const question = lesson?.questions.find((q) => q.id === input.questionId);
  if (!lesson || !placed || !question || !isGradable(question)) throw new HttpsError('not-found', 'Unknown lesson or question.');

  const now = new Date();
  const prevId = previousLessonId(placed);

  return db.runTransaction(async (tx) => {
    const [userSnap, progressSnap, prevSnap] = await Promise.all([
      tx.get(userRef(uid)),
      tx.get(progressRef(uid, input.lessonId)),
      prevId ? tx.get(progressRef(uid, prevId)) : Promise.resolve(undefined),
    ]);
    const user = userSnap.data();
    const access = lessonAccess(placed, userIsPremium(user, now.getTime()), !prevId || prevSnap?.data()?.completed === true);
    if (access !== 'open') {
      const [code, message] = ACCESS_ERRORS[access];
      throw new HttpsError(code, message);
    }

    const today = localDay(now, user?.tz ?? 'UTC');
    const previous = progressSnap.data()?.scoring?.[question.id] as ScoringState | undefined;
    const state: ScoringState =
      previous && previous.day === today ? { ...previous } : { day: today, tries: 0, correct: false, firstTry: false, viewedSolution: false, points: 0 };
    const correct = serverCheckable(question) ? checkAnswer(question, input.answer) : input.correct;

    // Already answered correctly today: one award per question per day.
    if (state.correct) return { correct, points: 0, alreadyAwarded: true, tries: state.tries, totalPoints: user?.totalPoints ?? 0 };

    state.tries += 1;
    state.viewedSolution = state.viewedSolution || input.viewedSolution === true;
    let points = 0;
    if (correct) {
      state.correct = true;
      state.firstTry = state.tries === 1 && !state.viewedSolution;
      points = pointsFor(question.points ?? lesson.basePoints, state.tries, state.viewedSolution);
      state.points = points;
    }

    tx.set(progressRef(uid, input.lessonId), { scoring: { [question.id]: state } }, { merge: true });
    tx.create(userRef(uid).collection('attempts').doc(), {
      lessonId: input.lessonId,
      questionId: question.id,
      correct,
      try: state.tries,
      points,
      at: FieldValue.serverTimestamp(),
    });
    const totalPoints = (user?.totalPoints ?? 0) + points;
    if (points > 0) {
      const day = utcDay(now);
      tx.set(userRef(uid), { totalPoints: FieldValue.increment(points), scoreDays: FieldValue.arrayUnion(day) }, { merge: true });
      tx.set(
        db.doc(`dailyScores/${day}/users/${uid}`),
        { username: displayName(uid, user), points: FieldValue.increment(points), updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    }
    return { correct, points, alreadyAwarded: false, tries: state.tries, totalPoints };
  });
});
