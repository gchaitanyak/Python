import { expect, test, type Page } from '@playwright/test';
import { adminSet, newLearner, primary, readLesson, register, uidFor, answer, feedback } from './helpers';

const PROJECT = 'demo-python-exercises';
const FIRESTORE = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const PREMIUM_LESSON = 'py-comparison-logical'; // module 3, lesson 2 (premium)
const PREVIOUS = 'py-arithmetic-assignment';

test.describe.configure({ timeout: 180_000 });
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'desktop', 'payment flows run once, on desktop');
});

/** An ID token for the user, straight from the Auth emulator, to call the Firestore REST API as them. */
async function idToken(page: Page, email: string, password: string): Promise<string> {
  const res = await page.request.post(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`, {
    data: { email, password, returnSecureToken: true },
  });
  return ((await res.json()) as { idToken: string }).idToken;
}

async function choosePlan(page: Page, plan: 'monthly' | 'annual' | 'lifetime') {
  await page.goto('/pricing/');
  await page.locator(`[data-plan="${plan}"]`).click();
  await page.waitForURL(/127\.0\.0\.1:12111\/checkout\//);
}

async function openPremiumLesson(page: Page, uid: string) {
  await adminSet(page.request, `users/${uid}/progress/${PREVIOUS}`, { completed: true, bestAccuracy: 100 });
  await page.goto(`/practice/?lesson=${PREMIUM_LESSON}`);
}

test('SPEC acceptance 3: a free user sees the Upgrade overlay and cannot read the premium lesson via the Firestore API', async ({ page }) => {
  const who = newLearner();
  await register(page, who);
  await page.goto(`/practice/?lesson=${PREMIUM_LESSON}`);
  await expect(page.getByRole('heading', { name: 'Upgrade to continue' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'See plans' })).toHaveAttribute('href', /^\/pricing\//);
  await expect(page.locator('[data-prompt]')).toBeHidden();

  // Direct API reads are refused by the security rules — as this user, and anonymously.
  const token = await idToken(page, who.email, who.password);
  const asUser = await page.request.get(`${FIRESTORE}/lessonContent/${PREMIUM_LESSON}`, { headers: { Authorization: `Bearer ${token}` } });
  expect(asUser.status()).toBe(403);
  expect(await asUser.text()).not.toContain('"questions"');
  expect((await page.request.get(`${FIRESTORE}/lessonContent/${PREMIUM_LESSON}`)).status()).toBe(403);
  // …and premium lessons are never served as static files.
  expect((await page.request.get(`/data/lessons/${PREMIUM_LESSON}.json`)).status()).toBe(404);
});

test('SPEC acceptance 4: a test payment flips the user to premium within 10 s; cancelling at period end keeps access until it ends', async ({ page }) => {
  const who = newLearner();
  await register(page, who);
  const uid = await uidFor(page.request, who.username);

  await choosePlan(page, 'monthly');
  await expect(page.getByRole('heading', { name: 'Pay for the monthly plan' })).toBeVisible();
  const paidAt = Date.now();
  await page.getByRole('button', { name: 'Pay' }).click();
  await page.waitForURL('**/account/?checkout=success');
  await expect(page.locator('[data-status]')).toHaveText('You’re premium now! Every lesson is unlocked.', { timeout: 10_000 });
  expect(Date.now() - paidAt).toBeLessThan(10_000);
  await expect(page.locator('[data-plan]')).toHaveText('Premium');
  await expect(page.locator('[data-plan-detail]')).toHaveText('Premium (monthly). Renews automatically.');

  // Premium content now loads from Firestore and plays.
  await openPremiumLesson(page, uid);
  await expect(page.locator('h1')).toHaveText(readLesson(PREMIUM_LESSON).title);
  const q2 = readLesson(PREMIUM_LESSON).questions[1]!;
  await primary(page).click();
  await expect(page.locator('[data-python-status]')).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  await answer(page, q2);
  await primary(page).click();
  await expect(feedback(page)).toHaveClass(/feedback--pass/);

  // Customer Portal: cancel at the end of the period.
  await page.goto('/account/');
  await page.getByRole('button', { name: 'Manage subscription' }).click();
  await page.waitForURL(/127\.0\.0\.1:12111\/portal\//);
  await page.getByRole('button', { name: 'Cancel at period end' }).click();
  await expect(page.locator('[data-status]')).toContainText('Cancels on');
  await page.getByRole('link', { name: 'Return to Python Exercises' }).click();
  await page.waitForURL('**/account/');
  await expect(page.locator('[data-plan-detail]')).toContainText('Your subscription won’t renew.', { timeout: 10_000 });
  await expect(page.locator('[data-plan-detail]')).toContainText('Premium until');
  await openPremiumLesson(page, uid);
  await expect(page.locator('h1')).toHaveText(readLesson(PREMIUM_LESSON).title);

  // The period ends: access goes, and the paywall is back.
  await page.goto('/account/');
  await page.getByRole('button', { name: 'Manage subscription' }).click();
  await page.getByRole('button', { name: 'End subscription now' }).click();
  await page.getByRole('link', { name: 'Return to Python Exercises' }).click();
  await expect(page.locator('[data-plan-detail]')).toHaveText('Free plan. Your premium subscription has ended.', { timeout: 10_000 });
  await openPremiumLesson(page, uid);
  await expect(page.getByRole('heading', { name: 'Upgrade to continue' })).toBeVisible();
});

test('lifetime: one payment, premium with no end date', async ({ page }) => {
  await register(page, newLearner());
  await choosePlan(page, 'lifetime');
  await page.getByRole('button', { name: 'Pay' }).click();
  await page.waitForURL('**/account/?checkout=success');
  await expect(page.locator('[data-plan-detail]')).toHaveText('Lifetime premium — no renewals, no end date.', { timeout: 10_000 });
  await page.goto('/pricing/');
  await expect(page.locator('[data-status]')).toContainText('You already have premium for life');
});

test('pricing: plans are shown, checkout can be cancelled, and signed-out visitors are sent to sign up', async ({ page }) => {
  await page.goto('/pricing/');
  await expect(page.locator('.plan')).toHaveCount(3);
  await expect(page.locator('.plan--highlight')).toContainText('Annual');
  await expect(page.locator('.plan--highlight')).toContainText('Best value');
  await page.locator('[data-plan="annual"]').click();
  await page.waitForURL('**/register/?next=%2Fpricing%2F');

  await register(page, newLearner(), '/pricing/');
  await page.locator('[data-plan="annual"]').click();
  await page.waitForURL(/127\.0\.0\.1:12111\/checkout\//);
  await page.getByRole('button', { name: 'Cancel and go back' }).click();
  await page.waitForURL('**/pricing/?checkout=cancelled');
  await expect(page.locator('[data-status]')).toContainText('Checkout cancelled');
});
