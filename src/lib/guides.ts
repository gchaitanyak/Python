/**
 * Guides (SPEC §5.9): articles written in Markdown in content/guides/<slug>.md,
 * rendered to static HTML at build time. Front matter gives the title,
 * description and the lesson behind the "Practise this →" link.
 * Fenced ```python blocks become runnable examples; other fences are shown as is.
 */
import { escapeHtml } from '../components/html';

export interface Guide {
  slug: string;
  title: string;
  description: string;
  /** Lesson id for "Practise this →". */
  lesson: string;
  body: string;
}

export const guideUrl = (slug: string): string => `/guides/${slug}/`;

export function parseGuide(slug: string, source: string): Guide {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source.replace(/\r\n?/g, '\n'));
  if (!m) throw new Error(`${slug}: missing front matter`);
  const meta = Object.fromEntries(
    m[1]!.split('\n').map((line) => {
      const at = line.indexOf(':');
      return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
    }),
  );
  for (const key of ['title', 'description', 'lesson']) if (!meta[key]) throw new Error(`${slug}: front matter needs ${key}`);
  return { slug, title: meta.title!, description: meta.description!, lesson: meta.lesson!, body: m[2]!.trim() };
}

/** Python examples in a guide, in order (the validator runs each one). */
export const guideExamples = (g: Guide): string[] => [...g.body.matchAll(/```python\n([\s\S]*?)```/g)].map((x) => x[1]!.replace(/\n$/, ''));

/** Words of prose and code, as a reader sees them. */
export const guideWords = (g: Guide): number => g.body.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

function inline(text: string): string {
  const codes: string[] = [];
  let html = escapeHtml(text).replace(/`([^`]+)`/g, (_m, code: string) => {
    codes.push(`<code>${code}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  html = html
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((\/[^)\s]*)\)/g, '<a href="$2">$1</a>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener" target="_blank">$1</a>');
  return html.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => codes[Number(i)] ?? '');
}

/** The guide body as HTML, plus its section headings for the table of contents. */
export function renderGuide(g: Guide): { html: string; toc: { id: string; text: string }[] } {
  const out: string[] = [];
  const toc: { id: string; text: string }[] = [];
  let example = 0;
  const parts = g.body.split(/```(\w*)\n([\s\S]*?)```/);
  for (let i = 0; i < parts.length; i += 3) {
    for (const chunk of parts[i]!.split(/\n{2,}/)) {
      const text = chunk.trim();
      if (!text) continue;
      const heading = /^(#{2,3}) (.+)$/.exec(text);
      if (heading) {
        const id = slugify(heading[2]!);
        if (heading[1] === '##') toc.push({ id, text: heading[2]! });
        const level = heading[1]!.length;
        out.push(`<h${level} id="${id}">${inline(heading[2]!)}</h${level}>`);
        continue;
      }
      const lines = text.split('\n');
      if (lines.every((l) => /^[-*] /.test(l))) out.push(`<ul>${lines.map((l) => `<li>${inline(l.slice(2))}</li>`).join('')}</ul>`);
      else out.push(`<p>${inline(lines.join(' '))}</p>`);
    }
    const lang = parts[i + 1];
    const code = parts[i + 2];
    if (code === undefined) continue;
    const body = escapeHtml(code.replace(/\n$/, ''));
    if (lang === 'python') {
      example += 1;
      out.push(`<figure class="example" data-example>
  <pre class="code-sample"><code data-example-code>${body}</code></pre>
  <figcaption class="example__bar"><span class="example__label">Example ${example}</span><button class="btn btn--secondary btn--sm" type="button" data-run>Run</button></figcaption>
  <pre class="console__out example__output" data-output aria-live="polite" hidden></pre>
</figure>`);
    } else {
      out.push(`<pre class="code-sample"><code>${body}</code></pre>`);
    }
  }
  return { html: out.join('\n'), toc };
}
