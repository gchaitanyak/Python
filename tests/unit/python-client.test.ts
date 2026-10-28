import { afterEach, describe, expect, it, vi } from 'vitest';
import { PythonClient, TIMEOUT_MESSAGE, TIMEOUT_MS } from '../../src/player/python-client';
import type { FromWorker, ToWorker } from '../../src/worker/protocol';

/** Fake worker: answers 'init' with ready; 'run' echoes the code as stdout unless it contains "while True". */
class FakeWorker {
  static created = 0;
  terminated = false;
  onmessage: ((e: MessageEvent<FromWorker>) => void) | null = null;
  constructor() {
    FakeWorker.created++;
  }
  postMessage(msg: ToWorker) {
    const reply = (data: FromWorker) => queueMicrotask(() => this.onmessage?.({ data } as MessageEvent<FromWorker>));
    if (msg.type === 'init') reply({ type: 'ready' });
    else if (msg.type === 'run' && !msg.code.includes('while True')) {
      reply({ type: 'result', id: msg.id, stdout: msg.code, stderr: '', error: null });
    }
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
});
