/**
 * One route = one HTML entry. `dir` is the folder under src/pages/ that holds
 * the route's index.html + main.ts. Add a row here when a page is built.
 */
export interface Route {
  path: string;
  dir: string;
  title: string;
  /** Leave out of sitemap.xml (e.g. query-driven app pages). */
  sitemap?: false;
}

export const routes: Route[] = [
  { path: '/', dir: 'home', title: 'Home' },
  { path: '/learn/', dir: 'learn', title: 'Learn' },
  { path: '/practice/', dir: 'practice', title: 'Practice', sitemap: false },
  { path: '/daily/', dir: 'daily', title: 'Daily challenge' },
  { path: '/pricing/', dir: 'pricing', title: 'Pricing' },
  { path: '/login/', dir: 'login', title: 'Log in' },
  { path: '/register/', dir: 'register', title: 'Create account' },
  { path: '/account/', dir: 'account', title: 'Account', sitemap: false },
  { path: '/projects/', dir: 'projects', title: 'Projects' },
  { path: '/guides/', dir: 'guides', title: 'Guides' },
  { path: '/terms/', dir: 'terms', title: 'Terms' },
  { path: '/privacy/', dir: 'privacy', title: 'Privacy' },
  { path: '/admin/', dir: 'admin', title: 'Group admin', sitemap: false },
  { path: '/join/', dir: 'join', title: 'Join a group', sitemap: false },
  { path: '/certificate/', dir: 'certificate', title: 'Certificate' },
  // Every /certificate/<id>/ is rewritten to this page (firebase.json, and the dev server).
  { path: '/certificate/view/', dir: 'credential', title: 'Certificate', sitemap: false },
];
