import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { routes } from '../../src/lib/routes';
import { DISALLOWED, sitemapPaths } from '../../scripts/generate-sitemap';

const content = resolve(import.meta.dirname, '../../content');
const pages = resolve(import.meta.dirname, '../../src/pages');

describe('sitemap (acceptance: all public routes are listed)', () => {
  const paths = sitemapPaths();

  it('lists every public route, module, written project and guide, once each', () => {
    const curriculum = JSON.parse(readFileSync(resolve(content, 'curriculum.json'), 'utf8')) as { modules: { id: string }[] };
    const guides = readdirSync(resolve(content, 'guides')).filter((f) => f.endsWith('.md'));
    for (const p of ['/', '/learn/', '/daily/', '/pricing/', '/projects/', '/guides/', '/certificate/', '/terms/', '/privacy/', '/login/', '/register/']) {
      expect(paths).toContain(p);
    }
    for (const m of curriculum.modules) expect(paths).toContain(`/learn/${m.id}/`);
    for (const g of guides) expect(paths).toContain(`/guides/${g.slice(0, -3)}/`);
    expect(paths).toContain('/projects/expense-tracker/');
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('leaves out exactly the private pages, which are noindex', () => {
    for (const r of routes.filter((x) => x.sitemap === false)) {
      expect(paths).not.toContain(r.path);
      const html = readFileSync(resolve(pages, r.dir, 'index.html'), 'utf8');
      expect(html, r.path).toContain('<meta name="robots" content="noindex" />');
    }
    for (const p of DISALLOWED) expect(paths.some((x) => x.startsWith(p))).toBe(false);
  });

  it('every public route has a title and a description', () => {
    for (const r of routes.filter((x) => x.sitemap !== false)) {
      const html = readFileSync(resolve(pages, r.dir, 'index.html'), 'utf8');
      expect(html, r.path).toMatch(/<title>[^<]+<\/title>/);
      expect(html, r.path).toMatch(/<meta name="description" content="[^"]{50,}"/);
    }
  });
});
