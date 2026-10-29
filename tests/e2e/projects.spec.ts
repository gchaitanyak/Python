import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { projectToLesson, type Project } from '../../src/lib/projects';
import { adminSet, answer, feedback, newLearner, primary, register, uidFor } from './helpers';

test.describe.configure({ timeout: 180_000 });
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'desktop', 'project flows run once, on desktop');
});

const dir = resolve(import.meta.dirname, '../../content/projects');
const bundle = (id: string): Project => {
  const p = JSON.parse(readFileSync(resolve(dir, id, 'project.json'), 'utf8')) as Project;
  return { ...p, datasets: p.datasets.map((d) => ({ ...d, content: readFileSync(resolve(dir, id, d.file), 'utf8') })) };
};
const FIRESTORE = 'http://127.0.0.1:8080/v1/projects/demo-python-exercises/databases/(default)/documents';

async function playProject(page: Page, p: Project) {
  const lesson = projectToLesson(p);
  await page.getByRole('button', { name: 'Start project' }).click();
  await expect(page.locator('[data-lesson-title]')).toHaveText(p.title);
  await expect(page.locator('[data-python-status]')).toHaveAttribute('data-status', 'ready', { timeout: 60_000 });
  for (const q of lesson.questions) {
    await answer(page, q);
    if (q.type !== 'explain') {
      await primary(page).click();
      await expect(feedback(page), `${p.id} ${q.id} should pass`).toHaveClass(/feedback--pass/, { timeout: 15_000 });
    }
    await primary(page).click();
  }
  await expect(page.locator('[data-summary]').getByRole('heading', { name: 'Project complete!' })).toBeFocused();
}

test('the projects page lists all five, with the unwritten ones coming soon', async ({ page }) => {
  await page.goto('/projects/');
  await expect(page.locator('[data-project-id]')).toHaveCount(5);
  await expect(page.locator('.project-card .badge--soon')).toHaveCount(3);
  await page.getByRole('link', { name: 'Expense Tracker' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Expense Tracker' })).toBeVisible();
});

test('the free Expense Tracker project: download the files, finish every step, see it marked done', async ({ page }) => {
  const p = bundle('expense-tracker');
  await page.goto('/projects/expense-tracker/');
  const dataset = page.getByRole('link', { name: 'Download expenses.csv' });
  expect(await (await page.request.get((await dataset.getAttribute('href'))!)).text()).toBe(p.datasets[0]!.content);
  await expect(page.getByRole('button', { name: 'Start project' })).toBeEnabled();
  const [starter] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download starter .py' }).click()]);
  expect(starter.suggestedFilename()).toBe('expense-tracker-starter.py');
  const script = readFileSync((await starter.path())!, 'utf8');
  expect(script).toContain('# Expense Tracker — starter file');
  expect(script).toContain('def load_expenses(path):');

  await playProject(page, p);
  await page.goto('/projects/');
  await expect(page.locator('[data-project-id="expense-tracker"] [data-project-state]')).toHaveText('Completed ✓');
});

test('the premium Text Adventure is locked for anonymous and free users and plays for premium', async ({ page }) => {
  await page.goto('/projects/text-adventure/');
  await expect(page.locator('[data-project-status]')).toContainText('premium project');
  await expect(page.getByRole('button', { name: 'Start project' })).toBeDisabled();
  expect((await page.request.get('/data/projects/text-adventure.json')).status()).toBe(404);

  const who = newLearner();
  await register(page, who);
  await page.goto('/projects/text-adventure/');
  await expect(page.locator('[data-project-status]')).toContainText('part of premium');
  expect((await page.request.get(`${FIRESTORE}/projectContent/text-adventure`)).status()).toBe(403);

  const uid = await uidFor(page.request, who.username);
  await adminSet(page.request, `users/${uid}`, { entitlement: 'premium', premiumUntil: null });
  await page.goto('/projects/text-adventure/');
  const [world] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download world.json' }).click()]);
  expect(JSON.parse(readFileSync((await world.path())!, 'utf8')).start).toBe('Gatehouse');
  await playProject(page, bundle('text-adventure'));
  // Signed in: the finish is saved to the account too.
  await expect
    .poll(async () => (await page.request.get(`${FIRESTORE}/users/${uid}/projects/text-adventure`, { headers: { Authorization: 'Bearer owner' } })).text())
    .toContain('"completed"');
});
