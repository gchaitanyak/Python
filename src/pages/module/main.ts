import '../../lib/page';
import '../../styles/curriculum.css';
import { lessonAccess, lessonUrl, moduleProgress, moduleUrl, sortedLessons, unfinishedEarlierModule } from '../../lib/curriculum';
import { decorateLessons } from '../../lib/progress-view';
import { loadCurriculum } from '../../player/lesson-loader';
import { resolveVisitor } from '../../lib/visitor';
import { escapeHtml } from '../../components/html';

const main = document.querySelector<HTMLElement>('[data-module-page]')!;
const moduleId = main.dataset.modulePage!;
void Promise.all([resolveVisitor(), loadCurriculum()]).then(([{ visitor }, curriculum]) => {
  const module = curriculum.modules.find((m) => m.id === moduleId);
  if (!module) return;
  decorateLessons(main, curriculum, visitor);

  const { done, total } = moduleProgress(module, visitor);
  main.querySelector('[data-module-progress]')!.textContent = `${done} of ${total} lessons done`;

  // Point "Start module" at the first lesson the visitor can open and hasn't finished.
  const start = main.querySelector<HTMLAnchorElement>('[data-module-start]');
  const resume = sortedLessons(module).find(
    (l) => !visitor.progress[l.id]?.completed && lessonAccess(curriculum, l.id, visitor).kind === 'open',
  );
  if (start && resume) {
    start.href = lessonUrl(resume.id);
    start.textContent = done > 0 ? `Continue: ${resume.title}` : 'Start module';
  }

  const earlier = unfinishedEarlierModule(curriculum, moduleId, visitor);
  const note = main.querySelector<HTMLElement>('[data-module-note]');
  if (earlier && note) {
    note.innerHTML = `Recommended: finish <a href="${moduleUrl(earlier.id)}">${escapeHtml(earlier.title)}</a> first.`;
    note.hidden = false;
  }
});
