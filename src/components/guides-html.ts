/** Static HTML for guides (SPEC §5.9): the /guides/ list and each article page. */
import { lessonUrl } from '../lib/curriculum';
import { guideUrl, renderGuide, type Guide } from '../lib/guides';
import { escapeHtml } from './html';

export function renderGuideCards(guides: Guide[]): string {
  return `<ul class="guide-grid">${guides
    .map(
      (g) => `<li class="guide-card">
  <h2 class="guide-card__title"><a href="${guideUrl(g.slug)}">${escapeHtml(g.title)}</a></h2>
  <p>${escapeHtml(g.description)}</p>
</li>`,
    )
    .join('')}</ul>`;
}

/** Head tags and the article for /guides/<slug>/. `lessonTitle` names the lesson behind "Practise this". */
export function renderGuidePage(g: Guide, lessonTitle: string): { head: string; body: string } {
  const { html, toc } = renderGuide(g);
  const head = `<title>${escapeHtml(g.title)} — Python Exercises</title>
    <meta name="description" content="${escapeHtml(g.description)}" />`;
  const body = `<article class="container guide" aria-labelledby="guide-title">
  <nav aria-label="Breadcrumb" class="crumbs"><a href="/guides/">Guides</a> <span aria-hidden="true">›</span> ${escapeHtml(g.title)}</nav>
  <h1 id="guide-title">${escapeHtml(g.title)}</h1>
  <p class="lead">${escapeHtml(g.description)}</p>
  <nav class="guide__toc" aria-labelledby="toc-title"><h2 id="toc-title">On this page</h2><ol>${toc
    .map((t) => `<li><a href="#${t.id}">${escapeHtml(t.text)}</a></li>`)
    .join('')}</ol></nav>
  <div class="prose guide__body">${html}</div>
  <aside class="card guide__practise" aria-label="Practise this">
    <p><strong>Ready to try it?</strong> Write real code with instant feedback in the <em>${escapeHtml(lessonTitle)}</em> lesson.</p>
    <a class="btn btn--primary" href="${lessonUrl(g.lesson)}">Practise this →</a>
  </aside>
</article>`;
  return { head, body };
}
