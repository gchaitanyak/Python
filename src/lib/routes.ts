/**
 * One route = one HTML entry. `dir` is the folder under src/pages/ that holds
 * the route's index.html + main.ts. Add a row here when a page is built.
 */
export interface Route {
  path: string;
  dir: string;
  title: string;
}

export const routes: Route[] = [
  { path: '/', dir: 'home', title: 'Home' },
  { path: '/learn/', dir: 'learn', title: 'Learn' },
];
