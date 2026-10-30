import '../../lib/page';
import '../../styles/curriculum.css';
import '../../styles/certificate.css';
import { certificateProgress, normaliseCredentialId } from '../../../functions/src/lib/certificate';
import { loginUrl } from '../../lib/page';
import { accountVisitor, call, currentSession, errorMessage } from '../../lib/session';
import type { Curriculum } from '../../player/types';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
export const certificateUrl = (id: string): string => `/certificate/${id}/`;

// Verify: any visitor.
const verifyForm = $<HTMLFormElement>('[data-verify-form]');
verifyForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const id = normaliseCredentialId($<HTMLInputElement>('#verify-id').value);
  const error = $('[data-verify-error]');
  error.hidden = !!id;
  if (!id) {
    error.textContent = 'Credential IDs are 10 letters and numbers, like 7KQ2MHXP4R.';
    $('#verify-id').setAttribute('aria-invalid', 'true');
    return;
  }
  location.assign(certificateUrl(id));
});

function say(kind: 'info' | 'error' | 'success', html: string): void {
  const status = $('[data-status]');
  status.hidden = false;
  status.className = `alert alert--${kind}`;
  status.innerHTML = html;
}

async function mine(): Promise<void> {
  const mineText = $('[data-mine]');
  const session = await currentSession().catch(() => null);
  if (!session) {
    mineText.innerHTML = `<a href="${loginUrl()}">Log in</a> to see how close you are to your certificate.`;
    return;
  }
  if (session.profile?.certificateId) {
    const id = session.profile.certificateId;
    mineText.innerHTML = `You’ve earned it! Credential ID <strong>${id}</strong>. <a class="btn btn--primary" href="${certificateUrl(id)}">View your certificate</a>`;
    return;
  }
  const [curriculum, visitor] = await Promise.all([
    fetch('/data/curriculum.json').then((r) => r.json() as Promise<Curriculum>),
    accountVisitor(session),
  ]);
  const status = certificateProgress(curriculum, new Set(Object.keys(visitor.progress)));
  const bar = $('[data-progress-bar]');
  bar.setAttribute('aria-valuemax', String(status.required));
  bar.setAttribute('aria-valuenow', String(status.done));
  bar.querySelector('span')!.style.width = `${status.required ? (100 * status.done) / status.required : 0}%`;
  $('[data-progress-text]').textContent = `${status.done} of ${status.required} lessons done`;
  $('[data-progress]').hidden = false;
  if (!status.eligible) {
    mineText.innerHTML = `Finish every lesson in modules 1–12 to unlock it. <a href="/learn/">Keep learning</a>.`;
    return;
  }
  mineText.textContent = 'You’ve finished the core course — generate your certificate below.';
  const form = $<HTMLFormElement>('[data-cert-form]');
  form.hidden = false;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $<HTMLInputElement>('#cert-name').value;
    const confirmName = $<HTMLInputElement>('#cert-confirm').value;
    if (name.trim().replace(/\s+/g, ' ') !== confirmName.trim().replace(/\s+/g, ' ')) return say('error', 'The two names don’t match.');
    const button = form.querySelector('button')!;
    button.disabled = true;
    void call<{ credentialId: string }>('generateCertificate', { name, confirmName })
      .then(({ credentialId }) => location.assign(certificateUrl(credentialId)))
      .catch((err) => {
        say('error', errorMessage(err));
        button.disabled = false;
      });
  });
}

void mine();
