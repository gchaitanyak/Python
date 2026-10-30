import { safeNext } from '../../lib/page';
import '../../styles/forms.css';
import { completeEmailLink, currentSession, errorMessage, pendingEmailLink, sendPasswordReset, sendSignInLink, signInWithPassword } from '../../lib/session';

const next = safeNext();
const status = document.querySelector<HTMLElement>('[data-status]')!;
const loginForm = document.querySelector<HTMLFormElement>('[data-login-form]')!;
const confirmForm = document.querySelector<HTMLFormElement>('[data-confirm-form]')!;
const emailInput = loginForm.querySelector<HTMLInputElement>('#login-email')!;
const passwordInput = loginForm.querySelector<HTMLInputElement>('#login-password')!;
document.querySelector<HTMLAnchorElement>('[data-register-link]')!.href = `/register/?next=${encodeURIComponent(next)}`;

function show(kind: 'error' | 'info' | 'success', text: string): void {
  status.hidden = false;
  status.className = `alert alert--${kind}`;
  status.textContent = text;
}

async function busy(form: HTMLFormElement, fn: () => Promise<void>): Promise<void> {
  const buttons = [...form.querySelectorAll('button')];
  buttons.forEach((b) => (b.disabled = true));
  try {
    await fn();
  } catch (err) {
    show('error', errorMessage(err));
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}

const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

function requireEmail(): string | null {
  const email = emailInput.value.trim();
  if (validEmail(email)) return email;
  show('error', 'Enter your email address first.');
  emailInput.focus();
  return null;
}

loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const email = requireEmail();
  if (!email) return;
  if (!passwordInput.value) {
    void busy(loginForm, async () => {
      await sendSignInLink(email, next);
      show('success', `We’ve sent a sign-in link to ${email}. Open it on this device to log in.`);
    });
    return;
  }
  void busy(loginForm, async () => {
    await signInWithPassword(email, passwordInput.value);
    location.assign(next);
  });
});

document.querySelector('[data-send-link]')!.addEventListener('click', () => {
  const email = requireEmail();
  if (!email) return;
  void busy(loginForm, async () => {
    await sendSignInLink(email, next);
    show('success', `We’ve sent a sign-in link to ${email}. Open it on this device to log in.`);
  });
});

document.querySelector('[data-reset]')!.addEventListener('click', () => {
  const email = requireEmail();
  if (!email) return;
  void busy(loginForm, async () => {
    try {
      await sendPasswordReset(email);
    } catch (err) {
      // Don't reveal whether an account exists.
      if ((err as { code?: string }).code !== 'auth/user-not-found') throw err;
    }
    show('success', `If an account exists for ${email}, we’ve sent a link to reset the password.`);
  });
});

confirmForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const email = confirmForm.querySelector<HTMLInputElement>('#confirm-email')!.value.trim();
  if (!validEmail(email)) return show('error', 'Enter a valid email address.');
  void busy(confirmForm, async () => {
    await completeEmailLink(email);
    location.assign(next);
  });
});

void (async () => {
  const pending = await pendingEmailLink();
  if (pending === null) {
    const session = await currentSession();
    if (session) show('info', `You’re already logged in as ${session.user.email}. Go to your dashboard or log out from the account menu.`);
    return;
  }
  if (pending) {
    show('info', 'Signing you in…');
    loginForm.hidden = true;
    try {
      await completeEmailLink(pending);
      location.assign(next);
    } catch (err) {
      show('error', errorMessage(err));
      loginForm.hidden = false;
    }
    return;
  }
  // Link opened on another device or browser: ask which email it was sent to.
  loginForm.hidden = true;
  confirmForm.hidden = false;
  confirmForm.querySelector<HTMLInputElement>('input')!.focus();
})();
