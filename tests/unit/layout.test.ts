import { describe, expect, it } from 'vitest';
import { footerLinks, renderFooter } from '../../src/components/footer';
import { primaryNav, renderHeader } from '../../src/components/header';
import { routes } from '../../src/lib/routes';

describe('header', () => {
  it('links every primary nav item and the account actions', () => {
    const html = renderHeader('/');
    for (const { href } of primaryNav) expect(html).toContain(`href="${href}"`);
    expect(html).toContain('href="/login/"');
    expect(html).toContain('href="/register/"');
    expect(html).toContain('href="#main"');
  });

  it('marks only the current section as active', () => {
    const html = renderHeader('/learn/');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain('href="/learn/" aria-current="page"');
    expect(renderHeader('/')).not.toContain('aria-current');
  });
});

describe('footer', () => {
  it('links every footer item and shows the year', () => {
    const html = renderFooter(2030);
    for (const { href } of footerLinks) expect(html).toContain(`href="${href}"`);
    expect(html).toContain('© 2030');
  });
});

describe('routes', () => {
  it('serves / and /learn/ with unique paths and folders', () => {
    expect(routes.map((r) => r.path)).toEqual(expect.arrayContaining(['/', '/learn/']));
    expect(new Set(routes.map((r) => r.path)).size).toBe(routes.length);
    expect(new Set(routes.map((r) => r.dir)).size).toBe(routes.length);
    for (const r of routes) expect(r.path).toMatch(/^\/([a-z0-9-]+\/)*$/);
  });
});
