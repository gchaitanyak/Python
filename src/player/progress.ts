import type { QuestionState } from './scoring';

/**
 * Anonymous progress in localStorage (SPEC §6). Every access is guarded:
 * storage can be unavailable (private mode, blocked site data) and the player
 * must still work.
 */
export interface LessonProgress {
  completed: boolean;
  bestAccuracy: number;
  bestPoints: number;
  lastPractisedAt: string;
  questionState: Record<string, QuestionState>;
}

export interface LocalProgress {
  version: 1;
  lessons: Record<string, LessonProgress>;
  streak: { count: number; lastDay: string | null };
}

const KEY = 'pe:progress:v1';
const draftKey = (lessonId: string, questionId: string) => `pe:draft:${lessonId}:${questionId}`;

const empty = (): LocalProgress => ({ version: 1, lessons: {}, streak: { count: 0, lastDay: null } });

function storage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function loadProgress(): LocalProgress {
  try {
    const raw = storage()?.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as LocalProgress) : undefined;
    return parsed?.version === 1 ? parsed : empty();
  } catch {
    return empty();
  }
}

function save(progress: LocalProgress): void {
  try {
    storage()?.setItem(KEY, JSON.stringify(progress));
  } catch {
    /* storage full or blocked: progress for this session only */
  }
}

/** Local calendar day, yyyy-mm-dd. */
export function dayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Streak = consecutive local days with at least one completed lesson. */
export function nextStreak(streak: LocalProgress['streak'], now: Date): LocalProgress['streak'] {
  const today = dayKey(now);
  if (streak.lastDay === today) return streak;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const count = streak.lastDay === dayKey(yesterday) ? streak.count + 1 : 1;
  return { count, lastDay: today };
}

/** Streak as shown today: broken if the last active day is before yesterday. */
export function currentStreak(streak: LocalProgress['streak'], now: Date): number {
  if (!streak.lastDay) return 0;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  return streak.lastDay === dayKey(now) || streak.lastDay === dayKey(yesterday) ? streak.count : 0;
}

export interface CompletionResult {
  progress: LocalProgress;
  isNewBest: boolean;
}

/** Record a finished lesson run; keeps the best accuracy and best points. */
export function recordCompletion(
  lessonId: string,
  run: { accuracy: number; points: number; questionState: Record<string, QuestionState> },
  now = new Date(),
): CompletionResult {
  const progress = loadProgress();
  const prev = progress.lessons[lessonId];
  const isNewBest = !prev || run.points > prev.bestPoints;
  progress.lessons[lessonId] = {
    completed: true,
    bestAccuracy: Math.max(prev?.bestAccuracy ?? 0, run.accuracy),
    bestPoints: Math.max(prev?.bestPoints ?? 0, run.points),
    lastPractisedAt: now.toISOString(),
    questionState: run.questionState,
  };
  progress.streak = nextStreak(progress.streak, now);
  save(progress);
  return { progress, isNewBest };
}

/** Total local points = each lesson's best run, so replaying can't farm points. */
export const localPoints = (progress: LocalProgress): number =>
  Object.values(progress.lessons).reduce((sum, l) => sum + l.bestPoints, 0);

export function loadDraft(lessonId: string, questionId: string): string | null {
  try {
    return storage()?.getItem(draftKey(lessonId, questionId)) ?? null;
  } catch {
    return null;
  }
}

export function saveDraft(lessonId: string, questionId: string, code: string | null): void {
  try {
    if (code === null) storage()?.removeItem(draftKey(lessonId, questionId));
    else storage()?.setItem(draftKey(lessonId, questionId), code);
  } catch {
    /* ignore */
  }
}
