import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Curriculum, Lesson, Question } from '../../src/player/types';

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

/** Enters the reference answer for one question (does not press Check). */
export async function answer(page: Page, q: Question) {
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
}

/** Answers every question with its reference answer, checking each passes. Returns the points earned. */
export async function playLesson(page: Page, lesson: Lesson): Promise<number> {
  await expect(page.locator('h1')).toHaveText(lesson.title);
  let points = 0;
  for (const q of lesson.questions) {
    await answer(page, q);
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

export const unique = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

export function newLearner() {
  const id = unique();
  return { firstName: 'Robin', username: `robin_${id}`.slice(0, 20), email: `robin.${id}@example.com`, password: 'learning-python-42' };
}

export async function register(page: Page, who: ReturnType<typeof newLearner>, next = '/learn/') {
  await page.goto(`/register/?next=${encodeURIComponent(next)}`);
  await page.getByLabel('First name').fill(who.firstName);
  await page.getByLabel('Username').fill(who.username);
  await page.getByLabel('Email', { exact: true }).fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL((url) => url.pathname === new URL(next, 'http://x').pathname);
  await expect(page.locator('[data-account-name]')).toHaveText(who.username);
}


const FIRESTORE = 'http://127.0.0.1:8080/v1/projects/demo-python-exercises/databases/(default)/documents';

/** The uid behind a username (usernames/{name} is public). */
export async function uidFor(request: APIRequestContext, username: string): Promise<string> {
  const res = await request.get(`${FIRESTORE}/usernames/${username}`);
  return ((await res.json()) as { fields: { uid: { stringValue: string } } }).fields.uid.stringValue;
}

type Value = string | number | boolean | null;
const toFirestore = (v: Value) =>
  v === null ? { nullValue: null } : typeof v === 'string' ? { stringValue: v } : typeof v === 'boolean' ? { booleanValue: v } : { integerValue: String(v) };

/** Admin write to the Firestore emulator (bypasses rules) — test set-up only, e.g. granting premium. */
export async function adminSet(request: APIRequestContext, path: string, fields: Record<string, Value>): Promise<void> {
  const mask = Object.keys(fields).map((f) => `updateMask.fieldPaths=${f}`).join('&');
  const res = await request.patch(`${FIRESTORE}/${path}?${mask}`, {
    headers: { Authorization: 'Bearer owner' },
    data: { fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, toFirestore(v)])) },
  });
  expect(res.ok(), await res.text()).toBe(true);
}
