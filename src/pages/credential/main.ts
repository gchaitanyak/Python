import '../../lib/page';
import '../../styles/certificate.css';
import { linkedInUrl, normaliseCredentialId } from '../../../functions/src/lib/certificate';
import { SITE_NAME } from '../../components/header';
import { loadCertificate } from '../../lib/session';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

/** /certificate/<ID>/ — Hosting rewrites every such path to this page. */
const id = normaliseCredentialId(location.pathname.split('/').filter(Boolean)[1] ?? '');

async function show(): Promise<void> {
  const cert = id ? await loadCertificate(id) : undefined;
  $('[data-loading]').hidden = true;
  if (!cert) {
    $('[data-missing]').hidden = false;
    document.title = `Certificate not found — ${SITE_NAME}`;
    return;
  }
  const url = `${location.origin}/certificate/${cert.id}/`;
  document.title = `${cert.name} — ${SITE_NAME} certificate`;
  $('[data-name]').textContent = cert.name;
  $('[data-summary]').textContent = `has completed every lesson in ${cert.modules.length} modules of the ${SITE_NAME} course:`;
  const list = $('[data-modules]');
  for (const m of cert.modules) {
    const li = document.createElement('li');
    li.textContent = m.title;
    list.append(li);
  }
  $('[data-issued]').textContent = cert.issuedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  $('[data-id]').textContent = cert.id;
  $<HTMLAnchorElement>('[data-linkedin]').href = linkedInUrl({ title: `${SITE_NAME} Python Certificate`, id: cert.id, issuedAt: cert.issuedAt, url }, SITE_NAME);
  $('[data-found]').hidden = false;

  $('[data-pdf]').addEventListener('click', () => {
    void import('../../lib/certificate-pdf').then(({ certificatePdf }) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(certificatePdf(cert, SITE_NAME, url));
      a.download = `certificate-${cert.id}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    });
  });
  $('[data-copy]').addEventListener('click', () => {
    void navigator.clipboard.writeText(url).then(
      () => ($('[data-copied]').textContent = 'Link copied.'),
      () => ($('[data-copied]').textContent = url),
    );
  });
}

void show();
