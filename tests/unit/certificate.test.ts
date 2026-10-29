import { describe, expect, it } from 'vitest';
import {
  certificateName,
  certificateProgress,
  CREDENTIAL_ALPHABET,
  credentialIdFrom,
  linkedInUrl,
  normaliseCredentialId,
} from '../../functions/src/lib/certificate';
import { jpegPdf } from '../../src/lib/certificate-pdf';
import real from '../../content/curriculum.json';

describe('credential ids', () => {
  it('are 10 characters from an alphabet without look-alikes', () => {
    expect(CREDENTIAL_ALPHABET).not.toMatch(/[01ILO]/);
    let seed = 7;
    const id = credentialIdFrom(() => (seed = (seed * 75 + 74) % 65537) % 256);
    expect(id).toMatch(new RegExp(`^[${CREDENTIAL_ALPHABET}]{10}$`));
  });

  it('skip bytes that would bias the alphabet', () => {
    const bytes = [255, 254, 248, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    expect(credentialIdFrom(() => bytes.shift()!)).toBe('ABCDEFGHJK');
  });

  it('normalise what people type in the search box', () => {
    expect(normaliseCredentialId(' abcd-efgh jk ')).toBe('ABCDEFGHJK');
    expect(normaliseCredentialId('ABCDEFGHJ0')).toBeUndefined(); // 0 isn't in the alphabet
    expect(normaliseCredentialId('SHORT')).toBeUndefined();
    expect(normaliseCredentialId(42)).toBeUndefined();
  });
});

describe('certificate names', () => {
  it('must be typed twice and match', () => {
    expect(certificateName('Ada  Lovelace ', 'Ada Lovelace')).toEqual({ ok: true, name: 'Ada Lovelace' });
    expect(certificateName('Ada Lovelace', 'Ada Lovelase').ok).toBe(false);
  });

  it('accept names in any script and reject junk', () => {
    expect(certificateName('José Núñez-O’Brien', 'José Núñez-O’Brien').ok).toBe(true);
    expect(certificateName('山田 花子', '山田 花子').ok).toBe(true);
    expect(certificateName('A', 'A').ok).toBe(false);
    expect(certificateName('12345', '12345').ok).toBe(false);
    expect(certificateName('<script>', '<script>').ok).toBe(false);
    expect(certificateName('x'.repeat(81), 'x'.repeat(81)).ok).toBe(false);
  });
});

describe('certificateProgress', () => {
  const required = real.modules.filter((m) => m.requiredForCertificate);
  const requiredIds = required.flatMap((m) => m.lessons.map((l) => l.id));

  it('requires every lesson in modules 1–12', () => {
    expect(required.map((m) => m.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const almost = certificateProgress(real, new Set(requiredIds.slice(1)));
    expect(almost).toMatchObject({ eligible: false, done: requiredIds.length - 1, required: requiredIds.length });
    const all = certificateProgress(real, new Set(requiredIds));
    expect(all.eligible).toBe(true);
    expect(all.modules).toHaveLength(12);
  });

  it('lists optional modules only when all their lessons are written and done', () => {
    const c = structuredClone(real);
    const optional = c.modules.find((m) => m.order === 14)!;
    for (const l of optional.lessons) l.status = 'written';
    const done = new Set([...requiredIds, ...optional.lessons.map((l) => l.id)]);
    expect(certificateProgress(c, done).modules.map((m) => m.id)).toContain(optional.id);
    expect(certificateProgress(c, new Set(requiredIds)).modules.map((m) => m.id)).not.toContain(optional.id);
  });
});

it('builds a LinkedIn add-certification link', () => {
  const url = new URL(linkedInUrl({ title: 'Python Certificate', id: 'ABCDEFGHJK', issuedAt: new Date('2026-10-29T12:00:00Z'), url: 'https://x.test/certificate/ABCDEFGHJK/' }, 'Python Exercises'));
  expect(url.origin + url.pathname).toBe('https://www.linkedin.com/profile/add');
  expect(Object.fromEntries(url.searchParams)).toMatchObject({
    startTask: 'CERTIFICATION_NAME',
    name: 'Python Certificate',
    organizationName: 'Python Exercises',
    issueYear: '2026',
    issueMonth: '10',
    certId: 'ABCDEFGHJK',
  });
});

describe('jpegPdf', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
  const pdf = jpegPdf(jpeg, 100, 70, 'Certificate — José');
  const text = new TextDecoder('latin1').decode(pdf);

  it('is a one-page PDF with the image embedded unchanged', () => {
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text).toContain('/Count 1');
    expect(text).toContain('/Width 100 /Height 70');
    const at = text.indexOf('stream\n') + 'stream\n'.length;
    expect([...pdf.slice(at, at + jpeg.length)]).toEqual([...jpeg]);
  });

  it('has a cross-reference table that points at every object', () => {
    const startxref = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(startxref, startxref + 4)).toBe('xref');
    const offsets = [...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(6);
    offsets.forEach((o, i) => expect(text.slice(o, o + 8)).toBe(`${i + 1} 0 obj\n`));
  });
});
