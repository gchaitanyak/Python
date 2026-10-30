import { describe, expect, it } from 'vitest';
import { addSeoTags, ogImageFor } from '../../src/lib/seo';

const page = '<html><head><title>Lists &amp; more — Python Exercises</title><meta name="description" content="Learn &quot;lists&quot;." /></head><body></body></html>';

describe('seo tags', () => {
  it('adds canonical and Open Graph tags from the page’s own title and description', () => {
    const html = addSeoTags(page, '/guides/lists/', 'https://py.example/', '/og/guide-lists.png');
    expect(html).toContain('<link rel="canonical" href="https://py.example/guides/lists/" />');
    expect(html).toContain('<meta property="og:title" content="Lists &amp; more — Python Exercises" />');
    expect(html).toContain('<meta property="og:description" content="Learn &quot;lists&quot;." />');
    expect(html).toContain('<meta property="og:type" content="article" />');
    expect(html).toContain('<meta property="og:image" content="https://py.example/og/guide-lists.png" />');
    expect(addSeoTags(html, '/x/', 'https://py.example', '/og/default.png')).toBe(html); // only once
  });

  it('picks a guide’s own image, or the site image', () => {
    const guides = new Set(['lists']);
    expect(ogImageFor('/guides/lists/', guides)).toBe('/og/guide-lists.png');
    expect(ogImageFor('/guides/', guides)).toBe('/og/default.png');
    expect(ogImageFor('/learn/', guides)).toBe('/og/default.png');
  });
});
