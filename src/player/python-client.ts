import type { FromWorker, GradeResult, RunResult, ToWorker } from '../worker/protocol';
import type { Test } from './types';

export const TIMEOUT_MS = 5000;
export const TIMEOUT_MESSAGE = 'Your code took too long — check for an infinite loop.';

export type PythonStatus = 'loading' | 'ready' | 'busy' | 'error';

type Pending = { resolve: (msg: FromWorker) => void; timer: ReturnType<typeof setTimeout> };

/**
 * Owns the Python worker. One request at a time; each gets TIMEOUT_MS after it
 * is sent. On timeout the worker is terminated and a fresh one is started, so
 * the next request works.
 */
export class PythonClient {
  private worker!: Worker;
  private ready!: Promise<void>;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly createWorker: () => Worker,
    private readonly onStatus: (status: PythonStatus, detail?: string) => void = () => {},
  ) {
    this.start();
  }

  private start(): void {
    this.onStatus('loading');
    this.worker = this.createWorker();
    this.ready = new Promise((resolve, reject) => {
      this.worker.onmessage = (event: MessageEvent<FromWorker>) => {
        const msg = event.data;
        if (msg.type === 'ready') {
          this.onStatus('ready');
          resolve();
        } else if (msg.type === 'init-error') {
          this.onStatus('error', msg.message);
          reject(new Error(msg.message));
        } else {
          const p = this.pending.get(msg.id);
          if (!p) return;
          clearTimeout(p.timer);
          this.pending.delete(msg.id);
          p.resolve(msg);
        }
      };
    });
    this.ready.catch(() => {});
    this.worker.postMessage({ type: 'init' } satisfies ToWorker);
  }

  private restart(): void {
    this.worker.terminate();
    for (const p of this.pending.values()) clearTimeout(p.timer);
    this.pending.clear();
    this.start();
  }

  /** Serialise requests so a timeout only ever affects the request that caused it. */
  private request(make: (id: number) => ToWorker): Promise<FromWorker | 'timeout'> {
    const job = this.queue.then(async () => {
      await this.ready;
      this.onStatus('busy');
      const id = this.nextId++;
      const result = await new Promise<FromWorker | 'timeout'>((resolve) => {
        const timer = setTimeout(() => {
          this.pending.delete(id);
          this.restart();
          resolve('timeout');
        }, TIMEOUT_MS);
        this.pending.set(id, { resolve, timer });
        this.worker.postMessage(make(id));
      });
      if (result !== 'timeout') this.onStatus('ready');
      return result;
    });
    this.queue = job.catch(() => {});
    return job;
  }

  async run(code: string, setupCode?: string, stdin?: string): Promise<RunResult> {
    const msg = await this.request((id) => ({ type: 'run', id, code, setupCode, stdin }));
    if (msg === 'timeout') return timeoutResult();
    return { stdout: (msg as RunResult).stdout, stderr: (msg as RunResult).stderr, error: (msg as RunResult).error };
  }

  async grade(code: string, tests: Test[], setupCode?: string): Promise<GradeResult> {
    const msg = await this.request((id) => ({ type: 'grade', id, code, tests, setupCode }));
    if (msg === 'timeout') {
      return { ...timeoutResult(), passed: false, results: [{ name: 'time limit', passed: false, message: TIMEOUT_MESSAGE }] };
    }
    const { stdout, stderr, error, passed, results } = msg as GradeResult;
    return { stdout, stderr, error, passed, results };
  }
}

function timeoutResult(): RunResult {
  return { stdout: '', stderr: '', error: { type: 'Timeout', message: TIMEOUT_MESSAGE, line: null } };
}
