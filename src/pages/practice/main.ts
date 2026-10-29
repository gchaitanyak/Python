import '../../lib/page';
import '../../styles/player.css';
import { call } from '../../lib/session';
import { resolveVisitor } from '../../lib/visitor';
import type { CompleteResult, SubmitResult } from '../../player/account-sync';
import { loadLesson } from '../../player/lesson-loader';
import { Player } from '../../player/player';
import { PythonClient } from '../../player/python-client';

const root = document.querySelector<HTMLElement>('[data-player]')!;
const lessonId = new URLSearchParams(location.search).get('lesson');

let player: Player | undefined;
let pending: Parameters<Player['setPythonStatus']> = ['loading'];

// Start Python straight away; the prompt renders while Pyodide loads.
const python = new PythonClient(
  () => new Worker(new URL('../../worker/python.worker.ts', import.meta.url), { type: 'module' }),
  (status, detail) => {
    pending = [status, detail];
    player?.setPythonStatus(status, detail);
  },
);

player = new Player(root, python);
player.setPythonStatus(...pending);

const preview = import.meta.env.DEV && new URLSearchParams(location.search).has('preview');

void (async () => {
  const { visitor, session } = await resolveVisitor();
  if (session) {
    player!.setAccount({
      submitAnswer: (payload) => call<SubmitResult>('submitAnswer', payload),
      completeLesson: (id, accuracy) => call<CompleteResult>('completeLesson', { lessonId: id, accuracy }),
    });
  }
  try {
    player!.show(await loadLesson(lessonId, visitor, { preview }));
  } catch {
    player!.show({ status: 'not-found' });
  }
})();
