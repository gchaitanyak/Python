import { expect, test, type Page } from '@playwright/test';
import type { Question } from '../../src/player/types';
import { adminSet, answer, feedback, newLearner, openLesson, playLesson, primary, readLesson, register, uidFor } from './helpers';

test.describe.configure({ timeout: 180_000 });
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'desktop', 'gamification flows run once, on desktop');
});

interface Challenge {
  date: string;
  questions: (Question & { source: { lessonId: string; questionId: string } })[];
}

/** Opens /daily/ and returns the challenge the page received from getDailyChallenge. */
async function openDaily(page: Page): Promise<Challenge> {
  const response = page.waitForResponse((r) => r.url().includes('/getDailyChallenge') && r.request().method() === 'POST');
  await page.goto('/daily/');
  const challenge = ((await (await response).json()) as { result: Challenge }).result;
  await expect(page.locator('[data-daily-start]')).toBeEnabled();
  return challenge;
}

async function playChallenge(page: Page, challenge: Challenge) {
  await page.locator('[data-daily-start]').click();
  await expect(page.locator('[data-python-status]')).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  for (const q of challenge.questions) {
    await answer(page, q);
    await primary(page).click();
    await expect(feedback(page), `${q.source.lessonId} ${q.source.questionId}`).toHaveClass(/feedback--pass/, { timeout: 15_000 });
    await primary(page).click();
  }
}

test('SPEC acceptance 7: two different users see the same 5 daily questions', async ({ browser }) => {
  const pages: Page[] = [];
  const challenges: Challenge[] = [];
  for (let i = 0; i < 2; i++) {
    const page = await (await browser.newContext()).newPage();
    await register(page, newLearner());
    challenges.push(await openDaily(page));
    pages.push(page);
  }
  expect(challenges[0]!.questions).toHaveLength(5);
  expect(challenges[1]).toEqual(challenges[0]);
  for (const page of pages) await page.locator('[data-daily-start]').click();
  const prompts = await Promise.all(pages.map((p) => p.locator('[data-prompt]').innerText()));
  expect(prompts[1]).toBe(prompts[0]);
});

test('daily challenge: one scored attempt with rank and streak, then practice', async ({ page }) => {
  const who = newLearner();
  await register(page, who);
  const challenge = await openDaily(page);
  await expect(page.locator('[data-daily-start]')).toHaveText('Start challenge');
  await playChallenge(page, challenge);

  const summary = page.locator('[data-summary]');
  await expect(summary.getByRole('heading', { name: 'Challenge complete!' })).toBeVisible();
  await expect(summary).toContainText('Accuracy100%');
  await expect(summary).toContainText('Streak1 day');
  const rank = (await summary.locator('.stat', { hasText: 'Rank' }).locator('dd').innerText()).trim();
  await expect(page.locator('[data-board="challenge"] [data-board-me]')).toContainText(`You: ${rank} with 100%`);

  // Second round is practice; the scored result stands.
  await page.getByRole('button', { name: 'Practise again' }).click();
  for (const q of challenge.questions) {
    await answer(page, q);
    await primary(page).click();
    await primary(page).click();
  }
  await expect(summary.getByRole('heading', { name: 'Practice round complete' })).toBeVisible();
  await expect(summary).toContainText('Your scored result today: 100%');

  // On a later visit the page shows the scored result.
  await openDaily(page);
  await expect(page.locator('[data-daily-status]')).toContainText('You scored 100%');
  await expect(page.locator('[data-daily-start]')).toHaveText('Practise again');

  // The dashboard card shows today in the 7-day trend.
  await page.goto('/learn/');
  await expect(page.locator('[data-daily-status]')).toHaveText('Done today: 100%');
  await expect(page.locator(`.trend__day[data-date="${challenge.date}"]`)).toContainText('100%');
});

test('anonymous visitors can practise the daily challenge but not submit', async ({ page }) => {
  const challenge = await openDaily(page);
  await expect(page.locator('[data-daily-status]')).toContainText('Log in to submit a scored attempt');
  await expect(page.locator('[data-daily-start]')).toHaveText('Practise today’s challenge');
  await playChallenge(page, challenge);
  await expect(page.locator('[data-summary]').getByRole('heading', { name: 'Practice round complete' })).toBeVisible();
});

test('leaderboards update within 5 seconds of a completed lesson', async ({ context }) => {
  const dashboard = await context.newPage();
  await register(dashboard, newLearner());
  await expect(dashboard.locator('[data-board="points"] [data-board-me]')).toHaveText('Finish a lesson today to appear here.');

  const lessonTab = await context.newPage();
  await openLesson(lessonTab, 'py-intro-first-program');
  const points = await playLesson(lessonTab, readLesson('py-intro-first-program'));
  await expect(lessonTab.locator('[data-summary-note]')).toContainText('Saved to your account.');

  // No reload: the open dashboard is listening.
  await expect(dashboard.locator('[data-board="points"] [data-board-me]')).toContainText(`with ${points} pts today`, { timeout: 5_000 });
  await expect(dashboard.locator('[data-board="streak"] [data-board-me]')).toContainText('with 1 day today', { timeout: 5_000 });
});

test('sharing a finished lesson earns a one-time +100 bonus', async ({ page, context }) => {
  await register(page, newLearner());
  await openLesson(page, 'py-intro-first-program');
  const points = await playLesson(page, readLesson('py-intro-first-program'));
  await expect(page.locator('.share__bonus')).toBeVisible();
  const popup = context.waitForEvent('page');
  await page.getByRole('link', { name: 'Post on X' }).click();
  await (await popup).close();
  await expect(page.locator('[data-share-status]')).toContainText('+100 bonus points for sharing!');

  await page.goto('/learn/');
  await expect(page.locator('[data-points]')).toHaveText(String(points + 100));
});

test('flashcards: sign in, then premium, then random cards from completed lessons', async ({ page }) => {
  await page.goto('/practice/?mode=flashcards&module=getting-started');
  await expect(page.getByRole('heading', { name: 'Sign in required' })).toBeVisible();

  const who = newLearner();
  await register(page, who);
  await page.goto('/practice/?mode=flashcards&module=getting-started');
  await expect(page.getByRole('heading', { name: 'Upgrade to continue' })).toBeVisible();

  const uid = await uidFor(page.request, who.username);
  await adminSet(page.request, `users/${uid}`, { entitlement: 'premium', premiumUntil: null });
  await page.goto('/practice/?mode=flashcards&module=getting-started');
  await expect(page.getByRole('heading', { name: 'No flashcards yet' })).toBeVisible();

  await adminSet(page.request, `users/${uid}/progress/py-intro-first-program`, { completed: true, bestAccuracy: 100 });
  await page.goto('/learn/getting-started/');
  await expect(page.locator('[data-flashcards]')).toBeVisible();
  await page.locator('[data-flashcards]').click();
  await expect(page.locator('h1')).toHaveText('Flashcards: Getting Started');
  await expect(page.locator('[data-progress-text]')).toHaveText('Card 1 of 20');
  await expect(page.locator('[data-python-status]')).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });

  // Answer the first card with its reference answer, whichever question it is.
  const prompt = await page.locator('[data-prompt]').innerText();
  const source = readLesson('py-intro-first-program').questions.find((q) => q.type !== 'explain' && prompt.startsWith(q.prompt.replace(/[`*]/g, '').slice(0, 20)));
  expect(source, `card prompt: ${prompt}`).toBeDefined();
  await answer(page, source!);
  await primary(page).click();
  await expect(feedback(page)).toHaveClass(/feedback--pass/);
  await expect(page.locator('[data-points]')).toHaveText('1 correct');
});
