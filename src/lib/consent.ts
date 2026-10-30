/**
 * Consent-gated analytics (SPEC §9). Google Analytics 4 loads only after the
 * visitor accepts in the banner, and only when VITE_GA_MEASUREMENT_ID is set —
 * without an id there is nothing to consent to, so no banner is shown.
 * The choice is kept on this device (outside the pe:* keys cleared on sign-out).
 */
const KEY = 'consent:analytics';
export type Choice = 'granted' | 'denied';

export const measurementId = (): string => import.meta.env.VITE_GA_MEASUREMENT_ID ?? '';

export function storedChoice(): Choice | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'granted' || v === 'denied' ? v : null;
  } catch {
    return null;
  }
}

function store(choice: Choice): void {
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    /* storage unavailable: ask again next time */
  }
}

type Gtag = (...args: unknown[]) => void;
let loaded = false;

function loadAnalytics(id: string): void {
  if (loaded) return;
  loaded = true;
  const w = window as unknown as { dataLayer: unknown[]; gtag: Gtag };
  w.dataLayer = w.dataLayer ?? [];
  w.gtag = function gtag() {
    // gtag.js reads the `arguments` object itself, so it must be pushed as is.
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer.push(arguments);
  };
  w.gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  w.gtag('js', new Date());
  w.gtag('config', id);
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.append(script);
}

function banner(id: string, onDone: () => void): HTMLElement {
  const el = document.createElement('section');
  el.className = 'consent';
  el.setAttribute('aria-labelledby', 'consent-title');
  el.innerHTML = `<div class="container consent__inner">
  <div>
    <h2 id="consent-title" class="consent__title">Help us improve the site?</h2>
    <p class="consent__text">With your OK we use Google Analytics cookies to see which pages and lessons are used. Your code and answers aren’t included. <a href="/privacy/">Privacy</a></p>
  </div>
  <div class="consent__actions">
    <button type="button" class="btn btn--primary" data-consent="granted">Accept analytics</button>
    <button type="button" class="btn btn--ghost" data-consent="denied">No thanks</button>
  </div>
</div>`;
  el.addEventListener('click', (e) => {
    const choice = (e.target as HTMLElement).closest<HTMLElement>('[data-consent]')?.dataset.consent as Choice | undefined;
    if (!choice) return;
    const wasGranted = storedChoice() === 'granted';
    store(choice);
    el.remove();
    if (choice === 'granted') loadAnalytics(id);
    else if (wasGranted) location.reload(); // unload analytics that already started on this page
    onDone();
  });
  return el;
}

/** Called on every page: applies a stored choice, or asks. "Cookie settings" in the footer asks again. */
export function initConsent(): void {
  const id = measurementId();
  const settings = document.querySelector<HTMLButtonElement>('[data-cookie-settings]');
  if (!id) return;
  if (settings) settings.hidden = false;
  const ask = () => {
    if (document.querySelector('.consent')) return;
    const el = banner(id, () => settings?.focus());
    document.body.append(el);
    el.querySelector<HTMLButtonElement>('[data-consent="granted"]')!.focus({ preventScroll: true });
  };
  settings?.addEventListener('click', ask);
  const choice = storedChoice();
  if (choice === 'granted') loadAnalytics(id);
  else if (choice === null) {
    const el = banner(id, () => {});
    document.body.append(el);
  }
}
