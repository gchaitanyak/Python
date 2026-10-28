/** Writes dist/sitemap.xml and dist/robots.txt from the route table and module pages. Run after `vite build`. */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { moduleUrl, sortedModules } from '../src/lib/curriculum';
import { routes } from '../src/lib/routes';
import { loadCurriculumFile } from './content-data';

const site = (process.env.SITE_URL ?? 'https://example.com').replace(/\/$/, '');
const dist = resolve(import.meta.dirname, '../dist');

const listed = [
  ...routes.filter((r) => r.sitemap !== false).map((r) => r.path),
  ...sortedModules(loadCurriculumFile()).map((m) => moduleUrl(m.id)),
];
const urls = listed.map((path) => `  <url><loc>${site}${path}</loc></url>`).join('\n');
writeFileSync(
  resolve(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
);
writeFileSync(resolve(dist, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n`);
console.log(`sitemap: ${listed.length} routes → dist/sitemap.xml`);
