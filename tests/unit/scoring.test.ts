import { describe, expect, it } from 'vitest';
import { accuracy, emptyState, pointsFor } from '../../src/player/scoring';
import type { Lesson } from '../../src/player/types';

describe('pointsFor (SPEC §4.3)', () => {
  it('awards full, half, then 2 points', () => {
    expect(pointsFor(10, 1, false)).toBe(10);
    expect(pointsFor(10, 2, false)).toBe(5);
    expect(pointsFor(15, 2, false)).toBe(8);
    expect(pointsFor(10, 3, false)).toBe(2);
    expect(pointsFor(10, 7, false)).toBe(2);
  });

  it('awards 0 after viewing the solution', () => {
    expect(pointsFor(10, 1, true)).toBe(0);
  });
});

describe('accuracy', () => {
  const lesson = {
    basePoints: 10,
    questions: [
      { id: 'q01', type: 'explain', prompt: '' },
      { id: 'q02', type: 'multiple_choice', prompt: '', hint: '', options: [], answer: 'a' },
      { id: 'q03', type: 'multiple_choice', prompt: '', hint: '', options: [], answer: 'a' },
    ],
  } as unknown as Lesson;

  it('counts first-try-correct gradable questions only', () => {
    const states = { q01: emptyState(), q02: { ...emptyState(), firstTry: true, correct: true }, q03: { ...emptyState(), correct: true } };
    expect(accuracy(lesson, states)).toBe(50);
  });
});
