/// <reference lib="webworker" />
import type { PyodideInterface } from 'pyodide';
import harnessSource from './harness.py?raw';
import type { FromWorker, ToWorker } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

const PYODIDE_URL = '/pyodide/';

// Glue between JSON strings and the harness, so no Python proxies cross into JS.
const GLUE = `
import json, sys, types
harness = types.ModuleType("harness")
exec(${JSON.stringify(harnessSource)}, harness.__dict__)
sys.modules["harness"] = harness

def _api_run(payload):
    p = json.loads(payload)
    return json.dumps(harness.run_public(p["code"], p.get("setupCode") or "", p.get("stdin")))

def _api_grade(payload):
    p = json.loads(payload)
    return json.dumps(harness.grade(p["code"], p["tests"], p.get("setupCode") or ""))
`;

let pyodide: PyodideInterface | undefined;

function post(message: FromWorker): void {
  self.postMessage(message);
}

/** True only while the worker itself loads packages (never while user code runs). */
let loadingPackages = false;

/**
 * User code must not reach the network: remove the worker's network APIs once
 * Pyodide is loaded. The one exception is `fetch` of this site's own /pyodide/
 * files while the worker is loading a package an exercise imports.
 */
function blockNetwork(): void {
  const realFetch = self.fetch.bind(self);
  const packageBase = new URL(PYODIDE_URL, self.location.origin).href;
  const blocked = () => {
    throw new Error('Network access is disabled in exercises.');
  };
  const guardedFetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), self.location.href).href;
    if (loadingPackages && url.startsWith(packageBase)) return realFetch(input, init);
    return blocked();
  };
  for (const name of ['XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts'] as const) {
    Object.defineProperty(self, name, { value: blocked, configurable: false, writable: false });
  }
  Object.defineProperty(self, 'fetch', { value: guardedFetch, configurable: false, writable: false });
}

const loaded = new Set<string>();

/** Loads packages (e.g. numpy) the code imports, from this site's /pyodide/ folder. Returns an error message, or null. */
async function loadImports(source: string): Promise<string | null> {
  if (!pyodide || !/^\s*(import|from)\s/m.test(source)) return null;
  const key = source.match(/^\s*(?:import|from)\s+[\w.]+/gm)?.join('|') ?? '';
  if (loaded.has(key)) return null;
  loadingPackages = true;
  try {
    await pyodide.loadPackagesFromImports(source);
    loaded.add(key);
    return null;
  } catch (err) {
    return `A library this exercise needs couldn't be loaded (${err instanceof Error ? err.message.split('\n')[0] : String(err)}). Reload the page to try again.`;
  } finally {
    loadingPackages = false;
  }
}

async function init(): Promise<void> {
  if (pyodide) return post({ type: 'ready' });
  try {
    const { loadPyodide } = (await import(/* @vite-ignore */ `${PYODIDE_URL}pyodide.mjs`)) as typeof import('pyodide');
    pyodide = await loadPyodide({ indexURL: PYODIDE_URL });
    pyodide.setStdin({ error: true });
    pyodide.runPython(GLUE);
    blockNetwork();
    post({ type: 'ready' });
  } catch (err) {
    post({ type: 'init-error', message: err instanceof Error ? err.message : String(err) });
  }
}

// Messages are handled one at a time, in order, so package loading never overlaps user code.
let queue: Promise<void> = Promise.resolve();

self.onmessage = (event: MessageEvent<ToWorker>) => {
  const msg = event.data;
  if (msg.type === 'init') {
    void init();
    return;
  }
  queue = queue.then(() => handle(msg));
};

async function handle(msg: Exclude<ToWorker, { type: 'init' }>): Promise<void> {
  if (!pyodide) return;
  const { type, id, ...payload } = msg;
  const tests = type === 'grade' ? msg.tests.map((t) => t.code).join('\n') : '';
  const problem = await loadImports(`${payload.setupCode ?? ''}\n${payload.code}\n${tests}`);
  if (problem) {
    const error = { type: 'ImportError', message: problem, line: null };
    post(type === 'run' ? { type: 'result', id, stdout: '', stderr: '', error } : { type: 'graded', id, passed: false, results: [{ name: 'runs without errors', passed: false, message: problem }], stdout: '', stderr: '', error });
    return;
  }
  post({ type: 'started', id });
  const fn = pyodide.globals.get(type === 'run' ? '_api_run' : '_api_grade') as (p: string) => string;
  const result = JSON.parse(fn(JSON.stringify(payload)));
  post(type === 'run' ? { type: 'result', id, ...result } : { type: 'graded', id, ...result });
}
