import { expect, test, type Page } from '@playwright/test';
import { feedback, goToQuestion, newLearner, openLesson, playLesson, primary, readLesson, register, unique } from './helpers';

const PROJECT = 'demo-python-exercises';

test.describe.configure({ timeout: 180_000 });
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'desktop', 'account flows run once, on desktop');
});

async function logIn(page: Page, email: string, password: string, next = '/learn/') {
  await page.goto(`/login/?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.waitForURL((url) => url.pathname === new URL(next, 'http://x').pathname);
}

async function logOut(page: Page) {
  await page.locator('.account-menu__button').click();
  await page.getByRole('button', { name: 'Log out' }).click();
  await page.waitForURL('/');
  await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();
}

/** The most recent email action link the Auth emulator "sent" to this address. */
async function emailLink(page: Page, email: string, type: 'EMAIL_SIGNIN' | 'PASSWORD_RESET' | 'VERIFY_EMAIL'): Promise<string> {
  let link = '';
  await expect
    .poll(async () => {
      const res = await page.request.get(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/oobCodes`);
      const codes = ((await res.json()) as { oobCodes: { email: string; requestType: string; oobLink: string }[] }).oobCodes;
      link = codes.filter((c) => c.email === email && c.requestType === type).at(-1)?.oobLink ?? '';
      return link;
    })
    .not.toBe('');
  return link;
}

test('SPEC acceptance 1: an anonymous visitor completes lesson 1 from the landing page and sees points', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Start learning free' }).first().click();
  await expect(page.locator('[data-python-status]')).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  const points = await playLesson(page, readLesson('py-intro-first-program'));
  const summary = page.locator('[data-summary]');
  await expect(summary.locator('[data-summary-points]')).toHaveText(String(points));
  await expect(summary).toContainText(`Total points on this device: ${points}`);
  await expect(summary.getByRole('link', { name: 'Create a free account' })).toBeVisible();
});

test('SPEC acceptance 2: register, see anonymous progress merged, then appear on today’s leaderboard', async ({ page }) => {
  // Anonymous progress first.
  await openLesson(page, 'py-intro-first-program');
  await playLesson(page, readLesson('py-intro-first-program'));

  const who = newLearner();
  await register(page, who, '/learn/');

  // Merged: lesson 1 is done on the account, so lesson 2 is next and unlocked.
  await expect(page.locator('[data-lesson-id="py-intro-first-program"]')).toHaveAttribute('data-status', 'strong');
  await expect(page.locator('[data-next-title]')).toHaveText('Printing and Comments');
  await expect(page.locator('[data-board="points"] [data-board-me]')).toHaveText('Finish a lesson today to appear here.');

  // Complete a lesson while signed in: points and streak come from the server.
  await openLesson(page, 'py-print-and-comments');
  const points = await playLesson(page, readLesson('py-print-and-comments'));
  await expect(page.locator('[data-summary-note]')).toContainText('Saved to your account.');
  await expect(page.locator('[data-summary-streak]')).toHaveText('1 day');

  await page.goto('/learn/');
  const me = page.locator('[data-board="points"] .leaderboard__row--me');
  await expect(me).toContainText(`${who.username} (you)`);
  await expect(me).toContainText(`${points} pts`);
  await expect(page.locator('[data-board="points"] [data-board-me]')).toContainText(`with ${points} pts today`);
  await expect(page.locator('[data-board="streak"] .leaderboard__row--me')).toContainText('1 day');
  await expect(page.locator('[data-points]')).toHaveText(String(points));
  await expect(page.locator('[data-streak]')).toHaveText('1 day');
  // Usernames only — never emails — on the public board.
  await expect(page.locator('[data-board-list]').first()).not.toContainText('@');
});

