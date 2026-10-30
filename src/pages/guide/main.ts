import '../../lib/page';
import '../../styles/curriculum.css';
import '../../styles/guides.css';
import type { PythonClient } from '../../player/python-client';

/**
 * Run buttons on guide examples. Python (Pyodide) loads only when a reader
 * first presses Run, so the article itself stays fast.
 */
let python: Promise<PythonClient> | undefined;

function client(): Promise<PythonClient> {
  return (python ??= import('../../player/python-client').then(
    ({ PythonClient: Client }) => new Client(() => new Worker(new URL('../../worker/python.worker.ts', import.meta.url), { type: 'module' })),
  ));
}

for (const example of document.querySelectorAll<HTMLElement>('[data-example]')) {
  const button = example.querySelector<HTMLButtonElement>('[data-run]')!;
  const output = example.querySelector<HTMLElement>('[data-output]')!;
  const code = example.querySelector<HTMLElement>('[data-example-code]')!.textContent ?? '';
  button.addEventListener('click', () => {
    button.disabled = true;
    output.hidden = false;
    output.textContent = python ? 'Running…' : 'Loading Python (first run only)…';
    void client()
      .then((c) => c.run(code))
      .then((r) => {
        const parts = [r.stdout.replace(/\n$/, ''), r.stderr.replace(/\n$/, '')].filter(Boolean);
        if (r.error) parts.push(`${r.error.type}: ${r.error.message}`);
        output.textContent = parts.join('\n') || '(no output)';
      })
      .catch(() => {
        output.textContent = 'Python couldn’t start. Reload the page to try again.';
      })
      .finally(() => {
        button.disabled = false;
      });
  });
}
