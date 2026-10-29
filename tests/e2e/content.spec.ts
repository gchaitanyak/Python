import { test } from '@playwright/test';
import { sortedLessons, sortedModules } from '../../src/lib/curriculum';
import { openLesson, playLesson, readCurriculum, readLesson } from './helpers';

// Every written lesson in modules 4–8 is played through the real player UI with its
// reference answers (the validator checks the harness; this checks the browser).
const curriculum = readCurriculum();

test.describe.configure({ timeout: 120_000 });
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'desktop', 'played once, on desktop');
});

for (const module of sortedModules(curriculum).slice(3, 8)) {
  const lessons = sortedLessons(module).filter((l) => l.status === 'written');
  lessons.forEach((entry, i) => {
    test(`module ${module.order}: ${entry.id} plays with full marks`, async ({ page }) => {
      // Mark the earlier lessons in this module as done so sequential unlock lets us in.
      const earlier = lessons.slice(0, i).map((l) => l.id);
      await page.goto('/learn/');
      await page.evaluate((ids) => {
        const done = { completed: true, bestAccuracy: 100, bestPoints: 0, lastPractisedAt: new Date().toISOString(), questionState: {} };
        localStorage.setItem('pe:progress:v1', JSON.stringify({ version: 1, lessons: Object.fromEntries(ids.map((id) => [id, done])), streak: { count: 0, lastDay: null } }));
      }, earlier);
      await openLesson(page, entry.id, !entry.free);
      await playLesson(page, readLesson(entry.id));
    });
  });
}
