import { describe, expect, it } from 'vitest';
import { buildDeck, flashcardLessonIds } from '../../src/player/flashcards';
import { seededRandom } from '../../functions/src/lib/challenge';
import type { Curriculum, Lesson } from '../../src/player/types';
import real from '../../content/curriculum.json';

const lesson = (id: string, n: number): Lesson => ({
  id,
  moduleId: 'm',
  title: id,
  estimatedMinutes: 5,
  basePoints: 10,
  intro: '',
  questions: [
    { id: 'q01', type: 'explain', prompt: 'read' },
    ...Array.from({ length: n }, (_, i) => ({ id: `q${String(i + 2).padStart(2, '0')}`, type: 'multiple_choice' as const, prompt: `${id}-${i}`, hint: '', options: [], answer: 'a' })),
  ],
});

describe('flashcards', () => {
  it('uses completed lessons only, optionally within one module', () => {
    const c = real as unknown as Curriculum;
    const done = new Set(['py-intro-first-program', 'py-variables', 'py-lists-basics']);
    expect(flashcardLessonIds(c, done)).toEqual(['py-intro-first-program', 'py-variables', 'py-lists-basics']);
    expect(flashcardLessonIds(c, done, 'variables-types')).toEqual(['py-variables']);
    expect(flashcardLessonIds(c, new Set())).toEqual([]);
  });

  it('builds a full round of gradable questions with unique ids, repeating a small pool', () => {
    const deck = buildDeck([lesson('a', 3), lesson('b', 2)], seededRandom('x'));
    expect(deck).toHaveLength(20);
    expect(new Set(deck.map((q) => q.id)).size).toBe(20);
    expect(deck.every((q) => q.type !== 'explain')).toBe(true);
    // Every question appears before any repeats.
    expect(new Set(deck.slice(0, 5).map((q) => q.prompt)).size).toBe(5);
  });

  it('is empty when there is nothing to practise', () => {
    expect(buildDeck([])).toEqual([]);
    expect(buildDeck([lesson('a', 0)])).toEqual([]);
  });
});
