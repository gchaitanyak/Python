import '../../lib/page';
import '../../styles/curriculum.css';
import '../../styles/pricing.css';
import { call, currentSession, errorMessage, isPremium } from '../../lib/session';

const status = document.querySelector<HTMLElement>('[data-status]')!;

function say(kind: 'info' | 'error' | 'success', html: string): void {
  status.hidden = false;
  status.className = `alert alert--${kind}`;
  status.innerHTML = html;
}

if (new URLSearchParams(location.search).get('checkout') === 'cancelled') say('info', 'Checkout cancelled — you haven’t been charged.');

// Buttons work from the first click; the session is awaited inside the handler.
const sessionReady = currentSession().catch(() => null);

void sessionReady.then((session) => {
  const p = session?.profile;
  if (p && isPremium(p)) {
    say('success', `You already have premium${p.entitlementSource === 'lifetime' ? ' for life' : ''}. <a href="/account/">Manage it on your account page</a>.`);
  }
});

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-plan]')) {
  button.addEventListener('click', () => {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    void (async () => {
      const session = await sessionReady;
      if (!session) {
        location.assign(`/register/?next=${encodeURIComponent('/pricing/')}`);
        return;
      }
      try {
        const { url } = await call<{ url: string }>('createCheckoutSession', { plan: button.dataset.plan });
        location.assign(url);
      } catch (err) {
        say('error', errorMessage(err));
        button.disabled = false;
        button.removeAttribute('aria-busy');
      }
    })();
  });
}
