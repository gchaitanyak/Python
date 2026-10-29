/** Shared start-up for every page: styles and the header account menu. */
import '../styles/main.css';
import { initAccountMenu } from '../components/account-menu';

initAccountMenu();

/** Same-site path to return to after signing in (never another origin). */
export function safeNext(fallback = '/learn/'): string {
  const next = new URLSearchParams(location.search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') ? next : fallback;
}

export const loginUrl = (next = location.pathname + location.search): string => `/login/?next=${encodeURIComponent(next)}`;
