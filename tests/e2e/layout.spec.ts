import { expect, test } from '@playwright/test';

for (const path of ['/', '/learn/']) {
  test(`${path} renders header, main and footer`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('header.site-header')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Learn' })).toBeVisible();
    await expect(page.locator('main h1')).toBeVisible();
    await expect(page.locator('footer.site-footer')).toBeVisible();
    // No horizontal scroll at any tested width (375px project included).
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('skip link is the first tab stop and moves focus to main', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main#main')).toBeFocused();
});
