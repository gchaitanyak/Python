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

/** User code must not reach the network: remove the worker's network APIs once Pyodide is loaded. */
function blockNetwork(): void {
  const blocked = () => {
    throw new Error('Network access is disabled in exercises.');
  };
  for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts'] as const) {
    Object.defineProperty(self, name, { value: blocked, configurable: false, writable: false });
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

self.onmessage = (event: MessageEvent<ToWorker>) => {
  const msg = event.data;
  if (msg.type === 'init') {
    void init();
    return;
  }
  if (!pyodide) return;
  const { type, id, ...payload } = msg;
  const fn = pyodide.globals.get(type === 'run' ? '_api_run' : '_api_grade') as (p: string) => string;
  const result = JSON.parse(fn(JSON.stringify(payload)));
  post(type === 'run' ? { type: 'result', id, ...result } : { type: 'graded', id, ...result });
};
