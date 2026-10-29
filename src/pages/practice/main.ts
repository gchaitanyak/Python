import '../../lib/page';
import '../../styles/player.css';
import { escapeHtml } from '../../components/html';
import { moduleUrl, type Visitor } from '../../lib/curriculum';
import { loginUrl } from '../../lib/page';
import { call, type Session } from '../../lib/session';
import { resolveVisitor } from '../../lib/visitor';
import type { CompleteResult, SubmitResult } from '../../player/account-sync';
import { buildDeck, flashcardLessonIds } from '../../player/flashcards';
import { loadCurriculum, loadLesson } from '../../player/lesson-loader';
import { formatSeconds, Player } from '../../player/player';
import type { Lesson } from '../../player/types';
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

const params = new URLSearchParams(location.search);
const preview = import.meta.env.DEV && params.has('preview');

void (async () => {
  const { visitor, session } = await resolveVisitor();
  if (params.get('mode') === 'flashcards') return flashcards(session, visitor);
  if (session) {
    player!.setAccount({
      submitAnswer: (payload) => call<SubmitResult>('submitAnswer', payload),
      completeLesson: (id, accuracy) => call<CompleteResult>('completeLesson', { lessonId: id, accuracy }),
      claimShareBonus: () => call('claimShareBonus'),
    });
  }
  try {
    player!.show(await loadLesson(lessonId, visitor, { preview }));
  } catch {
    player!.show({ status: 'not-found' });
  }
})();

/** Flashcard mode (SPEC §2, §6): random questions from completed lessons, round after round. Premium. */
async function flashcards(session: Session | null, visitor: Visitor): Promise<void> {
  const here = location.pathname + location.search;
  if (!session) {
    return player!.showNotice(
      'Sign in required',
      `<div class="lock"><p>Flashcards mix questions from the lessons you’ve completed. Log in to use them.</p><a class="btn btn--primary" href="${loginUrl(here)}">Log in</a></div>`,
    );
  }
  if (!visitor.premium) {
    return player!.showNotice(
      'Upgrade to continue',
      '<div class="lock"><p>Flashcard mode is part of premium. Premium plans are coming soon.</p><a class="btn btn--primary" href="/learn/">Back to Learn</a></div>',
    );
  }
  const curriculum = await loadCurriculum();
  const moduleId = params.get('module');
  const module = curriculum.modules.find((m) => m.id === moduleId);
  const completed = new Set(Object.keys(visitor.progress).filter((id) => visitor.progress[id]?.completed));
  const ids = flashcardLessonIds(curriculum, completed, module?.id);
  const lessons = (
    await Promise.all(ids.map((id) => fetch(`/data/lessons/${id}.json`).then((r) => (r.ok ? (r.json() as Promise<Lesson>) : undefined)).catch(() => undefined)))
  ).filter((l): l is Lesson => !!l);
  const name = module ? module.title : 'All modules';
  if (buildDeck(lessons).length === 0) {
    return player!.showNotice(
      'No flashcards yet',
      `<p>Flashcards use questions from lessons you’ve completed${module ? ` in ${escapeHtml(module.title)}` : ''}. Finish a lesson first.</p><a class="btn btn--primary" href="${module ? moduleUrl(module.id) : '/learn/'}">Choose a lesson</a>`,
    );
  }
  const round = () =>
    player!.start(
      { id: 'flashcards', moduleId: module?.id ?? 'all', title: `Flashcards: ${name}`, estimatedMinutes: 10, basePoints: 0, intro: '', questions: buildDeck(lessons) },
      {
        mode: 'flashcards',
        crumb: { text: name, href: module ? moduleUrl(module.id) : '/learn/' },
        introHtml: `<p>Random questions from the ${lessons.length} ${lessons.length === 1 ? 'lesson' : 'lessons'} you’ve completed. No points — just practice. Keep going as long as you like.</p>`,
        onFinish: (ctx) => {
          ctx.summary.innerHTML = `<h2 class="summary__title" tabindex="-1">Round complete</h2>
            <dl class="stats"><div class="stat"><dt>Correct</dt><dd>${ctx.correct} of ${ctx.total}</dd></div><div class="stat"><dt>Time</dt><dd>${formatSeconds(ctx.seconds)}</dd></div></dl>
            <div class="summary__actions"><button type="button" class="btn btn--primary" data-again>Keep going</button><a class="btn btn--ghost" href="/learn/">Back to Learn</a></div>`;
          ctx.summary.querySelector('[data-again]')!.addEventListener('click', round);
          ctx.summary.querySelector<HTMLElement>('.summary__title')!.focus();
        },
      },
    );
  round();
}
