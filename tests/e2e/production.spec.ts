import { expect, test, type Page } from '@playwright/test';
import { goToQuestion, readLesson, setCode } from './helpers';

/**
 * The production build, served with Firebase Hosting's headers (vite preview reads
 * them from firebase.json): nothing on these pages may break the Content-Security-Policy.
 * Built with a test GA id, so the consent banner and analytics loader run too.
 */
const violations = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const seen: string[] = [];
  violations.set(page, seen);
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) seen.push(m.text());
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => console.error(`Refused to load: CSP ${e.violatedDirective} ${e.blockedURI}`));
  });
  // Stand-in for gtag.js so tests don't depend on Google; the CSP still decides whether it may load.
  await page.route('https://www.googletagmanager.com/**', (route) => route.fulfill({ contentType: 'text/javascript', body: 'window.__gtagLoaded = true;' }));
});

test.afterEach(async ({ page }) => {
  expect(violations.get(page)).toEqual([]);
});

test('the response carries the CSP and security headers', async ({ page }) => {
  const res = await page.goto('/');
  const h = res!.headers();
  expect(h['content-security-policy']).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
});

test('public pages render under the CSP', async ({ page }) => {
  for (const path of ['/', '/learn/', '/learn/strings/', '/pricing/', '/daily/', '/projects/', '/guides/', '/certificate/', '/privacy/', '/terms/']) {
    await page.goto(path);
    await expect(page.locator('h1').first()).toBeVisible();
  }
});

test('analytics load only after consent, and the choice is remembered', async ({ page }) => {
  await page.goto('/');
  const banner = page.getByRole('region', { name: 'Help us improve the site?' });
  await expect(banner).toBeVisible();
  expect(await page.evaluate(() => 'gtag' in window)).toBe(false);
  await banner.getByRole('button', { name: 'Accept analytics' }).click();
  await expect(banner).toBeHidden();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __gtagLoaded?: boolean }).__gtagLoaded === true)).toBe(true);

  await page.goto('/learn/');
  await expect(page.getByRole('region', { name: 'Help us improve the site?' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Cookie settings' }).click();
  await page.getByRole('button', { name: 'No thanks' }).click();
  await page.waitForLoadState('load');
  expect(await page.evaluate(() => 'gtag' in window)).toBe(false);
});

test('a lesson plays under the CSP (Pyodide in a worker, CodeMirror)', async ({ page }) => {
  await page.goto('/practice/?lesson=py-intro-first-program');
  await page.getByRole('button', { name: 'No thanks' }).click();
  await expect(page.locator('[data-python-status]')).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  const lesson = readLesson('py-intro-first-program');
  const q = lesson.questions.find((x) => x.type === 'write_code')!;
  await goToQuestion(page, lesson, q.id);
  await setCode(page, q.type === 'write_code' ? q.solution : '');
  await page.locator('[data-action="primary"]').click();
  await expect(page.locator('[data-feedback]')).toHaveClass(/feedback--pass/, { timeout: 15_000 });
});

test('guide examples and the free project run under the CSP', async ({ page }) => {
  await page.goto('/guides/strings/');
  await page.getByRole('button', { name: 'No thanks' }).click();
  const example = page.locator('[data-example]').first();
  await example.getByRole('button', { name: 'Run' }).click();
  await expect(example.locator('[data-output]')).toContainText('Hello', { timeout: 60_000 });

  await page.goto('/projects/expense-tracker/');
  await page.getByRole('button', { name: 'Start project' }).click();
  await expect(page.locator('[data-lesson-title]')).toHaveText('Expense Tracker');
});
