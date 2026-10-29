/**
 * Certificate rules (SPEC §5.5). Pure, so the client imports the same code for
 * the dashboard card and the /certificate/ page.
 */

/** Uppercase letters and digits without look-alikes (0/O, 1/I/L). */
export const CREDENTIAL_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CREDENTIAL_LENGTH = 10;
const CREDENTIAL_RE = new RegExp(`^[${CREDENTIAL_ALPHABET}]{${CREDENTIAL_LENGTH}}$`);

/** A credential id from random bytes (one byte per character; rejection sampling keeps it unbiased). */
export function credentialIdFrom(nextByte: () => number): string {
  const limit = 256 - (256 % CREDENTIAL_ALPHABET.length);
  let id = '';
  while (id.length < CREDENTIAL_LENGTH) {
    const b = nextByte();
    if (b < limit) id += CREDENTIAL_ALPHABET[b % CREDENTIAL_ALPHABET.length];
  }
  return id;
}

/** Normalises what someone types into the search box: case, spaces and dashes don't matter. */
export function normaliseCredentialId(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const id = input.toUpperCase().replace(/[\s-]/g, '');
  return CREDENTIAL_RE.test(id) ? id : undefined;
}

/** The name printed on the certificate: entered twice, must match, 2–80 characters with at least one letter. */
export function certificateName(name: unknown, confirm: unknown): { ok: true; name: string } | { ok: false; error: string } {
  const clean = (s: unknown) => (typeof s === 'string' ? s.normalize('NFC').trim().replace(/\s+/g, ' ') : '');
  const a = clean(name);
  if (a.length < 2 || a.length > 80 || !/\p{L}/u.test(a)) return { ok: false, error: 'Enter your full name (2–80 characters).' };
  if (/[<>{}[\]\\/@#$%^*=|~`]/.test(a)) return { ok: false, error: 'Use letters, spaces, hyphens and apostrophes only.' };
  if (a !== clean(confirm)) return { ok: false, error: 'The two names don’t match.' };
  return { ok: true, name: a };
}

interface CertModule {
  id: string;
  title: string;
  order: number;
  requiredForCertificate?: boolean;
  lessons: { id: string; status: string }[];
}

export interface CertificateProgress {
  /** Lessons in the required modules, and how many are complete. */
  required: number;
  done: number;
  eligible: boolean;
  /** Modules to print: every required module, plus optional ones whose lessons are all written and complete. */
  modules: { id: string; title: string }[];
}

export function certificateProgress(c: { modules: CertModule[] }, completed: ReadonlySet<string>): CertificateProgress {
  const modules = [...c.modules].sort((a, b) => a.order - b.order);
  const requiredLessons = modules.filter((m) => m.requiredForCertificate).flatMap((m) => m.lessons);
  const done = requiredLessons.filter((l) => completed.has(l.id)).length;
  const finished = (m: CertModule) => m.lessons.length > 0 && m.lessons.every((l) => l.status === 'written' && completed.has(l.id));
  return {
    required: requiredLessons.length,
    done,
    eligible: requiredLessons.length > 0 && done === requiredLessons.length,
    modules: modules.filter((m) => m.requiredForCertificate || finished(m)).map((m) => ({ id: m.id, title: m.title })),
  };
}

/** "Add to profile" link for LinkedIn's certification form (`title` is the certificate's name, not the learner's). */
export function linkedInUrl(cert: { title: string; id: string; issuedAt: Date; url: string }, organisation: string): string {
  const q = new URLSearchParams({
    startTask: 'CERTIFICATION_NAME',
    name: cert.title,
    organizationName: organisation,
    issueYear: String(cert.issuedAt.getUTCFullYear()),
    issueMonth: String(cert.issuedAt.getUTCMonth() + 1),
    certUrl: cert.url,
    certId: cert.id,
  });
  return `https://www.linkedin.com/profile/add?${q}`;
}
