import { expect, test } from '@playwright/test';
import { newLearner, openLesson, playLesson, readLesson, register } from './helpers';

const FIRESTORE = 'http://127.0.0.1:8080/v1/projects/demo-python-exercises/databases/(default)/documents';

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'desktop', 'runs once, on desktop');
});

test('signed-in learners can say whether a lesson was clear (SPEC §5.10)', async ({ page }) => {
  await register(page, newLearner());
  await openLesson(page, 'py-intro-first-program');
  await playLesson(page, readLesson('py-intro-first-program'));
  const form = page.locator('[data-feedback-form]');
  await form.getByRole('button', { name: '👎 Not really' }).click();
  await expect(form.getByRole('button', { name: '👎 Not really' })).toHaveAttribute('aria-pressed', 'true');
  await form.getByLabel('Anything to tell us? (optional)').fill('Question 3 confused me.');
  await form.getByRole('button', { name: 'Send feedback' }).click();
  await expect(form.locator('[data-feedback-status]')).toHaveText('Thanks — your feedback helps us improve the lessons.');
  const stored = await page.request.get(`${FIRESTORE}/feedback?pageSize=300`, { headers: { Authorization: 'Bearer owner' } });
  expect(await stored.text()).toContain('Question 3 confused me.');
});

test('anonymous learners don’t see the feedback form', async ({ page }) => {
  await openLesson(page, 'py-intro-first-program');
  await playLesson(page, readLesson('py-intro-first-program'));
  await expect(page.locator('[data-feedback-form]')).toHaveCount(0);
});
