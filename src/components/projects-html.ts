/**
 * Static HTML for projects (SPEC §5.8), rendered at build time: the grid on
 * /projects/ and /learn/, and the top of each /projects/<id>/ page. Client code
 * marks finished projects through [data-project-id].
 */
import { projectUrl, type Project, type ProjectInfo } from '../lib/projects';
import { renderMarkdown } from '../player/markdown';
import { escapeHtml } from './html';

const written = (p: ProjectInfo) => p.status === 'written';

function badge(p: ProjectInfo): string {
  if (!written(p)) return '<span class="badge badge--soon">Coming soon</span>';
  return p.free ? '<span class="badge badge--free">Free</span>' : '<span class="badge badge--premium">Premium</span>';
}

export function renderProjectCards(projects: ProjectInfo[]): string {
  return `<ol class="project-grid">${projects
    .map((p) => {
      const title = written(p) ? `<a href="${projectUrl(p.id)}">${escapeHtml(p.title)}</a>` : escapeHtml(p.title);
      return `<li class="project-card" data-project-id="${p.id}">
  <h3 class="project-card__title"><span class="project-card__num">${p.order}.</span> ${title}</h3>
  <p>${escapeHtml(p.summary)}</p>
  <ul class="tags" aria-label="Skills">${p.skills.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>
  <div class="project-card__foot">${badge(p)}<span class="lesson-item__state" data-project-state></span></div>
</li>`;
    })
    .join('')}</ol>`;
}

/** Head tags and the intro section for /projects/<id>/ (the player shell follows it). */
export function renderProjectPage(info: ProjectInfo, p: Project): { head: string; intro: string } {
  const head = `<title>${escapeHtml(p.title)} — Python project — Python Exercises</title>
    <meta name="description" content="${escapeHtml(`${p.summary} A guided Python project with ${p.steps.length - 1} checked steps.`)}" />`;
  const steps = p.steps
    .filter((q) => q.type !== 'explain')
    .map((q) => /^\*\*(.+?)\*\*/.exec(q.prompt)?.[1]?.replace(/\.$/, '') ?? q.prompt.split('\n')[0]!)
    .map((t) => `<li>${escapeHtml(t)}</li>`)
    .join('');
  const datasets = p.datasets
    .map(
      (d) =>
        `<li><a class="btn btn--secondary" data-dataset="${escapeHtml(d.file)}" ${info.free ? `href="/data/projects/${info.id}/${encodeURIComponent(d.file)}" download` : 'href="#" aria-disabled="true"'}>Download ${escapeHtml(d.file)}</a> <span class="help-text">${escapeHtml(d.description)}</span></li>`,
    )
    .join('');
  const intro = `<section class="container project-intro" data-project-intro data-project-id="${info.id}" data-project-free="${info.free}" aria-labelledby="project-title">
  <nav aria-label="Breadcrumb" class="crumbs"><a href="/learn/">Learn</a> <span aria-hidden="true">›</span> <a href="/projects/">Projects</a></nav>
  <p class="eyebrow">Project ${info.order} · ${info.free ? 'Free' : 'Premium'} · about ${p.estimatedMinutes} minutes</p>
  <h1 id="project-title">${escapeHtml(p.title)}</h1>
  <div class="prose">${renderMarkdown(p.brief)}</div>
  <ul class="tags" aria-label="Skills">${info.skills.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>
  <div class="project-intro__cols">
    <div>
      <h2>Steps</h2>
      <ol class="project-steps">${steps}</ol>
    </div>
    <div>
      <h2>Files</h2>
      <ul class="project-files">${datasets}<li><a class="btn btn--secondary" data-starter href="#" aria-disabled="true">Download starter .py</a> <span class="help-text">Every step as comments, to keep working in your own editor.</span></li></ul>
    </div>
  </div>
  <div class="alert" data-project-status role="status" aria-live="polite" hidden></div>
  <button class="btn btn--primary btn--lg" type="button" data-project-start disabled>Start project</button>
</section>`;
  return { head, intro };
}
