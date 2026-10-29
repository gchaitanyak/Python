import { expect, test, type Page } from '@playwright/test';
import { feedback, goToQuestion, newLearner, openLesson, primary, readLesson, register, setCode } from './helpers';

test.describe.configure({ timeout: 120_000 });
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'desktop', 'AI tutor flows run once, on desktop');
});

const LESSON = 'py-variables';
const tutor = (page: Page) => page.getByRole('button', { name: 'Ask the AI tutor' });

async function failTwice(page: Page) {
  await openLesson(page, LESSON);
  await goToQuestion(page, readLesson(LESSON), 'q02');
  await setCode(page, 'x = 1\n');
  await expect(tutor(page)).toBeHidden();
  await primary(page).click();
  await expect(feedback(page)).toContainText('Not quite');
  await expect(tutor(page)).toBeHidden(); // only after 2 failed checks
  await primary(page).click();
  await expect(feedback(page)).toContainText('ask the AI tutor');
}

test('after two failed checks a signed-in learner gets an AI hint and can rate it', async ({ page }) => {
  await register(page, newLearner());
  await failTwice(page);
  await tutor(page).click();
  const box = page.locator('[data-ai-hint]');
  await expect(box).toContainText('AI tutor says:');
  await expect(box).toContainText('one check fails');
  await expect(tutor(page)).toBeHidden();
  await box.getByRole('button', { name: 'Helpful', exact: true }).click();
  await expect(box).toContainText('Thanks for the feedback!');
});

test('anonymous learners are asked to sign in instead', async ({ page }) => {
  await failTwice(page);
  await tutor(page).click();
  await expect(page.locator('[data-ai-hint]')).toContainText('to ask the AI tutor');
  await expect(page.locator('[data-ai-hint]').getByRole('link', { name: 'Log in' })).toHaveAttribute('href', /^\/login\/\?next=/);
});
