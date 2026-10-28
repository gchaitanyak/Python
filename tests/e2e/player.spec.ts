import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { feedback, goToQuestion, openLesson as open, playLesson, primary, readLesson, setCode } from './helpers';

// py-variables is covered by the module playthroughs in curriculum.spec.ts.
const SAMPLES = ['py-lists-basics', 'py-functions-basics'];

test.describe.configure({ timeout: 120_000 });

for (const id of SAMPLES) {
  test(`${id} is playable end to end with full marks`, async ({ page }) => {
    const lesson = readLesson(id);
    await open(page, id);
    const points = await playLesson(page, lesson);
    const summary = page.locator('[data-summary]');
    await expect(summary).toContainText(String(points));
    await expect(summary).toContainText('1 day');
  });
}

test('an infinite loop times out after 5 s and the next Run works', async ({ page }) => {
  await open(page, 'py-variables');
  await goToQuestion(page, readLesson('py-variables'), 'q02');
  await setCode(page, 'while True: pass');
  await page.keyboard.press('Shift+Enter');
  await expect(page.locator('[data-console]')).toContainText('took too long', { timeout: 10_000 });
  await setCode(page, 'print("still alive")');
  await page.keyboard.press('Shift+Enter');
  await expect(page.locator('[data-console]')).toHaveText('still alive', { timeout: 60_000 });
});

test('a wrong answer shows only the public test message', async ({ page }) => {
  const lesson = readLesson('py-variables');
  await open(page, 'py-variables');
  await goToQuestion(page, lesson, 'q02');
  await setCode(page, 'planet = "Venus"\nprint(planet)');
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(feedback(page)).toHaveClass(/feedback--fail/);
  await expect(feedback(page)).toHaveText('Not quiteplanet should hold the text Mars (capital M).');
  await expect(feedback(page)).not.toContainText('assert');
});

test('runtime errors are reported with the line number', async ({ page }) => {
  await open(page, 'py-variables');
  await goToQuestion(page, readLesson('py-variables'), 'q02');
  await setCode(page, 'planet = "Mars"\nprint(plant)');
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(feedback(page)).toContainText("NameError: name 'plant' is not defined (line 2)");
});

test('keyboard: Enter checks a multiple-choice answer and Enter continues', async ({ page }) => {
  const lesson = readLesson('py-variables');
  await open(page, 'py-variables');
  await goToQuestion(page, lesson, 'q04');
  await page.locator('input[type="radio"][value="c"]').focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('Enter');
  await expect(feedback(page)).toHaveClass(/feedback--pass/);
  await expect(primary(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-progress-text]')).toHaveText(`Question 5 of ${lesson.questions.length}`);
});

test('scoring: second try is half points; viewing the solution scores 0', async ({ page }) => {
  const lesson = readLesson('py-variables');
  await open(page, 'py-variables');
  await goToQuestion(page, lesson, 'q03');
  await page.locator('#predict-input').fill('12');
  await page.keyboard.press('Enter');
  await expect(feedback(page)).toHaveClass(/feedback--fail/);
  await page.locator('#predict-input').fill('10');
  await page.keyboard.press('Enter');
  await expect(feedback(page)).toContainText('Correct! +5 pts');
  await primary(page).click();

  // q04: show solution through the confirm dialog
  await page.locator('[data-action="solution"]').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Show solution' }).click();
  await expect(feedback(page)).toContainText('The answer is');
  await primary(page).click();
  await expect(feedback(page)).toContainText('Correct! +0 pts');
  await expect(page.locator('[data-points]')).toHaveText('5 pts');
});

test('hint and reset code', async ({ page }) => {
  const lesson = readLesson('py-variables');
  await open(page, 'py-variables');
  await goToQuestion(page, lesson, 'q05');
  await page.locator('[data-action="hint"]').click();
  await expect(page.locator('[data-hint]')).toBeVisible();
  await setCode(page, 'oops');
  await page.locator('[data-action="reset"]').click();
  const q05 = lesson.questions.find((q) => q.id === 'q05');
  const starter = q05 && 'starterCode' in q05 ? q05.starterCode : '';
  await expect.poll(async () => (await page.locator('.cm-line').allTextContents()).join('\n')).toBe(starter);
});

test('locked, unwritten and unknown lessons show a message', async ({ page }) => {
  await page.goto('/practice/?lesson=py-comparison-logical');
  await expect(page.getByRole('heading', { name: 'Sign in required' })).toBeVisible();
  await page.goto('/practice/?lesson=py-numbers-math');
  await expect(page.getByRole('heading', { name: 'Finish “Variables” first' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to Variables' })).toHaveAttribute('href', '/practice/?lesson=py-variables');
  await page.goto('/practice/?lesson=py-strings-basics');
  await expect(page.locator('[data-message]')).toContainText('isn’t ready yet');
  await page.goto('/practice/?lesson=nope');
  await expect(page.getByRole('heading', { name: 'Lesson not found' })).toBeVisible();
});

test('the Input box feeds input() on Run; Check uses the lesson’s sample answers', async ({ page }) => {
  const lesson = readLesson('py-input-output');
  // Unlock py-input-output by marking the earlier lessons in its module as done.
  await page.goto('/learn/');
  await page.evaluate(() => {
    const done = { completed: true, bestAccuracy: 100, bestPoints: 0, lastPractisedAt: new Date().toISOString(), questionState: {} };
    const lessons = Object.fromEntries(['py-variables', 'py-numbers-math', 'py-type-conversion', 'py-booleans-none'].map((id) => [id, done]));
    localStorage.setItem('pe:progress:v1', JSON.stringify({ version: 1, lessons, streak: { count: 0, lastDay: null } }));
  });
  await open(page, 'py-input-output');
  await goToQuestion(page, lesson, 'q08');
  await setCode(page, 'w = int(input("Width? "))\nh = int(input("Height? "))\nprint("Area:", w * h)');
  await page.locator('[data-stdin]').fill('6\n4');
  await page.locator('[data-action="run"]').click();
  await expect(page.locator('[data-console]')).toHaveText('Width? 6\nHeight? 4\nArea: 24');
  await page.locator('[data-stdin]').fill('');
  await page.locator('[data-action="run"]').click();
  await expect(page.locator('[data-console]')).toHaveText('Width? 7\nHeight? 5\nArea: 35');
  await primary(page).click();
  await expect(feedback(page)).toHaveClass(/feedback--pass/);
});

test('player has no serious accessibility violations', async ({ page }) => {
  await open(page, 'py-lists-basics');
  await primary(page).click();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
});
