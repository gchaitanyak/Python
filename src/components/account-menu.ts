import { escapeHtml } from './html';
import { signOut, watchSession, type Session } from '../lib/session';

/**
 * Swaps the header's "Log in / Sign up" for an account menu once the visitor
 * is signed in. A disclosure button + list: Esc or clicking outside closes it.
 */
export function initAccountMenu(): void {
  const slot = document.querySelector<HTMLElement>('[data-account-slot]');
  if (!slot) return;
  const signedOutHtml = slot.innerHTML;
  void watchSession((session) => {
    if (session) render(slot, session);
    else slot.innerHTML = signedOutHtml;
  });
}

function render(slot: HTMLElement, session: Session): void {
  const name = session.profile?.username || session.profile?.firstName || session.user.email?.split('@')[0] || 'Account';
  slot.innerHTML = `<div class="account-menu">
  <button type="button" class="btn btn--ghost account-menu__button" aria-expanded="false" aria-controls="account-menu-list">
    <span class="avatar" aria-hidden="true">${escapeHtml(name.charAt(0).toUpperCase())}</span>
    <span class="account-menu__name" data-account-name>${escapeHtml(name)}</span>
  </button>
  <ul class="account-menu__list" id="account-menu-list" hidden>
    <li><a href="/learn/">Dashboard</a></li>
    <li><a href="/account/">Account</a></li>${
      Object.values(session.profile?.groups ?? {}).some((g) => g.role === 'admin') ? '\n    <li><a href="/admin/">Admin</a></li>' : ''
    }
    <li><button type="button" data-signout>Log out</button></li>
  </ul>
</div>`;
  const button = slot.querySelector<HTMLButtonElement>('.account-menu__button')!;
  const list = slot.querySelector<HTMLElement>('.account-menu__list')!;
  const setOpen = (open: boolean) => {
    button.setAttribute('aria-expanded', String(open));
    list.hidden = !open;
  };
  button.addEventListener('click', () => setOpen(button.getAttribute('aria-expanded') !== 'true'));
  slot.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !list.hidden) {
      setOpen(false);
      button.focus();
    }
  });
  document.addEventListener('click', (e) => {
    if (!slot.contains(e.target as Node)) setOpen(false);
  });
  slot.querySelector('[data-signout]')!.addEventListener('click', () => {
    void signOut().then(() => location.assign('/'));
  });
}
