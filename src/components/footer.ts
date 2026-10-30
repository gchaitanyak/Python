import { SITE_NAME } from './header';

export const CONTACT_EMAIL = 'hello@example.com';

export const footerLinks = [
  { href: '/guides/', label: 'Guides' },
  { href: '/certificate/', label: 'Certificate' },
  { href: '/pricing/', label: 'Pricing' },
  { href: '/terms/', label: 'Terms' },
  { href: '/privacy/', label: 'Privacy' },
  { href: '/sitemap.xml', label: 'Sitemap' },
] as const;

export const socialLinks = [
  { href: 'https://github.com/', label: 'GitHub' },
  { href: 'https://www.linkedin.com/', label: 'LinkedIn' },
  { href: 'https://www.youtube.com/', label: 'YouTube' },
] as const;

/** Site footer as static HTML, rendered at build time into every page. */
export function renderFooter(year = new Date().getFullYear()): string {
  const links = footerLinks.map(({ href, label }) => `<li><a href="${href}">${label}</a></li>`).join('');
  const social = socialLinks
    .map(({ href, label }) => `<li><a href="${href}" rel="noopener" target="_blank">${label}</a></li>`)
    .join('');
  return `<footer class="site-footer">
  <div class="container site-footer__inner">
    <nav aria-label="Footer"><ul class="site-footer__links">${links}</ul></nav>
    <ul class="site-footer__social" aria-label="Social">${social}</ul>
    <p class="site-footer__meta">© ${year} ${SITE_NAME} · <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> <button type="button" class="link-button" data-cookie-settings hidden>Cookie settings</button></p>
  </div>
</footer>`;
}
