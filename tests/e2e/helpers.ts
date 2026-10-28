import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Curriculum, Lesson } from '../../src/player/types';

const content = resolve(import.meta.dirname, '../../content');

export const readLesson = (id: string): Lesson => JSON.parse(readFileSync(resolve(content, `lessons/${id}.json`), 'utf8')) as Lesson;
export const readCurriculum = (): Curriculum => JSON.parse(readFileSync(resolve(content, 'curriculum.json'), 'utf8')) as Curriculum;

export const primary = (page: Page) => page.locator('[data-action="primary"]');
export const feedback = (page: Page) => page.locator('[data-feedback]');

export async function openLesson(page: Page, lessonId: string, preview = false) {
  await page.goto(`/practice/?lesson=${lessonId}${preview ? '&preview=1' : ''}`);
  await expect(page.locator('[data-python-status]')).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
}

export async function setCode(page: Page, code: string) {
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(code);
}

export async function goToQuestion(page: Page, lesson: Lesson, id: string) {
  const target = lesson.questions.findIndex((q) => q.id === id);
  for (let i = 0; i < target; i++) {
    const skip = page.locator('[data-action="skip"]');
    await ((await skip.isVisible()) ? skip.click() : primary(page).click());
  }
  await expect(page.locator('[data-progress-text]')).toHaveText(`Question ${target + 1} of ${lesson.questions.length}`);
}

/** Answers every question with its reference answer, checking each passes. Returns the points earned. */
export async function playLesson(page: Page, lesson: Lesson): Promise<number> {
  await expect(page.locator('h1')).toHaveText(lesson.title);
  let points = 0;
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
      await expect(feedback(page), `${lesson.id} ${q.id} should pass`).toHaveClass(/feedback--pass/, { timeout: 15_000 });
      points += q.points ?? lesson.basePoints;
      await expect(page.locator('[data-points]')).toHaveText(`${points} pts`);
    }
    await primary(page).click();
  }
  const summary = page.locator('[data-summary]');
  await expect(summary.getByRole('heading', { name: 'Lesson complete!' })).toBeFocused();
  await expect(summary).toContainText('100%');
  return points;
}
