import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentStreak, loadDraft, loadProgress, localPoints, nextStreak, recordCompletion, saveDraft } from '../../src/player/progress';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
});

describe('streaks', () => {
  const day = (d: number) => new Date(2026, 9, d, 12);

  it('grows on consecutive days and resets after a gap', () => {
    let s = nextStreak({ count: 0, lastDay: null }, day(1));
    s = nextStreak(s, day(1));
    expect(s.count).toBe(1);
    s = nextStreak(s, day(2));
    expect(s.count).toBe(2);
    s = nextStreak(s, day(5));
    expect(s.count).toBe(1);
  });

  it('shows 0 once a day has been missed', () => {
    const s = { count: 4, lastDay: '2026-10-02' };
    expect(currentStreak(s, day(3))).toBe(4);
    expect(currentStreak(s, day(4))).toBe(0);
  });
});

describe('recordCompletion', () => {
  it('keeps the best accuracy and points across replays', () => {
    recordCompletion('py-variables', { accuracy: 50, points: 40, questionState: {} });
    const { progress, isNewBest } = recordCompletion('py-variables', { accuracy: 80, points: 30, questionState: {} });
    expect(isNewBest).toBe(false);
    expect(progress.lessons['py-variables']).toMatchObject({ completed: true, bestAccuracy: 80, bestPoints: 40 });
    expect(localPoints(loadProgress())).toBe(40);
  });

  it('survives unavailable storage', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(() => recordCompletion('py-variables', { accuracy: 1, points: 1, questionState: {} })).not.toThrow();
    expect(loadProgress().lessons).toEqual({});
  });
});

describe('drafts', () => {
  it('saves and clears per question', () => {
    saveDraft('py-lists-basics', 'q02', 'x = 1');
    expect(loadDraft('py-lists-basics', 'q02')).toBe('x = 1');
    saveDraft('py-lists-basics', 'q02', null);
    expect(loadDraft('py-lists-basics', 'q02')).toBeNull();
  });
});
