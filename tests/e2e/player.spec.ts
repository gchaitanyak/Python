import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Lesson } from '../../src/player/types';

const SAMPLES = ['py-variables', 'py-lists-basics', 'py-functions-basics'];
const readLesson = (id: string): Lesson =>
  JSON.parse(readFileSync(resolve(import.meta.dirname, `../../content/lessons/${id}.json`), 'utf8')) as Lesson;

const primary = (page: Page) => page.locator('[data-action="primary"]');
const feedback = (page: Page) => page.locator('[data-feedback]');

async function open(page: Page, lessonId: string) {
  await page.goto(`/practice/?lesson=${lessonId}`);
  await expect(page.locator('[data-python-status]')).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
}

async function setCode(page: Page, code: string) {
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(code);
}

async function goToQuestion(page: Page, lesson: Lesson, id: string) {
  const target = lesson.questions.findIndex((q) => q.id === id);
  for (let i = 0; i < target; i++) {
    const skip = page.locator('[data-action="skip"]');
    await ((await skip.isVisible()) ? skip.click() : primary(page).click());
  }
  await expect(page.locator('[data-progress-text]')).toHaveText(`Question ${target + 1} of ${lesson.questions.length}`);
}

test.describe.configure({ timeout: 120_000 });

for (const id of SAMPLES) {
  test(`${id} is playable end to end with full marks`, async ({ page }) => {
    const lesson = readLesson(id);
    await open(page, id);
    await expect(page.locator('h1')).toHaveText(lesson.title);
    let expectedPoints = 0;
    for (const q of lesson.questions) {
      switch (q.type) {
        case 'explain':
          break;
        case 'write_code':
        case 'fix_code':
          await setCode(page, q.solution);
          break;
        case 'predict_output':
          await page.locator('#predict-input').fill(q.expectedOutput);
          break;
        case 'multiple_choice':
          await page.locator(`input[type="radio"][value="${q.answer}"]`).check();
          break;
        case 'fill_blank': {
          const inputs = page.locator('input[data-blank]');
          for (let i = 0; i < q.blanks.length; i++) await inputs.nth(i).fill(q.blanks[i]!);
          break;
        }
      }
      if (q.type !== 'explain') {
        await primary(page).click();
        await expect(feedback(page), `${q.id} should pass`).toHaveClass(/feedback--pass/);
        expectedPoints += q.points ?? lesson.basePoints;
        await expect(page.locator('[data-points]')).toHaveText(`${expectedPoints} pts`);
      }
      await primary(page).click();
    }
    const summary = page.locator('[data-summary]');
    await expect(summary.getByRole('heading', { name: 'Lesson complete!' })).toBeFocused();
    await expect(summary).toContainText('100%');
    await expect(summary).toContainText(String(expectedPoints));
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
  await page.goto('/practice/?lesson=py-list-methods');
  await expect(page.getByRole('heading', { name: 'Sign in required' })).toBeVisible();
  await page.goto('/practice/?lesson=py-numbers-math');
  await expect(page.locator('[data-message]')).toContainText('isn’t ready yet');
  await page.goto('/practice/?lesson=nope');
  await expect(page.getByRole('heading', { name: 'Lesson not found' })).toBeVisible();
});

test('player has no serious accessibility violations', async ({ page }) => {
  await open(page, 'py-lists-basics');
  await primary(page).click();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
});
