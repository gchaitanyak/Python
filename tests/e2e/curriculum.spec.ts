import { expect, test } from '@playwright/test';
import { lessonsInOrder, sortedLessons, sortedModules } from '../../src/lib/curriculum';
import { openLesson, playLesson, readCurriculum, readLesson } from './helpers';

const curriculum = readCurriculum();

test('every module page lists every lesson from the curriculum, in order', async ({ page }) => {
  for (const m of sortedModules(curriculum)) {
    await page.goto(`/learn/${m.id}/`);
    await expect(page.locator('h1')).toHaveText(m.title);
    await expect(page.locator('[data-lesson-id]')).toHaveCount(m.lessons.length);
    const ids = await page.locator('[data-lesson-id]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.lessonId));
    expect(ids).toEqual(sortedLessons(m).map((l) => l.id));
    await expect(page.locator('header .nav-link[aria-current="page"]')).toHaveText('Learn');
  }
});

test('the dashboard lists every lesson and recommends the first one', async ({ page }) => {
  await page.goto('/learn/');
  await expect(page.locator('[data-lesson-id]')).toHaveCount(lessonsInOrder(curriculum).length);
  await expect(page.locator('[data-next-title]')).toHaveText('Your First Python Program');
  await expect(page.locator('[data-lesson-id="py-print-and-comments"]')).toHaveAttribute('data-access', 'finish-previous');
  await expect(page.locator('[data-lesson-id="py-comparison-logical"] [data-state-label]')).toHaveText('Locked · sign in');
  await expect(page.locator('[data-lesson-id="py-numpy-basics"]')).toHaveAttribute('data-access', 'coming-soon');
});

test('the landing page links into the curriculum and the first lesson', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.overview__item')).toHaveCount(curriculum.modules.length);
  await page.getByRole('link', { name: 'Start learning free' }).first().click();
  await expect(page).toHaveURL(/lesson=py-intro-first-program/);
  await expect(page.locator('h1')).toHaveText('Your First Python Program');
});

// Modules 1–3 are fully playable end to end. Premium lessons (module 3, lessons 2+)
// are opened with the dev-only preview flag until accounts and payments exist.
for (const m of sortedModules(curriculum).slice(0, 3)) {
  test(`module ${m.order} (${m.title}) is playable end to end in order`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'one full playthrough is enough');
    test.setTimeout(300_000);
    for (const entry of sortedLessons(m)) {
      await openLesson(page, entry.id, !entry.free);
      await playLesson(page, readLesson(entry.id));
    }
    await page.goto(`/learn/${m.id}/`);
    await expect(page.locator('[data-module-progress]')).toHaveText(`${m.lessons.length} of ${m.lessons.length} lessons done`);
    for (const l of m.lessons) await expect(page.locator(`[data-lesson-id="${l.id}"]`)).toHaveAttribute('data-status', 'strong');
  });
}

test('completing a lesson unlocks the next one and updates the dashboard', async ({ page }) => {
  await openLesson(page, 'py-intro-first-program');
  await playLesson(page, readLesson('py-intro-first-program'));
  await page.goto('/learn/');
  await expect(page.locator('[data-next-title]')).toHaveText('Printing and Comments');
  await expect(page.locator('[data-lesson-id="py-intro-first-program"]')).toHaveAttribute('data-status', 'strong');
  await expect(page.locator('[data-lesson-id="py-print-and-comments"]')).toHaveAttribute('data-access', 'open');
  await expect(page.locator('[data-streak]')).toHaveText('1 day');
  await page.goto('/learn/getting-started/');
  await expect(page.locator('[data-module-progress]')).toHaveText('1 of 3 lessons done');
  await expect(page.locator('[data-module-start]')).toHaveText('Continue: Printing and Comments');
});

test('a module’s first lesson recommends finishing earlier modules', async ({ page }) => {
  await page.goto('/learn/operators/');
  await expect(page.locator('[data-module-note]')).toContainText('Recommended: finish Getting Started first.');
  await openLesson(page, 'py-arithmetic-assignment');
  await expect(page.locator('[data-intro] .note')).toContainText('Getting Started');
});
