import { isGradable, type Lesson, type Question } from './types';

export interface QuestionState {
  /** Number of graded Check attempts. */
  tries: number;
  correct: boolean;
  /** Correct on the first Check, without viewing the solution. */
  firstTry: boolean;
  viewedSolution: boolean;
  points: number;
}

export const emptyState = (): QuestionState => ({ tries: 0, correct: false, firstTry: false, viewedSolution: false, points: 0 });

export const maxPoints = (q: Question, lesson: Lesson): number => (isGradable(q) ? (q.points ?? lesson.basePoints) : 0);

/** SPEC §4.3: first try = full, second = half, third or later = 2, after viewing the solution = 0. */
export function pointsFor(full: number, tryNumber: number, viewedSolution: boolean): number {
  if (viewedSolution || full === 0) return 0;
  if (tryNumber <= 1) return full;
  if (tryNumber === 2) return Math.ceil(full / 2);
  return Math.min(2, full);
}

/** Lesson accuracy = first-try-correct questions ÷ gradable questions, 0–100. */
export function accuracy(lesson: Lesson, states: Record<string, QuestionState>): number {
  const gradable = lesson.questions.filter(isGradable);
  if (gradable.length === 0) return 100;
  const first = gradable.filter((q) => states[q.id]?.firstTry).length;
  return Math.round((first / gradable.length) * 100);
}

export const totalPoints = (states: Record<string, QuestionState>): number =>
  Object.values(states).reduce((sum, s) => sum + s.points, 0);
