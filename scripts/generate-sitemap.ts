/** Writes dist/sitemap.xml and dist/robots.txt from the route table, module, project and guide pages. Run after `vite build`. */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnv } from 'vite';
import { moduleUrl, sortedModules } from '../src/lib/curriculum';
import { guideUrl } from '../src/lib/guides';
import { projectUrl } from '../src/lib/projects';
import { routes } from '../src/lib/routes';
import { loadCurriculumFile, loadGuides, writtenProjects } from './content-data';

/** Private and per-user pages: kept out of search results (they're also marked noindex). */
export const DISALLOWED = ['/account/', '/admin/', '/join/', '/practice/', '/certificate/view/'];

/** Every public page, in a stable order. */
export function sitemapPaths(): string[] {
  return [
    ...routes.filter((r) => r.sitemap !== false).map((r) => r.path),
    ...sortedModules(loadCurriculumFile()).map((m) => moduleUrl(m.id)),
    ...writtenProjects().map((p) => projectUrl(p.id)),
    ...loadGuides().map((g) => guideUrl(g.slug)),
  ];
}

if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
  const root = resolve(import.meta.dirname, '..');
  const site = (loadEnv('production', root, '').SITE_URL || 'https://example.com').replace(/\/$/, '');
  const dist = resolve(root, 'dist');
  const listed = sitemapPaths();
  const urls = listed.map((path) => `  <url><loc>${site}${path}</loc></url>`).join('\n');
  writeFileSync(resolve(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
  const disallow = DISALLOWED.map((p) => `Disallow: ${p}`).join('\n');
  writeFileSync(resolve(dist, 'robots.txt'), `User-agent: *\nAllow: /\n${disallow}\n\nSitemap: ${site}/sitemap.xml\n`);
  console.log(`sitemap: ${listed.length} routes → dist/sitemap.xml`);
}
