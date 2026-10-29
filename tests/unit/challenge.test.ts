import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { challengeLessonIds, challengeQuestions, pickChallenge, seededRandom } from '../../functions/src/lib/challenge';
import type { Curriculum, Lesson } from '../../functions/src/lib/types';
import real from '../../content/curriculum.json';

const curriculum = real as Curriculum;
const load = (id: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, `../../content/lessons/${id}.json`), 'utf8')) as Lesson;
const lessons = challengeLessonIds(curriculum).map(load);
const free = new Map(curriculum.modules.flatMap((m) => m.lessons).map((l) => [l.id, l.free]));

describe('seededRandom', () => {
  it('repeats for the same seed and differs between seeds', () => {
    const a = seededRandom('2026-10-29');
    const b = seededRandom('2026-10-29');
    const c = seededRandom('2026-10-30');
    const xs = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(xs);
    expect([c(), c(), c()]).not.toEqual(xs);
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe('pickChallenge (SPEC §5.4)', () => {
  it('picks the same 5 questions for a date, from 5 different daily lessons', () => {
    const one = pickChallenge('2026-10-29', lessons);
    expect(pickChallenge('2026-10-29', lessons)).toEqual(one);
    expect(one).toHaveLength(5);
    expect(new Set(one.map((r) => r.lessonId)).size).toBe(5);
    expect(new Set(one.map((r) => `${r.lessonId}/${r.questionId}`)).size).toBe(5);
  });

  it('varies from day to day', () => {
    const days = ['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'].map((d) => JSON.stringify(pickChallenge(d, lessons)));
    expect(new Set(days).size).toBe(days.length);
  });

  it('never uses explain questions or premium lessons', () => {
    for (const date of ['2026-01-01', '2026-06-15', '2027-02-28']) {
      const refs = pickChallenge(date, lessons);
      for (const r of refs) {
        expect(free.get(r.lessonId)).toBe(true);
        expect(load(r.lessonId).questions.find((q) => q.id === r.questionId)?.type).not.toBe('explain');
      }
    }
  });

  it('still returns 5 questions when fewer than 5 lessons are available', () => {
    expect(pickChallenge('2026-10-29', lessons.slice(0, 2))).toHaveLength(5);
  });

  it('renumbers questions q01–q05 and records their source', () => {
    const refs = pickChallenge('2026-10-29', lessons);
    const qs = challengeQuestions(refs, load);
    expect(qs.map((q) => q.id)).toEqual(['q01', 'q02', 'q03', 'q04', 'q05']);
    expect(qs.map((q) => q.source)).toEqual(refs);
    expect(qs.every((q) => !('points' in q))).toBe(true);
  });
});
