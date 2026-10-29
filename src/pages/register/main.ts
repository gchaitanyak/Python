import { safeNext } from '../../lib/page';
import '../../styles/forms.css';
import { errorMessage, register, usernameAvailable } from '../../lib/session';

const next = safeNext();
const form = document.querySelector<HTMLFormElement>('[data-register-form]')!;
const status = document.querySelector<HTMLElement>('[data-status]')!;
document.querySelector<HTMLAnchorElement>('[data-login-link]')!.href = `/login/?next=${encodeURIComponent(next)}`;

const field = (name: string) => form.querySelector<HTMLInputElement>(`[name="${name}"]`)!;

function setError(name: string, message: string): void {
  const input = field(name);
  const error = form.querySelector<HTMLElement>(`#${input.id}-error`)!;
  error.textContent = message;
  error.hidden = !message;
  input.setAttribute('aria-invalid', String(!!message));
}

function validate(): boolean {
  const checks: [string, string][] = [
    ['firstName', field('firstName').value.trim() ? '' : 'Enter your first name.'],
    ['username', /^[a-zA-Z0-9_]{3,20}$/.test(field('username').value.trim()) ? '' : 'Use 3–20 letters, numbers or _.'],
    ['email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field('email').value.trim()) ? '' : 'Enter a valid email address.'],
    ['password', field('password').value.length >= 8 ? '' : 'Use at least 8 characters.'],
  ];
  for (const [name, message] of checks) setError(name, message);
  const firstBad = checks.find(([, m]) => m);
  if (firstBad) field(firstBad[0]).focus();
  return !firstBad;
}

let checkTimer: ReturnType<typeof setTimeout> | undefined;
field('username').addEventListener('input', () => {
  clearTimeout(checkTimer);
  const value = field('username').value.trim();
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(value)) return setError('username', '');
  checkTimer = setTimeout(() => {
    void usernameAvailable(value)
      .then((free) => setError('username', free ? '' : 'That username is taken. Try another.'))
      .catch(() => {});
  }, 400);
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!validate()) return;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  button.disabled = true;
  void (async () => {
    try {
      if (!(await usernameAvailable(field('username').value.trim()))) {
        setError('username', 'That username is taken. Try another.');
        field('username').focus();
        return;
      }
      await register({
        firstName: field('firstName').value.trim(),
        username: field('username').value.trim(),
        email: field('email').value.trim(),
        password: field('password').value,
      });
      location.assign(next);
    } catch (err) {
      // The account exists but the username was taken in the meantime: pick another on the account page.
      if ((err as { code?: string }).code === 'functions/already-exists') return location.assign('/account/?username=taken');
      status.hidden = false;
      status.className = 'alert alert--error';
      status.textContent = errorMessage(err);
    } finally {
      button.disabled = false;
    }
  })();
});
