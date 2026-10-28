import { escapeHtml } from '../components/html';

/**
 * Minimal, safe Markdown for lesson text: paragraphs, fenced code blocks,
 * `code`, **bold**, *italic*, [links](https://…) and "- " lists.
 * Input is HTML-escaped first, so lesson text can never inject markup.
 */
export function renderMarkdown(source: string): string {
  const blocks: string[] = [];
  const parts = source.replace(/\r\n?/g, '\n').split(/```[a-z]*\n?/);
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      blocks.push(`<pre class="code-sample"><code>${escapeHtml(part.replace(/\n$/, ''))}</code></pre>`);
      return;
    }
    for (const chunk of part.split(/\n{2,}/)) {
      const text = chunk.trim();
      if (!text) continue;
      const lines = text.split('\n');
      if (lines.every((l) => /^\s*[-*] /.test(l))) {
        blocks.push(`<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*] /, ''))}</li>`).join('')}</ul>`);
      } else {
        blocks.push(`<p>${lines.map(inline).join('<br>')}</p>`);
      }
    }
  });
  return blocks.join('');
}

/** Inline Markdown on one line of text. Code spans are protected from other rules. */
export function inline(text: string): string {
  const codes: string[] = [];
  let html = escapeHtml(text).replace(/`([^`]+)`/g, (_m, code: string) => {
    codes.push(`<code>${code}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  html = html
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener" target="_blank">$1</a>');
  return html.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => codes[Number(i)] ?? '');
}
