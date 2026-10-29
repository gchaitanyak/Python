import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const slugs = readdirSync(resolve(import.meta.dirname, '../../content/guides')).filter((f) => f.endsWith('.md'));

test('the guides index lists every guide and each guide links to its lesson', async ({ page }) => {
  await page.goto('/guides/');
  await expect(page.locator('.guide-card')).toHaveCount(slugs.length);
  await page.getByRole('link', { name: 'Python Lists for Beginners' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Python Lists for Beginners');
  await expect(page.getByRole('navigation', { name: 'On this page' }).getByRole('link')).not.toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Practise this →' })).toHaveAttribute('href', '/practice/?lesson=py-lists-basics');
});

test('guide examples run in the browser on demand', async ({ page }) => {
  await page.goto('/guides/strings/');
  const example = page.locator('[data-example]').filter({ hasText: 'word[::-1]' });
  await example.getByRole('button', { name: 'Run' }).click();
  await expect(example.locator('[data-output]')).toHaveText('n k\nnote\nbook\nkoobeton', { timeout: 60_000 });
});
