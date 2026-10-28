import '../../styles/main.css';
import '../../styles/player.css';
import { anonymous } from '../../lib/curriculum';
import { loadLesson } from '../../player/lesson-loader';
import { loadProgress } from '../../player/progress';
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

const progress = loadProgress();
const visitor = anonymous(progress.lessons);
const preview = import.meta.env.DEV && new URLSearchParams(location.search).has('preview');

loadLesson(lessonId, visitor, { preview })
  .then((result) => player!.show(result))
  .catch(() => player!.show({ status: 'not-found' }));
