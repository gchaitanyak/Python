import { escapeHtml } from './html';

export const SITE_NAME = 'Python Exercises';

export const primaryNav = [
  { href: '/learn/', label: 'Learn' },
  { href: '/daily/', label: 'Daily' },
  { href: '/guides/', label: 'Guides' },
  { href: '/pricing/', label: 'Pricing' },
] as const;

/**
 * Site header as static HTML. Rendered at build time into every page, so it
 * works without JavaScript. `currentPath` marks the active nav link.
 * The account slot is swapped for the avatar menu by client code once auth exists.
 */
export function renderHeader(currentPath: string): string {
  const links = primaryNav
    .map(({ href, label }) => {
      const current = currentPath.startsWith(href) ? ' aria-current="page"' : '';
      return `<li><a class="nav-link" href="${href}"${current}>${escapeHtml(label)}</a></li>`;
    })
    .join('');
  return `<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <div class="container site-header__inner">
    <a class="logo" href="/" aria-label="${SITE_NAME} home"><span class="logo__mark" aria-hidden="true">&gt;_</span> ${SITE_NAME}</a>
    <nav class="site-nav" aria-label="Main">
      <ul class="site-nav__list">${links}</ul>
    </nav>
    <div class="site-header__account" data-account-slot>
      <a class="btn btn--ghost" href="/login/">Log in</a>
      <a class="btn btn--primary" href="/register/">Sign up</a>
    </div>
  </div>
</header>`;
}
