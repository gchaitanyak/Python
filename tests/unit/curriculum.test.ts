import { describe, expect, it } from 'vitest';
import {
  anonymous,
  lessonAccess,
  lessonStatus,
  lessonsInOrder,
  nextRecommended,
  unfinishedEarlierModule,
  type LessonRecord,
  type Visitor,
} from '../../src/lib/curriculum';
import type { Curriculum } from '../../src/player/types';
import real from '../../content/curriculum.json';

const l = (id: string, order: number, free = true, status = 'written') => ({ id, order, title: id, free, status });
const c: Curriculum = {
  modules: [
    { id: 'm1', order: 1, title: 'One', lessons: [l('py-a1', 1), l('py-a2', 2)] },
    { id: 'm2', order: 2, title: 'Two', lessons: [l('py-b1', 1), l('py-b2', 2, false), l('py-b3', 3, true, 'to-write')] },
    { id: 'm3', order: 3, title: 'Three', lessons: [l('py-c1', 1)] },
  ],
};

const now = new Date('2026-10-28T12:00:00Z');
const rec = (accuracy: number, daysAgo = 1): LessonRecord => ({
  completed: true,
  bestAccuracy: accuracy,
  lastPractisedAt: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(),
});

describe('lessonAccess', () => {
  it('opens every module’s first lesson and locks the rest until the previous is done', () => {
    const v = anonymous();
    expect(lessonAccess(c, 'py-a1', v).kind).toBe('open');
    expect(lessonAccess(c, 'py-b1', v).kind).toBe('open');
    expect(lessonAccess(c, 'py-a2', v)).toMatchObject({ kind: 'finish-previous', previous: { id: 'py-a1' } });
    expect(lessonAccess(c, 'py-a2', anonymous({ 'py-a1': rec(90) })).kind).toBe('open');
  });

  it('applies SPEC §6 priority: sign in, then upgrade, then order', () => {
    expect(lessonAccess(c, 'py-b2', anonymous()).kind).toBe('sign-in');
    const free: Visitor = { signedIn: true, premium: false, progress: {} };
    expect(lessonAccess(c, 'py-b2', free).kind).toBe('upgrade');
    expect(lessonAccess(c, 'py-b2', { ...free, premium: true }).kind).toBe('finish-previous');
  });

  it('marks unwritten lessons as coming soon', () => {
    expect(lessonAccess(c, 'py-b3', anonymous()).kind).toBe('coming-soon');
  });
});

describe('lessonStatus (SPEC §5.1)', () => {
  it('maps accuracy and recency to a status', () => {
    expect(lessonStatus(undefined, now)).toBe('not-started');
    expect(lessonStatus(rec(60), now)).toBe('needs-attention');
    expect(lessonStatus(rec(60, 30), now)).toBe('needs-attention');
    expect(lessonStatus(rec(70, 14), now)).toBe('review-due');
    expect(lessonStatus(rec(70, 13), now)).toBe('strong');
  });
});

describe('nextRecommended', () => {
  it('is the first incomplete lesson the visitor can open', () => {
    expect(nextRecommended(c, anonymous(), now)?.id).toBe('py-a1');
    expect(nextRecommended(c, anonymous({ 'py-a1': rec(90) }), now)?.id).toBe('py-a2');
    // m2's premium lesson is skipped for anonymous visitors
    const doneM1B1 = { 'py-a1': rec(90), 'py-a2': rec(90), 'py-b1': rec(90) };
    expect(nextRecommended(c, anonymous(doneM1B1), now)?.id).toBe('py-c1');
  });

  it('falls back to the oldest lesson due for review', () => {
    const all = { 'py-a1': rec(90, 20), 'py-a2': rec(90, 40), 'py-b1': rec(90, 1), 'py-c1': rec(90, 15) };
    expect(nextRecommended(c, anonymous(all), now)?.id).toBe('py-a2');
    const fresh = { 'py-a1': rec(90), 'py-a2': rec(90), 'py-b1': rec(90), 'py-c1': rec(90) };
    expect(nextRecommended(c, anonymous(fresh), now)).toBeUndefined();
  });
});

describe('unfinishedEarlierModule', () => {
  it('names the first earlier module the visitor could still finish', () => {
    expect(unfinishedEarlierModule(c, 'm3', anonymous())?.id).toBe('m1');
    expect(unfinishedEarlierModule(c, 'm3', anonymous({ 'py-a1': rec(90), 'py-a2': rec(90) }))?.id).toBe('m2');
    expect(unfinishedEarlierModule(c, 'm1', anonymous())).toBeUndefined();
  });
});

describe('real curriculum', () => {
  it('has unique lesson ids and starts with the first program lesson', () => {
    const ids = lessonsInOrder(real as Curriculum).map((p) => p.lesson.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe('py-intro-first-program');
  });
});
