import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { newLearner, openLesson, playLesson, readLesson, register } from './helpers';

test.describe.configure({ timeout: 180_000 });
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'desktop', 'group flows run once, on desktop');
});

test('SPEC acceptance 8: a group admin sees each member’s progress and can export CSV', async ({ page, browser }) => {
  // The teacher creates a group.
  const teacher = newLearner();
  await register(page, teacher);
  await page.goto('/admin/');
  await page.getByLabel('New group name').fill('Year 10 Python');
  await page.getByRole('button', { name: 'Create group' }).click();
  await expect(page.locator('[data-group-name]')).toHaveText('Year 10 Python');
  const invite = await page.locator('[data-invite]').inputValue();
  expect(invite).toMatch(/\/join\/\?code=[A-Z2-9]{8}$/);
  await expect(page.getByText('No one has joined yet')).toBeVisible();
  await page.reload(); // the account menu reads the profile on page load
  await page.locator('.account-menu__button').click();
  await expect(page.getByRole('link', { name: 'Admin' })).toBeVisible();

  // A student follows the invite link, signs up, joins and finishes a lesson.
  const context = await browser.newContext();
  const student = await context.newPage();
  const who = newLearner();
  await student.goto(invite);
  await expect(student.locator('[data-status]')).toContainText('to join your group');
  await student.getByRole('link', { name: 'Create a free account' }).click();
  await register(student, who, new URL(invite).pathname + new URL(invite).search);
  await expect(student.locator('[data-group-name]')).toHaveText('Year 10 Python');
  await student.getByRole('button', { name: 'Join group' }).click();
  await expect(student.locator('[data-status]')).toContainText('You joined Year 10 Python');
  await openLesson(student, 'py-intro-first-program');
  await playLesson(student, readLesson('py-intro-first-program'));
  await expect(student.locator('[data-summary]')).toContainText('Saved to your account.');
  await student.goto('/account/');
  await expect(student.locator('[data-groups]')).toContainText('Year 10 Python');

  // The teacher sees the student's progress and exports it.
  await page.goto('/admin/');
  const row = page.locator('[data-members] tr', { hasText: who.username });
  await expect(row.locator('td').nth(0)).toHaveText('1');
  await expect(row.locator('td').nth(1)).toHaveText('100%');
  await expect(row.locator('td').nth(2)).not.toHaveText('—');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()]);
  expect(download.suggestedFilename()).toBe('year-10-python-progress.csv');
  const csv = readFileSync((await download.path())!, 'utf8').split('\r\n');
  expect(csv[0]).toBe('username,joined,lessons_completed,average_accuracy,last_active,premium_seat');
  expect(csv[1]).toMatch(new RegExp(`^${who.username},[^,]+,1,100,[^,]+,false$`));

  // Removing the student takes them out of the group.
  page.once('dialog', (d) => void d.accept());
  await row.getByRole('button', { name: `Remove ${who.username}` }).click();
  await expect(page.getByText('No one has joined yet')).toBeVisible();
  await context.close();
});
