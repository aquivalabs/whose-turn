import { expect, test } from '@playwright/test';

test('at 1280 wide with the update chip shown, the status bar stays on one line (RMA-439)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.route('**/api/state*', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.update = { current: '1.0.0', latest: '1.1.0', available: true, state: 'idle' };
    await route.fulfill({ response, json: body });
  });
  await page.goto('/');
  await expect(page.locator('.status-bar__center button')).toBeVisible();

  const heights = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.status-bar button, .status-bar a')].map((node) => node.getBoundingClientRect().height),
  );
  const bar = await page.locator('.status-bar').boundingBox();

  expect(Math.max(...heights)).toBeLessThanOrEqual(28);
  expect(bar?.height).toBeLessThanOrEqual(32);
  await expect(page.getByRole('button', { name: 'Open as app' })).toBeVisible();
  await expect(page.getByRole('switch', { name: /Notifications/ })).toBeVisible();
});
