import { lessonsInOrder } from '../lib/curriculum';
import type { Curriculum, Lesson, Question } from './types';

export const ROUND_SIZE = 20;

/** Lessons whose questions can appear as flashcards: completed ones, optionally within one module. */
export function flashcardLessonIds(c: Curriculum, completed: Set<string>, moduleId?: string | null): string[] {
  return lessonsInOrder(c)
    .filter((p) => completed.has(p.lesson.id) && (!moduleId || p.module.id === moduleId))
    .map((p) => p.lesson.id);
}

/**
 * A round of cards: gradable questions shuffled (repeating if there are fewer
 * than the round size), renumbered q01… so they can share one player session.
 */
export function buildDeck(lessons: Lesson[], rand: () => number = Math.random, size = ROUND_SIZE): Question[] {
  const pool = lessons.flatMap((l) => l.questions.filter((q) => q.type !== 'explain'));
  if (pool.length === 0) return [];
  const deck: Question[] = [];
  while (deck.length < size) {
    const batch = [...pool];
    for (let i = batch.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [batch[i], batch[j]] = [batch[j]!, batch[i]!];
    }
    deck.push(...batch.slice(0, size - deck.length));
  }
  return deck.map((q, i) => ({ ...q, id: `q${String(i + 1).padStart(2, '0')}` }));
}
