import '../../lib/page';
import '../../styles/player.css';
import '../../styles/projects.css';
import { loginUrl } from '../../lib/page';
import { recordFinished } from '../../lib/project-progress';
import { projectToLesson, starterScript, type Project } from '../../lib/projects';
import { currentSession, isPremium } from '../../lib/session';
import { formatSeconds, Player } from '../../player/player';
import { PythonClient } from '../../player/python-client';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const root = $('[data-player]');
const intro = $('[data-project-intro]');
const startButton = $<HTMLButtonElement>('[data-project-start]');
const status = $('[data-project-status]');
const { projectId = '', projectFree } = intro.dataset;
const free = projectFree === 'true';

root.querySelector<HTMLElement>('[data-head]')!.hidden = true;

function say(kind: 'info' | 'error' | 'success', html: string): void {
  status.hidden = false;
  status.className = `alert alert--${kind}`;
  status.innerHTML = html;
}

function download(name: string, text: string, type: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

let player: Player | undefined;
let pending: Parameters<Player['setPythonStatus']> = ['loading'];
// Python starts loading straight away, while the brief is read.
const python = new PythonClient(
  () => new Worker(new URL('../../worker/python.worker.ts', import.meta.url), { type: 'module' }),
  (s, detail) => {
    pending = [s, detail];
    player?.setPythonStatus(s, detail);
  },
);
player = new Player(root, python);
player.setPythonStatus(...pending);

async function load(): Promise<{ project?: Project; uid?: string }> {
  const session = await currentSession().catch(() => null);
  const uid = session?.user.uid;
  const here = location.pathname;
  if (free) {
    const res = await fetch(`/data/projects/${projectId}.json`);
    return { project: res.ok ? ((await res.json()) as Project) : undefined, uid };
  }
  if (!session) {
    say('info', `This is a premium project. <a href="${loginUrl(here)}">Log in</a> or <a href="/pricing/?next=${encodeURIComponent(here)}">see plans</a> to start it.`);
    return {};
  }
  if (!isPremium(session.profile)) {
    say('info', `This project is part of premium, with every lesson and the certificate. <a class="btn btn--primary" href="/pricing/?next=${encodeURIComponent(here)}">See plans</a>`);
    return { uid };
  }
  const { firebase } = await import('../../lib/firebase');
  const { doc, getDoc } = await import('firebase/firestore');
  const snap = await getDoc(doc(firebase().db, 'projectContent', projectId));
  return { project: snap.exists() ? (snap.data() as Project) : undefined, uid };
}

void (async () => {
  let project: Project | undefined;
  let uid: string | undefined;
  try {
    ({ project, uid } = await load());
  } catch {
    say('error', 'This project couldn’t be loaded. Check your connection and reload the page.');
    return;
  }
  if (!project) {
    if (status.hidden) say('error', 'This project couldn’t be loaded. Reload the page to try again.');
    return;
  }
  const p = project;

  // Premium dataset files come from the loaded project rather than a public URL.
  for (const link of document.querySelectorAll<HTMLAnchorElement>('[data-dataset]')) {
    const file = p.datasets.find((d) => d.file === link.dataset.dataset);
    if (!file?.content || link.hasAttribute('download')) continue;
    link.removeAttribute('aria-disabled');
    link.addEventListener('click', (e) => {
      e.preventDefault();
      download(file.file, file.content!, file.file.endsWith('.json') ? 'application/json' : 'text/csv');
    });
  }
  const starter = $<HTMLAnchorElement>('[data-starter]');
  starter.removeAttribute('aria-disabled');
  starter.addEventListener('click', (e) => {
    e.preventDefault();
    download(`${p.id}-starter.py`, starterScript(p, location.origin), 'text/x-python');
  });

  startButton.disabled = false;
  startButton.addEventListener('click', () => {
    intro.hidden = true;
    root.querySelector<HTMLElement>('[data-head]')!.hidden = false;
    player!.start(projectToLesson(p), {
      mode: 'project',
      crumb: { text: 'Projects', href: '/projects/' },
      onFinish: (ctx) => {
        void recordFinished(p.id, uid).catch(() => undefined);
        ctx.summary.innerHTML = `<h2 class="summary__title" tabindex="-1">Project complete!</h2>
          <p>You finished <strong>${p.title}</strong>: ${ctx.correct} of ${ctx.total} steps passed in ${formatSeconds(ctx.seconds)}.</p>
          <p>Keep going on your own computer with the starter file and the dataset, or try another project.</p>
          <div class="summary__actions"><a class="btn btn--primary" href="/projects/">More projects</a><a class="btn btn--ghost" href="/learn/">Back to Learn</a></div>`;
        ctx.summary.querySelector<HTMLElement>('.summary__title')!.focus();
      },
    });
  });
})();
