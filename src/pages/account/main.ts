import { loginUrl } from '../../lib/page';
import '../../styles/forms.css';
import {
  call,
  currentSession,
  deleteAccount,
  errorMessage,
  isPremium,
  resendVerification,
  signOut,
  updateFirstName,
  type Session,
} from '../../lib/session';

const status = document.querySelector<HTMLElement>('[data-status]')!;
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

function show(kind: 'error' | 'info' | 'success', text: string): void {
  status.hidden = false;
  status.className = `alert alert--${kind}`;
  status.textContent = text;
}

async function run(form: HTMLFormElement, fn: () => Promise<void>): Promise<void> {
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  button.disabled = true;
  try {
    await fn();
  } catch (err) {
    show('error', errorMessage(err));
  } finally {
    button.disabled = false;
  }
}

function fill(session: Session): void {
  const p = session.profile;
  $('[data-email]').textContent = session.user.email ?? '';
  $('[data-plan]').textContent = isPremium(p) ? 'Premium' : 'Free';
  $('[data-points]').textContent = String(p?.totalPoints ?? 0);
  $('[data-verify]').hidden = session.user.emailVerified;
  $<HTMLInputElement>('#acc-first').value = p?.firstName ?? '';
  $<HTMLInputElement>('#acc-username').value = p?.username ?? '';
}

void (async () => {
  const session = await currentSession();
  if (!session) return location.replace(loginUrl('/account/'));
  fill(session);
  $('[data-loading]').hidden = true;
  $('[data-account]').hidden = false;
  if (new URLSearchParams(location.search).get('username') === 'taken' || !session.profile?.username) {
    show('info', 'Choose a username to appear on the leaderboards.');
    $<HTMLInputElement>('#acc-username').focus();
  }

  const nameForm = $<HTMLFormElement>('[data-name-form]');
  nameForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = $<HTMLInputElement>('#acc-first').value.trim();
    if (!value) return show('error', 'Enter your first name.');
    void run(nameForm, async () => {
      await updateFirstName(value);
      show('success', 'Name saved.');
    });
  });

  const usernameForm = $<HTMLFormElement>('[data-username-form]');
  usernameForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = $<HTMLInputElement>('#acc-username').value.trim();
    void run(usernameForm, async () => {
      const result = await call<{ username: string }>('claimUsername', { username: value });
      $<HTMLInputElement>('#acc-username').value = result.username;
      const menuName = document.querySelector('[data-account-name]');
      if (menuName) menuName.textContent = result.username;
      show('success', `Your username is now ${result.username}.`);
    });
  });

  $('[data-resend]').addEventListener('click', () => {
    void resendVerification()
      .then(() => show('success', 'Verification email sent. Check your inbox.'))
      .catch((err) => show('error', errorMessage(err)));
  });

  $('[data-signout]').addEventListener('click', () => {
    void signOut().then(() => location.assign('/'));
  });

  const deleteForm = $<HTMLFormElement>('[data-delete-form]');
  deleteForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if ($<HTMLInputElement>('#acc-delete').value.trim() !== 'DELETE') return show('error', 'Type DELETE (in capitals) to confirm.');
    void run(deleteForm, async () => {
      await deleteAccount();
      location.assign('/?deleted=1');
    });
  });
})();
