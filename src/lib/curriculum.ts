/**
 * Curriculum rules shared by the dashboard, module pages and the player:
 * learning order, access/lock state (SPEC §5.3, §6), review status (SPEC §5.1)
 * and the next recommended lesson.
 */
import type { Curriculum, CurriculumLesson, CurriculumModule } from '../player/types';

export interface LessonRecord {
  completed: boolean;
  bestAccuracy: number;
  lastPractisedAt: string;
}

export interface Visitor {
  signedIn: boolean;
  premium: boolean;
  progress: Record<string, LessonRecord | undefined>;
}

export const anonymous = (progress: Visitor['progress'] = {}): Visitor => ({ signedIn: false, premium: false, progress });

/** Why a lesson can't be opened, in the priority order of SPEC §6. */
export type Access =
  | { kind: 'open' }
  | { kind: 'coming-soon' }
  | { kind: 'sign-in' }
  | { kind: 'upgrade' }
  | { kind: 'finish-previous'; previous: CurriculumLesson };

export type Status = 'not-started' | 'needs-attention' | 'review-due' | 'strong';

export const REVIEW_AFTER_DAYS = 14;
export const STRONG_ACCURACY = 70;

export const sortedModules = (c: Curriculum): CurriculumModule[] => [...c.modules].sort((a, b) => a.order - b.order);
export const sortedLessons = (m: CurriculumModule): CurriculumLesson[] => [...m.lessons].sort((a, b) => a.order - b.order);

export interface Placed {
  lesson: CurriculumLesson;
  module: CurriculumModule;
  /** Position within its module, from 0. */
  index: number;
}

/** Every lesson in learning order. */
export function lessonsInOrder(c: Curriculum): Placed[] {
  return sortedModules(c).flatMap((module) => sortedLessons(module).map((lesson, index) => ({ lesson, module, index })));
}

export function findLesson(c: Curriculum, lessonId: string): Placed | undefined {
  return lessonsInOrder(c).find((p) => p.lesson.id === lessonId);
}

export const isWritten = (l: CurriculumLesson): boolean => l.status === 'written';
export const isCompleted = (v: Visitor, lessonId: string): boolean => !!v.progress[lessonId]?.completed;

/** Can this visitor's plan open the lesson at all (ignoring order)? */
export const canPlay = (v: Visitor, l: CurriculumLesson): boolean => isWritten(l) && (l.free || (v.signedIn && v.premium));

/**
 * Lock state for one lesson. Lesson n in a module opens once lesson n−1 is
 * completed; every module's first lesson is always open (modules aren't
 * locked to each other).
 */
export function lessonAccess(c: Curriculum, lessonId: string, v: Visitor): Access {
  const placed = findLesson(c, lessonId);
  if (!placed) return { kind: 'coming-soon' };
  const { lesson, module, index } = placed;
  if (!isWritten(lesson)) return { kind: 'coming-soon' };
  if (!lesson.free && !v.signedIn) return { kind: 'sign-in' };
  if (!lesson.free && !v.premium) return { kind: 'upgrade' };
  const previous = index > 0 ? sortedLessons(module)[index - 1] : undefined;
  if (previous && !isCompleted(v, previous.id)) return { kind: 'finish-previous', previous };
  return { kind: 'open' };
}

const daysBetween = (from: Date, to: Date): number => (to.getTime() - from.getTime()) / 86_400_000;

/** Dashboard colour status (SPEC §5.1). */
export function lessonStatus(record: LessonRecord | undefined, now: Date): Status {
  if (!record?.completed) return 'not-started';
  if (record.bestAccuracy < STRONG_ACCURACY) return 'needs-attention';
  if (daysBetween(new Date(record.lastPractisedAt), now) >= REVIEW_AFTER_DAYS) return 'review-due';
  return 'strong';
}

export const STATUS_LABEL: Record<Status, string> = {
  'not-started': 'Not started',
  'needs-attention': 'Needs attention',
  'review-due': 'Review due',
  strong: 'Strong',
};

/**
 * Next recommended lesson: the first incomplete lesson the visitor can open;
 * if everything they can play is complete, the one practised longest ago that
 * is due for review.
 */
export function nextRecommended(c: Curriculum, v: Visitor, now: Date): CurriculumLesson | undefined {
  const playable = lessonsInOrder(c).filter((p) => canPlay(v, p.lesson));
  const first = playable.find((p) => !isCompleted(v, p.lesson.id) && lessonAccess(c, p.lesson.id, v).kind === 'open');
  if (first) return first.lesson;
  return playable
    .filter((p) => lessonStatus(v.progress[p.lesson.id], now) === 'review-due')
    .sort((a, b) => Date.parse(v.progress[a.lesson.id]!.lastPractisedAt) - Date.parse(v.progress[b.lesson.id]!.lastPractisedAt))[0]?.lesson;
}

/** The first earlier module with lessons the visitor could still complete — for the "finish X first" note. */
export function unfinishedEarlierModule(c: Curriculum, moduleId: string, v: Visitor): CurriculumModule | undefined {
  const modules = sortedModules(c);
  const at = modules.findIndex((m) => m.id === moduleId);
  return modules
    .slice(0, Math.max(at, 0))
    .filter((m) => !m.optional)
    .find((m) => m.lessons.some((l) => canPlay(v, l) && !isCompleted(v, l.id)));
}

/** Completed / playable lesson counts for a module. */
export function moduleProgress(m: CurriculumModule, v: Visitor): { done: number; total: number } {
  return { done: m.lessons.filter((l) => isCompleted(v, l.id)).length, total: m.lessons.length };
}

export const lessonUrl = (lessonId: string): string => `/practice/?lesson=${encodeURIComponent(lessonId)}`;
export const moduleUrl = (moduleId: string): string => `/learn/${moduleId}/`;
