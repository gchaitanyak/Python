import { afterEach, describe, expect, it, vi } from 'vitest';
import { PACKAGE_TIMEOUT_MS, PythonClient, TIMEOUT_MESSAGE, TIMEOUT_MS } from '../../src/player/python-client';
import type { FromWorker, ToWorker } from '../../src/worker/protocol';

/**
 * Fake worker: answers 'init' with ready; 'run' reports started, then echoes the
 * code as stdout unless it contains "while True". Code containing "import pandas"
 * waits for `loadPackages()` before it starts, like a slow package download.
 */
class FakeWorker {
  static created = 0;
  static loadPackages: () => void = () => {};
  terminated = false;
  onmessage: ((e: MessageEvent<FromWorker>) => void) | null = null;
  constructor() {
    FakeWorker.created++;
  }
  postMessage(msg: ToWorker) {
    const reply = (data: FromWorker) => queueMicrotask(() => this.onmessage?.({ data } as MessageEvent<FromWorker>));
    if (msg.type === 'init') return reply({ type: 'ready' });
    if (msg.type !== 'run') return;
    const go = () => {
      reply({ type: 'started', id: msg.id });
      if (!msg.code.includes('while True')) reply({ type: 'result', id: msg.id, stdout: msg.code, stderr: '', error: null });
    };
    if (msg.code.includes('import pandas')) FakeWorker.loadPackages = go;
    else go();
  }
  terminate() {
    this.terminated = true;
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe('PythonClient', () => {
  it('times out a hung run, restarts the worker, and the next run works', async () => {
    vi.useFakeTimers();
    FakeWorker.created = 0;
    const statuses: string[] = [];
    const client = new PythonClient(() => new FakeWorker() as unknown as Worker, (s) => statuses.push(s));

    const hung = client.run('while True: pass');
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS + 10);
    expect(await hung).toMatchObject({ error: { type: 'Timeout', message: TIMEOUT_MESSAGE } });
    expect(FakeWorker.created).toBe(2);

    const next = client.run('print(1)');
    await vi.advanceTimersByTimeAsync(0);
    expect(await next).toMatchObject({ stdout: 'print(1)', error: null });
    expect(statuses).toContain('loading');
  });

  it('gives package loading its own longer limit; the 5 s limit starts with the code', async () => {
    vi.useFakeTimers();
    const client = new PythonClient(() => new FakeWorker() as unknown as Worker);
    const slow = client.run('import pandas');
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS * 4); // still downloading: no timeout yet
    FakeWorker.loadPackages();
    await vi.advanceTimersByTimeAsync(0);
    expect(await slow).toMatchObject({ stdout: 'import pandas', error: null });

    const stuck = client.run('import pandas\nwhile True: pass');
    await vi.advanceTimersByTimeAsync(PACKAGE_TIMEOUT_MS - 1);
    FakeWorker.loadPackages();
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS + 10);
    expect(await stuck).toMatchObject({ error: { type: 'Timeout' } });
  });
});
