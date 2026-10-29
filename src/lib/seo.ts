/**
 * Canonical and social-sharing tags (SPEC §9), added to every built page from
 * its own <title> and meta description, so each page only has to state those once.
 */
const attr = (text: string) => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');

/** og:image for a page: a guide's own card if there is one, otherwise the site card. */
export function ogImageFor(path: string, guideSlugs: ReadonlySet<string>): string {
  const guide = /^\/guides\/([a-z0-9-]+)\/$/.exec(path)?.[1];
  return guide && guideSlugs.has(guide) ? `/og/guide-${guide}.png` : '/og/default.png';
}

export function addSeoTags(html: string, path: string, siteUrl: string, image: string): string {
  if (html.includes('rel="canonical"')) return html;
  const site = siteUrl.replace(/\/$/, '');
  const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'");
  const title = decode(/<title>([\s\S]*?)<\/title>/.exec(html)?.[1]?.trim() ?? 'Python Exercises');
  const description = decode(/<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? '');
  const url = `${site}${path}`;
  const tags = [
    `<link rel="canonical" href="${attr(url)}" />`,
    `<meta property="og:type" content="${path.startsWith('/guides/') && path !== '/guides/' ? 'article' : 'website'}" />`,
    `<meta property="og:site_name" content="Python Exercises" />`,
    `<meta property="og:title" content="${attr(title)}" />`,
    description ? `<meta property="og:description" content="${attr(description)}" />` : '',
    `<meta property="og:url" content="${attr(url)}" />`,
    `<meta property="og:image" content="${attr(site + image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
  ].filter(Boolean);
  return html.replace('</head>', `  ${tags.join('\n    ')}\n  </head>`);
}