test('log in with a password, see the account menu, log out and clear local caches', async ({ page }) => {
  const who = newLearner();
  await register(page, who);
  await logOut(page);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('pe:')))).toEqual([]);

  await page.goto('/login/');
  await page.getByLabel('Email', { exact: true }).fill(who.email);
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.locator('[data-status]')).toContainText('don’t match');

  await logIn(page, who.email, who.password, '/learn/getting-started/');
  await page.locator('.account-menu__button').click();
  await expect(page.getByRole('link', { name: 'Account' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.account-menu__list')).toBeHidden();
});

test('passwordless sign-in by email link, then choose a username', async ({ page }) => {
  const email = `link.${unique()}@example.com`;
  await page.goto('/login/?next=/learn/');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await expect(page.locator('[data-status]')).toContainText(`sent a sign-in link to ${email}`);

  await page.goto(await emailLink(page, email, 'EMAIL_SIGNIN'));
  // The emulator link lands on /login/ via the continue URL and signs in, then goes to `next`.
  await page.waitForURL('**/learn/');
  await expect(page.locator('.account-menu__button')).toBeVisible();

  await page.goto('/account/');
  await expect(page.locator('[data-status]')).toContainText('Choose a username');
  const username = `link_${unique()}`.slice(0, 20);
  await page.getByLabel('Username').fill(username);
  await page.getByRole('button', { name: 'Save username' }).click();
  await expect(page.locator('[data-status]')).toContainText(`Your username is now ${username}`);
});

test('forgot password sends a reset link without revealing whether the account exists', async ({ page }) => {
  const who = newLearner();
  await register(page, who);
  await logOut(page);
  await page.goto('/login/');
  await page.getByLabel('Email', { exact: true }).fill(who.email);
  await page.getByRole('button', { name: 'Forgot your password?' }).click();
  await expect(page.locator('[data-status]')).toContainText(`If an account exists for ${who.email}`);
  expect(await emailLink(page, who.email, 'PASSWORD_RESET')).toContain('mode=resetPassword');

  const nobody = `nobody.${unique()}@example.com`;
  await page.getByLabel('Email', { exact: true }).fill(nobody);
  await page.getByRole('button', { name: 'Forgot your password?' }).click();
  await expect(page.locator('[data-status]')).toContainText(`If an account exists for ${nobody}`);
});

test('account page: rename, taken usernames are refused, and the account can be deleted', async ({ page, browser }) => {
  const other = newLearner();
  const ctx = await browser.newContext();
  await register(await ctx.newPage(), other);
  await ctx.close();

  const who = newLearner();
  await register(page, who, '/account/');
  await expect(page.locator('[data-email]')).toHaveText(who.email);
  await expect(page.locator('[data-plan]')).toHaveText('Free');

  await page.getByLabel('First name').fill('Robyn');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.locator('[data-status]')).toHaveText('Name saved.');

  await page.getByLabel('Username').fill(other.username.toUpperCase());
  await page.getByRole('button', { name: 'Save username' }).click();
  await expect(page.locator('[data-status]')).toContainText('taken');

  await page.getByLabel('Type DELETE to confirm').fill('DELETE');
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await page.waitForURL('/?deleted=1');
  await page.goto('/login/');
  await page.getByLabel('Email', { exact: true }).fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.locator('[data-status]')).toContainText('don’t match');
});

test('locks: anonymous visitors are asked to sign in, free accounts to upgrade', async ({ page }) => {
  await page.goto('/practice/?lesson=py-comparison-logical');
  await expect(page.getByRole('heading', { name: 'Sign in required' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Log in' }).last()).toHaveAttribute('href', /next=%2Fpractice%2F%3Flesson%3Dpy-comparison-logical/);
  await register(page, newLearner());
  await page.goto('/practice/?lesson=py-comparison-logical');
  await expect(page.getByRole('heading', { name: 'Upgrade to continue' })).toBeVisible();
});

test('the server awards each question once a day and the player shows its result', async ({ page }) => {
  await register(page, newLearner());
  const lesson = readLesson('py-intro-first-program');
  await openLesson(page, lesson.id);
  await goToQuestion(page, lesson, 'q05');
  await page.locator('input[type="radio"][value="b"]').check();
  await primary(page).click();
  await expect(feedback(page)).toContainText('Correct! +10 pts');

  await page.reload();
  await expect(page.locator('[data-python-status]')).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  await goToQuestion(page, lesson, 'q05');
  await page.locator('input[type="radio"][value="b"]').check();
  await primary(page).click();
  await expect(feedback(page)).toContainText('Correct! +0 pts (already earned today)');
  await expect(page.locator('[data-points]')).toHaveText('0 pts');
});
