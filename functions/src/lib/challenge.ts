/**
 * Daily challenge selection (SPEC §5.4): 5 questions from lessons tagged
 * `daily: true`, the same for everyone on a UTC date, seeded by that date.
 * Pure, so it is unit-tested; the result is stored once per day in Firestore.
 */
import { isGradable, lessonsInOrder } from './rules';
import type { Curriculum, Lesson, Question } from './types';

export const CHALLENGE_SIZE = 5;

/** Small deterministic PRNG (mulberry32) seeded from a string. */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Lessons the challenge may draw from: tagged daily, written, and free — so the
 * public challenge never exposes premium lesson content.
 */
export function challengeLessonIds(c: Curriculum): string[] {
  return lessonsInOrder(c)
    .map((p) => p.lesson as typeof p.lesson & { daily?: boolean })
    .filter((l) => l.daily && l.free && l.status === 'written')
    .map((l) => l.id);
}

export interface ChallengeRef {
  lessonId: string;
  questionId: string;
}

/** One question from each of 5 different lessons where possible, all chosen by the date seed. */
export function pickChallenge(date: string, lessons: Lesson[]): ChallengeRef[] {
  const rand = seededRandom(`daily:${date}`);
  const pools = shuffle(
    lessons.map((l) => ({ lessonId: l.id, questions: shuffle(l.questions.filter(isGradable), rand) })).filter((p) => p.questions.length > 0),
    rand,
  );
  const picked: ChallengeRef[] = [];
  for (let round = 0; picked.length < CHALLENGE_SIZE && pools.some((p) => p.questions.length > 0); round++) {
    for (const pool of pools) {
      const q = pool.questions.shift();
      if (q) picked.push({ lessonId: pool.lessonId, questionId: q.id });
      if (picked.length === CHALLENGE_SIZE) break;
    }
  }
  return picked;
}

/** Challenge questions renumbered q01…q05, each remembering where it came from. */
export function challengeQuestions(refs: ChallengeRef[], load: (lessonId: string) => Lesson | undefined): (Question & { source: ChallengeRef })[] {
  return refs.map((ref, i) => {
    const lesson = load(ref.lessonId)!;
    const q = lesson.questions.find((x) => x.id === ref.questionId)!;
    const { points: _points, ...rest } = q;
    return { ...rest, id: `q${String(i + 1).padStart(2, '0')}`, source: ref };
  });
}

/** Rank for a result: better accuracy first, then less time. */
export const challengeAccuracy = (correct: number, total: number): number => (total ? Math.round((correct / total) * 100) : 0);
