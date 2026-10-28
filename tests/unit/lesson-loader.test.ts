import { describe, expect, it } from 'vitest';
import { loadLesson } from '../../src/player/lesson-loader';

const curriculum = {
  modules: [
    { id: 'm2', order: 2, title: 'Second', lessons: [{ id: 'py-c', order: 1, title: 'C', free: true, status: 'written' }] },
    {
      id: 'm1',
      order: 1,
      title: 'First',
      lessons: [
        { id: 'py-b', order: 2, title: 'B', free: false, status: 'to-write' },
        { id: 'py-a', order: 1, title: 'A', free: true, status: 'written' },
      ],
    },
  ],
};

const fakeFetch = (async (url: string) => {
  if (url === '/data/curriculum.json') return new Response(JSON.stringify(curriculum));
  if (url === '/data/lessons/py-a.json') return new Response(JSON.stringify({ id: 'py-a', questions: [] }));
  return new Response('Not found', { status: 404 });
}) as typeof fetch;

describe('loadLesson', () => {
  it('loads a free lesson and finds the next one in learning order', async () => {
    const r = await loadLesson('py-a', fakeFetch);
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.next?.id).toBe('py-b');
  });

  it('locks premium lessons without fetching them', async () => {
    expect((await loadLesson('py-b', fakeFetch)).status).toBe('locked');
  });

  it('reports free lessons that are not written yet', async () => {
    expect((await loadLesson('py-c', fakeFetch)).status).toBe('unavailable');
  });

  it('rejects unknown or malformed ids', async () => {
    expect((await loadLesson('py-zzz', fakeFetch)).status).toBe('not-found');
    expect((await loadLesson('../secrets', fakeFetch)).status).toBe('not-found');
    expect((await loadLesson(null, fakeFetch)).status).toBe('not-found');
  });
});
