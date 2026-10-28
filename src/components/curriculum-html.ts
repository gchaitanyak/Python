/**
 * Static HTML for curriculum views, rendered at build time so module pages and
 * the dashboard are crawlable. Client code adds per-visitor status and locks
 * by looking up [data-lesson-id] elements.
 */
import { lessonUrl, moduleUrl, sortedLessons, sortedModules } from '../lib/curriculum';
import type { Curriculum, CurriculumLesson, CurriculumModule } from '../player/types';
import { escapeHtml } from './html';

const written = (l: CurriculumLesson) => l.status === 'written';

function badge(l: CurriculumLesson): string {
  if (!written(l)) return '<span class="badge badge--soon">Coming soon</span>';
  return l.free ? '<span class="badge badge--free">Free</span>' : '<span class="badge badge--premium">Premium</span>';
}

/** One lesson row: status dot, title (linked when written), badge and a state slot filled client-side. */
export function renderLessonItem(l: CurriculumLesson): string {
  const title = escapeHtml(l.title);
  const link = written(l) ? `<a class="lesson-item__title" href="${lessonUrl(l.id)}">${title}</a>` : `<span class="lesson-item__title">${title}</span>`;
  return `<li class="lesson-item" data-lesson-id="${l.id}" data-status="not-started">
  <span class="status-dot" aria-hidden="true"></span>${link}
  <span class="lesson-item__meta">${badge(l)}<span class="lesson-item__state" data-state-label></span></span>
</li>`;
}

/** Module grid for the /learn/ dashboard. */
export function renderModuleGrid(c: Curriculum): string {
  return `<ol class="module-grid">${sortedModules(c)
    .map(
      (m) => `<li class="module-card" data-module-id="${m.id}">
  <p class="eyebrow">Module ${m.order}${m.optional ? ' · Optional' : ''}</p>
  <h3 class="module-card__title"><a href="${moduleUrl(m.id)}">${escapeHtml(m.title)}</a></h3>
  <p class="module-card__summary">${escapeHtml(m.summary ?? '')}</p>
  <p class="module-card__progress" data-module-progress>${m.lessons.length} lessons</p>
  <ol class="lesson-list">${sortedLessons(m).map(renderLessonItem).join('')}</ol>
</li>`,
    )
    .join('')}</ol>`;
}

/** Compact module list for the landing page. */
export function renderCurriculumOverview(c: Curriculum): string {
  return `<ol class="overview">${sortedModules(c)
    .map(
      (m) => `<li class="overview__item"><a href="${moduleUrl(m.id)}"><span class="overview__num">${m.order}</span><span><strong>${escapeHtml(m.title)}</strong><span class="overview__summary">${escapeHtml(m.summary ?? '')}</span></span></a></li>`,
    )
    .join('')}</ol>`;
}

export function curriculumStats(c: Curriculum): { modules: number; lessons: number; free: number } {
  const lessons = c.modules.flatMap((m) => m.lessons);
  return { modules: c.modules.length, lessons: lessons.length, free: lessons.filter((l) => l.free).length };
}

/** <title>, description and body for /learn/<module>/. */
export function renderModulePage(m: CurriculumModule, c: Curriculum): { head: string; body: string } {
  const modules = sortedModules(c);
  const at = modules.findIndex((x) => x.id === m.id);
  const prev = modules[at - 1];
  const next = modules[at + 1];
  const lessons = sortedLessons(m);
  const first = lessons.find(written);
  const description = `${m.summary ?? ''} ${lessons.length} interactive Python lessons.`.trim();
  const head = `<title>${escapeHtml(m.title)} — Learn Python — Python Exercises</title>
    <meta name="description" content="${escapeHtml(description)}" />`;
  const cards = lessons
    .map((l) => {
      const objectives = l.objectives?.length ? `<ul class="objectives">${l.objectives.map((o) => `<li>${escapeHtml(o)}</li>`).join('')}</ul>` : '';
      const action = written(l)
        ? `<a class="btn btn--ghost" href="${lessonUrl(l.id)}" aria-label="Open lesson: ${escapeHtml(l.title)}">Open</a>`
        : '';
      return `<li class="lesson-card" data-lesson-id="${l.id}" data-status="not-started">
  <div class="lesson-card__head">
    <span class="status-dot" aria-hidden="true"></span>
    <h3 class="lesson-card__title"><span class="lesson-card__num">${l.order}.</span> ${
      written(l) ? `<a href="${lessonUrl(l.id)}">${escapeHtml(l.title)}</a>` : escapeHtml(l.title)
    }</h3>
  </div>
  ${objectives}
  <div class="lesson-card__foot">${badge(l)}<span class="lesson-item__state" data-state-label></span>${action}</div>
</li>`;
    })
    .join('');
  const body = `<section class="page-head container">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/learn/">Learn</a> <span aria-hidden="true">›</span> Module ${m.order}</nav>
  <p class="eyebrow">Module ${m.order}${m.optional ? ' · Optional' : ''}</p>
  <h1>${escapeHtml(m.title)}</h1>
  <p class="lead">${escapeHtml(m.summary ?? '')}</p>
  <p class="note" data-module-note hidden></p>
  <p class="module-progress" data-module-progress>${lessons.length} lessons</p>
  ${first ? `<a class="btn btn--primary" data-module-start href="${lessonUrl(first.id)}">Start module</a>` : '<p>Lessons for this module are being written.</p>'}
</section>
<section class="container" aria-labelledby="lessons-title">
  <h2 id="lessons-title">Lessons</h2>
  <ol class="lesson-cards">${cards}</ol>
  <nav class="module-nav" aria-label="Modules">
    ${prev ? `<a href="${moduleUrl(prev.id)}">← Module ${prev.order}: ${escapeHtml(prev.title)}</a>` : '<span></span>'}
    ${next ? `<a href="${moduleUrl(next.id)}">Module ${next.order}: ${escapeHtml(next.title)} →</a>` : ''}
  </nav>
</section>`;
  return { head, body };
}
