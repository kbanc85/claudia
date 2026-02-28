import { expect, test } from '@playwright/test';

test('shell mounts', async ({ page }) => {
  const url = process.env.TEST_URL || 'http://localhost:3849';
  await page.goto(url, { waitUntil: 'networkidle' });

  const snapshot = await page.evaluate(() => ({
    rootChildren: document.getElementById('root')?.childElementCount ?? 0,
    title: document.title
  }));

  expect(snapshot.rootChildren).toBeGreaterThan(0);
  expect(snapshot.title).toContain('Claudia');
});
