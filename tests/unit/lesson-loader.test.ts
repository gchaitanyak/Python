import { describe, expect, it } from 'vitest';
import { anonymous } from '../../src/lib/curriculum';
import { loadLesson } from '../../src/player/lesson-loader';

const lesson = (id: string, order: number, free: boolean, status = 'written') => ({ id, order, title: id.toUpperCase(), free, status });
const curriculum = {
  modules: [
    { id: 'm2', order: 2, title: 'Second', lessons: [lesson('py-c', 1, true, 'to-write')] },
    { id: 'm1', order: 1, title: 'First', lessons: [lesson('py-b', 2, true), lesson('py-a', 1, true), lesson('py-p', 3, false)] },
  ],
};

const requested: string[] = [];
const fakeFetch = (async (url: string) => {
  requested.push(url);
  if (url === '/data/curriculum.json') return new Response(JSON.stringify(curriculum));
  if (/^\/data\/(preview\/)?lessons\/py-[abp]\.json$/.test(url)) return new Response(JSON.stringify({ id: url, questions: [] }));
  return new Response('Not found', { status: 404 });
}) as typeof fetch;

const done = { completed: true, bestAccuracy: 100, lastPractisedAt: '2026-10-01T00:00:00Z' };

describe('loadLesson', () => {
  it('loads a free lesson and finds the next one in learning order', async () => {
    const r = await loadLesson('py-a', anonymous(), { fetcher: fakeFetch });
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.next?.id).toBe('py-b');
  });

  it('asks to finish the previous lesson first', async () => {
    const r = await loadLesson('py-b', anonymous(), { fetcher: fakeFetch });
    expect(r).toMatchObject({ status: 'locked', access: { kind: 'finish-previous', previous: { id: 'py-a' } } });
    expect((await loadLesson('py-b', anonymous({ 'py-a': done }), { fetcher: fakeFetch })).status).toBe('ok');
  });

  it('asks anonymous visitors to sign in for premium lessons without fetching them', async () => {
    requested.length = 0;
    const r = await loadLesson('py-p', anonymous({ 'py-a': done, 'py-b': done }), { fetcher: fakeFetch });
    expect(r).toMatchObject({ status: 'locked', access: { kind: 'sign-in' } });
    expect(requested).toEqual(['/data/curriculum.json']);
  });

  it('opens premium lessons from /data/preview/ in preview mode', async () => {
    requested.length = 0;
    const r = await loadLesson('py-p', anonymous({ 'py-a': done, 'py-b': done }), { fetcher: fakeFetch, preview: true });
    expect(r.status).toBe('ok');
    expect(requested).toContain('/data/preview/lessons/py-p.json');
  });

  it('reads premium lessons through the premium loader for premium accounts', async () => {
    const premium = { signedIn: true, premium: true, progress: { 'py-a': done, 'py-b': done } };
    const loaded: string[] = [];
    const r = await loadLesson('py-p', premium, {
      fetcher: fakeFetch,
      premiumLoader: async (id) => {
        loaded.push(id);
        return { id, questions: [] } as never;
      },
    });
    expect(r.status).toBe('ok');
    expect(loaded).toEqual(['py-p']);
    // A denied read (e.g. the rules refuse) shows as unavailable rather than crashing.
    const denied = await loadLesson('py-p', premium, { fetcher: fakeFetch, premiumLoader: () => Promise.reject(new Error('permission-denied')) });
    expect(denied.status).toBe('unavailable');
  });

  it('reports lessons that are not written yet', async () => {
    expect((await loadLesson('py-c', anonymous(), { fetcher: fakeFetch })).status).toBe('unavailable');
  });

  it('rejects unknown or malformed ids', async () => {
    expect((await loadLesson('py-zzz', anonymous(), { fetcher: fakeFetch })).status).toBe('not-found');
    expect((await loadLesson('../secrets', anonymous(), { fetcher: fakeFetch })).status).toBe('not-found');
    expect((await loadLesson(null, anonymous(), { fetcher: fakeFetch })).status).toBe('not-found');
  });
});
