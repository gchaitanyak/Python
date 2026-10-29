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
  watchProfile,
  type Profile,
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

const longDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

/** Plan, renewal and billing controls (SPEC §7). Called again whenever the profile changes. */
function fillPlan(p: Profile | undefined): void {
  const premium = isPremium(p);
  $('[data-plan]').textContent = premium ? 'Premium' : 'Free';
  let detail = 'Free plan. Upgrade for every lesson, flashcards, projects and the certificate.';
  if (premium && p?.entitlementSource === 'lifetime') detail = 'Lifetime premium — no renewals, no end date.';
  else if (premium && p?.cancelAtPeriodEnd && p.premiumUntilMs) detail = `Premium until ${longDate(p.premiumUntilMs)}. Your subscription won’t renew.`;
  else if (premium) detail = `Premium${p?.plan ? ` (${p.plan})` : ''}. Renews automatically.`;
  else if (p?.subscriptionStatus === 'canceled') detail = 'Free plan. Your premium subscription has ended.';
  $('[data-plan-detail]').textContent = detail;
  $('[data-payment-issue]').hidden = !p?.paymentIssue;
  $('[data-manage]').hidden = !p?.hasStripeCustomer;
  $('[data-upgrade]').hidden = premium;
}

function fill(session: Session): void {
  const p = session.profile;
  $('[data-email]').textContent = session.user.email ?? '';
  fillPlan(p);
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

  // Keep the plan current: a payment or portal change arrives by webhook a moment later.
  const checkout = new URLSearchParams(location.search).get('checkout') === 'success';
  if (checkout && !isPremium(session.profile)) show('info', 'Payment received — activating premium…');
  void watchProfile(session.user.uid, (profile) => {
    fillPlan(profile);
    $('[data-points]').textContent = String(profile?.totalPoints ?? 0);
    if (checkout && isPremium(profile)) show('success', 'You’re premium now! Every lesson is unlocked.');
  });

  $('[data-manage]').addEventListener('click', (e) => {
    const button = e.currentTarget as HTMLButtonElement;
    button.disabled = true;
    call<{ url: string }>('createPortalSession')
      .then(({ url }) => location.assign(url))
      .catch((err) => {
        show('error', errorMessage(err));
        button.disabled = false;
      });
  });

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
