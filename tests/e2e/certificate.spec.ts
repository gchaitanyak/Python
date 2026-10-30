import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { adminSet, newLearner, openLesson, playLesson, readCurriculum, readLesson, register, uidFor } from './helpers';

test.describe.configure({ timeout: 180_000 });
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'desktop', 'certificate flow runs once, on desktop');
});

const required = readCurriculum().modules.filter((m) => m.requiredForCertificate).flatMap((m) => m.lessons.map((l) => l.id));
const FIRESTORE = 'http://127.0.0.1:8080/v1/projects/demo-python-exercises/databases/(default)/documents';
const LAST = 'py-dates-times'; // free, first lesson of module 12 — finished in the real player below

test('SPEC acceptance 6: finishing modules 1–12 enables the certificate; its public page is reachable by id and searchable', async ({ page, browser }) => {
  const who = newLearner();
  await register(page, who);
  const uid = await uidFor(page.request, who.username);
  for (const id of required.filter((id) => id !== LAST)) {
    await adminSet(page.request, `users/${uid}/progress/${id}`, { completed: true, bestAccuracy: 90 });
  }

  await page.goto('/certificate/');
  await expect(page.locator('[data-progress-text]')).toHaveText(`${required.length - 1} of ${required.length} lessons done`);
  await expect(page.locator('[data-cert-form]')).toBeHidden();

  await openLesson(page, LAST);
  await playLesson(page, readLesson(LAST));
  // completeLesson runs as the summary appears; wait for it to land before leaving the page.
  await expect
    .poll(async () => {
      const res = await page.request.get(`${FIRESTORE}/users/${uid}/progress/${LAST}`, { headers: { Authorization: 'Bearer owner' } });
      return res.ok() ? JSON.stringify(await res.json()) : '';
    }, { timeout: 15_000 })
    .toContain('"completed":{"booleanValue":true}');
  await page.goto('/learn/');
  await expect(page.locator('[data-cert-status]')).toHaveText('Your certificate is ready');

  await page.goto('/certificate/');
  await page.getByLabel('Full name', { exact: true }).fill('Robin Ada Example');
  await page.getByLabel('Full name again').fill('Robin Ada Exampel');
  await page.getByRole('button', { name: 'Generate my certificate' }).click();
  await expect(page.locator('[data-status]')).toContainText('don’t match');
  await page.getByLabel('Full name again').fill('Robin Ada Example');
  await page.getByRole('button', { name: 'Generate my certificate' }).click();
  await page.waitForURL(/\/certificate\/[A-Z2-9]{10}\/$/);
  const id = new URL(page.url()).pathname.split('/')[2]!;
  await expect(page.locator('[data-name]')).toHaveText('Robin Ada Example');
  await expect(page.locator('[data-id]')).toHaveText(id);
  await expect(page.locator('[data-modules] li')).toHaveCount(12);
  await expect(page.locator('[data-linkedin]')).toHaveAttribute('href', new RegExp(`linkedin\\.com/profile/add\\?.*certId=${id}`));

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download PDF' }).click()]);
  expect(download.suggestedFilename()).toBe(`certificate-${id}.pdf`);
  const pdf = readFileSync((await download.path())!);
  if (process.env.SAVE_CERT_PDF) await download.saveAs(process.env.SAVE_CERT_PDF);
  expect(pdf.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
  expect(pdf.length).toBeGreaterThan(20_000); // the drawn page, not an empty shell

  // Anyone (signed out) can search for it and open it.
  const stranger = await browser.newPage();
  await stranger.goto('/certificate/');
  await stranger.getByLabel('Credential ID').fill(id.toLowerCase());
  await stranger.getByRole('button', { name: 'Look it up' }).click();
  await stranger.waitForURL(`**/certificate/${id}/`);
  await expect(stranger.locator('[data-name]')).toHaveText('Robin Ada Example');
  await stranger.goto('/certificate/ABCDEFGHJK/');
  await expect(stranger.getByRole('heading', { name: 'Certificate not found' })).toBeVisible();
  await stranger.close();
});
