/**
 * Pure server rules: points, access, days and streaks, answer checks, input
 * validation. No Firebase imports, so they're unit-tested directly; the client
 * has matching versions and tests/unit/server-parity.test.ts keeps them in step.
 */
import type { Curriculum, CurriculumLesson, CurriculumModule, Question, SubmittedAnswer } from './types';

/* ---------- points (SPEC §4.3) ---------- */

export function pointsFor(full: number, tryNumber: number, viewedSolution: boolean): number {
  if (viewedSolution || full === 0) return 0;
  if (tryNumber <= 1) return full;
  if (tryNumber === 2) return Math.ceil(full / 2);
  return Math.min(2, full);
}

export const isGradable = (q: Question): boolean => q.type !== 'explain';

/** Question types whose answer the server can check from the submitted answer alone. */
export const serverCheckable = (q: Question): boolean =>
  q.type === 'multiple_choice' || q.type === 'predict_output' || (q.type === 'fill_blank' && q.matchMode === 'exact');

/** Same normalisation as the harness and the client: ignore trailing spaces and outer blank lines. */
export function checkPredict(learnerText: string, expected: string): boolean {
  const norm = (s: string) =>
    s
      .replace(/\r\n?/g, '\n')
      .replace(/^\n+|\n+$/g, '')
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n');
  return norm(learnerText) === norm(expected);
}

/** Server re-check for non-code answers (ARCHITECTURE §5.3). */
export function checkAnswer(q: Question, answer: SubmittedAnswer | undefined): boolean {
  switch (q.type) {
    case 'multiple_choice':
      return typeof answer?.optionId === 'string' && answer.optionId === q.answer;
    case 'predict_output':
      return typeof answer?.text === 'string' && checkPredict(answer.text, q.expectedOutput ?? '');
    case 'fill_blank': {
      const blanks = answer?.blanks;
      const expected = q.blanks ?? [];
      return Array.isArray(blanks) && blanks.length === expected.length && blanks.every((v, i) => typeof v === 'string' && v.trim() === expected[i]!.trim());
    }
    default:
      return false;
  }
}

/* ---------- curriculum access (SPEC §5.3, §6) ---------- */

export interface Placed {
  lesson: CurriculumLesson;
  module: CurriculumModule;
  index: number;
}

export function lessonsInOrder(c: Curriculum): Placed[] {
  return [...c.modules]
    .sort((a, b) => a.order - b.order)
    .flatMap((module) => [...module.lessons].sort((a, b) => a.order - b.order).map((lesson, index) => ({ lesson, module, index })));
}

export type Access = 'open' | 'not-found' | 'coming-soon' | 'upgrade' | 'finish-previous';

/** Access for a signed-in user. `previousCompleted` is whether lesson n−1 in the module is completed. */
export function lessonAccess(placed: Placed | undefined, premium: boolean, previousCompleted: boolean): Access {
  if (!placed) return 'not-found';
  if (placed.lesson.status !== 'written') return 'coming-soon';
  if (!placed.lesson.free && !premium) return 'upgrade';
  if (placed.index > 0 && !previousCompleted) return 'finish-previous';
  return 'open';
}

export function previousLessonId(placed: Placed): string | undefined {
  if (placed.index === 0) return undefined;
  return [...placed.module.lessons].sort((a, b) => a.order - b.order)[placed.index - 1]?.id;
}

/** Entitlement check matching the Firestore rules' isPremium(). premiumUntil in ms, or null/undefined for no end. */
export function isPremium(user: { entitlement?: string; premiumUntilMs?: number | null } | undefined, nowMs: number): boolean {
  if (!user || user.entitlement !== 'premium') return false;
  return user.premiumUntilMs == null || user.premiumUntilMs > nowMs;
}

/* ---------- days and streaks (SPEC §5.2) ---------- */

export function validTimeZone(tz: unknown): string {
  if (typeof tz !== 'string' || tz.length > 64) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

/** Calendar day (yyyy-mm-dd) in a time zone. */
export function localDay(now: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: validTimeZone(tz), year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** UTC day — the shared day used for leaderboards. */
export const utcDay = (now: Date): string => now.toISOString().slice(0, 10);

export function previousDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export interface Streak {
  count: number;
  lastDay: string | null;
}

/** Record activity on `today`: same day keeps the count, the next day adds one, a gap restarts at 1. */
export function nextStreak(streak: Streak | undefined, today: string): Streak {
  if (streak?.lastDay === today) return streak;
  const count = streak?.lastDay === previousDay(today) ? streak.count + 1 : 1;
  return { count, lastDay: today };
}

/** Streak as of `today` (0 once a day has been missed). */
export function currentStreak(streak: Streak | undefined, today: string): number {
  if (!streak?.lastDay) return 0;
  return streak.lastDay === today || streak.lastDay === previousDay(today) ? streak.count : 0;
}

/* ---------- usernames (SPEC §8) ---------- */

const RESERVED = new Set(['admin', 'administrator', 'support', 'help', 'root', 'system', 'moderator', 'staff', 'python', 'pythonexercises']);

/** Lower-cases and validates a username: 3–20 of [a-z0-9_]. Returns an error message or the normalised name. */
export function normaliseUsername(input: unknown): { ok: true; username: string } | { ok: false; error: string } {
  if (typeof input !== 'string') return { ok: false, error: 'Choose a username.' };
  const username = input.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(username)) return { ok: false, error: 'Usernames are 3–20 characters: letters, numbers and _.' };
  if (RESERVED.has(username)) return { ok: false, error: 'That username is reserved. Try another.' };
  return { ok: true, username };
}

/* ---------- anonymous progress merge ---------- */

export interface MergeEntry {
  lessonId: string;
  completed: boolean;
  bestAccuracy: number;
  lastPractisedAtMs: number;
}

export const MAX_MERGE = 200;

/** Keeps only well-formed entries for free, written lessons; clamps accuracy and dates. */
export function sanitiseMerge(raw: unknown, c: Curriculum, nowMs: number): MergeEntry[] {
  if (!Array.isArray(raw)) return [];
  const free = new Map(lessonsInOrder(c).filter((p) => p.lesson.free && p.lesson.status === 'written').map((p) => [p.lesson.id, p]));
  const seen = new Set<string>();
  const out: MergeEntry[] = [];
  for (const item of raw.slice(0, MAX_MERGE)) {
    if (!item || typeof item !== 'object') continue;
    const e = item as Record<string, unknown>;
    if (typeof e.lessonId !== 'string' || !free.has(e.lessonId) || seen.has(e.lessonId)) continue;
    if (e.completed !== true) continue;
    seen.add(e.lessonId);
    const acc = typeof e.bestAccuracy === 'number' && Number.isFinite(e.bestAccuracy) ? Math.round(Math.min(100, Math.max(0, e.bestAccuracy))) : 0;
    const parsed = typeof e.lastPractisedAt === 'string' ? Date.parse(e.lastPractisedAt) : NaN;
    const when = Number.isFinite(parsed) && parsed <= nowMs && parsed >= Date.UTC(2024, 0, 1) ? parsed : nowMs;
    out.push({ lessonId: e.lessonId, completed: true, bestAccuracy: acc, lastPractisedAtMs: when });
  }
  return out;
}
