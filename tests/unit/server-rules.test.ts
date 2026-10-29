import { describe, expect, it } from 'vitest';
import {
  checkAnswer,
  currentStreak,
  lessonAccess,
  lessonsInOrder,
  localDay,
  nextStreak,
  normaliseUsername,
  pointsFor,
  previousDay,
  sanitiseMerge,
  utcDay,
  validTimeZone,
} from '../../functions/src/lib/rules';
import type { Curriculum } from '../../functions/src/lib/types';
import { anonymous, lessonAccess as clientAccess } from '../../src/lib/curriculum';
import { checkPredict as clientCheckPredict } from '../../src/player/grading';
import { pointsFor as clientPoints } from '../../src/player/scoring';
import { checkPredict } from '../../functions/src/lib/rules';
import real from '../../content/curriculum.json';

const curriculum = real as Curriculum;

describe('server/client parity', () => {
  it('awards the same points as the player', () => {
    for (const full of [0, 1, 2, 5, 10, 15, 25]) {
      for (const tries of [1, 2, 3, 4, 9]) {
        for (const viewed of [false, true]) expect(pointsFor(full, tries, viewed)).toBe(clientPoints(full, tries, viewed));
      }
    }
  });

  it('normalises predicted output the same way', () => {
    for (const [a, b] of [['10  \n', '10'], ['a\r\nb', 'a\nb'], [' 10', '10'], ['\n\nx\n', 'x']] as const) {
      expect(checkPredict(a, b)).toBe(clientCheckPredict(a, b));
    }
  });

  it('agrees with the client on access for every lesson', () => {
    for (const p of lessonsInOrder(curriculum)) {
      for (const premium of [false, true]) {
        for (const prevDone of [false, true]) {
          const prev = p.index > 0 ? [...p.module.lessons].sort((a, b) => a.order - b.order)[p.index - 1]!.id : undefined;
          const progress = prev && prevDone ? { [prev]: { completed: true, bestAccuracy: 100, lastPractisedAt: '2026-01-01' } } : {};
          const client = clientAccess(real as unknown as import("../../src/player/types").Curriculum, p.lesson.id, { ...anonymous(progress), signedIn: true, premium }).kind;
          expect(lessonAccess(p, premium, !prev || prevDone)).toBe(client);
        }
      }
    }
  });
});

describe('checkAnswer', () => {
  it('re-checks non-code answers', () => {
    expect(checkAnswer({ id: 'q', type: 'multiple_choice', answer: 'b' }, { optionId: 'b' })).toBe(true);
    expect(checkAnswer({ id: 'q', type: 'multiple_choice', answer: 'b' }, { optionId: 'a' })).toBe(false);
    expect(checkAnswer({ id: 'q', type: 'multiple_choice', answer: 'b' }, undefined)).toBe(false);
    expect(checkAnswer({ id: 'q', type: 'predict_output', expectedOutput: '7\n3 + 4' }, { text: '7  \n3 + 4\n' })).toBe(true);
    expect(checkAnswer({ id: 'q', type: 'fill_blank', matchMode: 'exact', blanks: ['float'] }, { blanks: [' float '] })).toBe(true);
    expect(checkAnswer({ id: 'q', type: 'fill_blank', matchMode: 'exact', blanks: ['float'] }, { blanks: ['int'] })).toBe(false);
  });
});

describe('days and streaks', () => {
  it('uses the user’s time zone for the local day', () => {
    const t = new Date('2026-10-29T02:30:00Z');
    expect(localDay(t, 'UTC')).toBe('2026-10-29');
    expect(localDay(t, 'America/Los_Angeles')).toBe('2026-10-28');
    expect(localDay(t, 'Asia/Tokyo')).toBe('2026-10-29');
    expect(localDay(t, 'Not/AZone')).toBe('2026-10-29');
    expect(validTimeZone('Europe/Lisbon')).toBe('Europe/Lisbon');
    expect(utcDay(t)).toBe('2026-10-29');
  });

  it('steps back across month and year boundaries', () => {
    expect(previousDay('2026-03-01')).toBe('2026-02-28');
    expect(previousDay('2027-01-01')).toBe('2026-12-31');
  });

  it('extends on consecutive days, holds within a day and restarts after a gap', () => {
    let s = nextStreak(undefined, '2026-10-27');
    expect(s).toEqual({ count: 1, lastDay: '2026-10-27' });
    s = nextStreak(s, '2026-10-27');
    expect(s.count).toBe(1);
    s = nextStreak(s, '2026-10-28');
    expect(s.count).toBe(2);
    expect(currentStreak(s, '2026-10-29')).toBe(2);
    expect(currentStreak(s, '2026-10-30')).toBe(0);
    expect(nextStreak(s, '2026-10-31').count).toBe(1);
  });
});

describe('usernames', () => {
  it('lower-cases and enforces 3–20 of [a-z0-9_]', () => {
    expect(normaliseUsername('Ada_Lovelace')).toEqual({ ok: true, username: 'ada_lovelace' });
    expect(normaliseUsername('ab').ok).toBe(false);
    expect(normaliseUsername('a'.repeat(21)).ok).toBe(false);
    expect(normaliseUsername('no spaces').ok).toBe(false);
    expect(normaliseUsername('admin').ok).toBe(false);
    expect(normaliseUsername(42).ok).toBe(false);
  });
});

describe('sanitiseMerge', () => {
  const now = Date.parse('2026-10-29T12:00:00Z');
  it('keeps completed free lessons only, once each, with clamped values', () => {
    const out = sanitiseMerge(
      [
        { lessonId: 'py-variables', completed: true, bestAccuracy: 140, lastPractisedAt: '2026-10-28T10:00:00Z' },
        { lessonId: 'py-variables', completed: true, bestAccuracy: 10, lastPractisedAt: '2026-10-28T10:00:00Z' },
        { lessonId: 'py-comparison-logical', completed: true, bestAccuracy: 90 },
        { lessonId: 'py-strings-basics', completed: true, bestAccuracy: 90 },
        { lessonId: 'py-lists-basics', completed: false, bestAccuracy: 90 },
        { lessonId: 'py-intro-first-program', completed: true, bestAccuracy: 'x', lastPractisedAt: '2099-01-01' },
        'junk',
      ],
      curriculum,
      now,
    );
    expect(out).toEqual([
      { lessonId: 'py-variables', completed: true, bestAccuracy: 100, lastPractisedAtMs: Date.parse('2026-10-28T10:00:00Z') },
      { lessonId: 'py-intro-first-program', completed: true, bestAccuracy: 0, lastPractisedAtMs: now },
    ]);
    expect(sanitiseMerge('nope', curriculum, now)).toEqual([]);
  });
});
