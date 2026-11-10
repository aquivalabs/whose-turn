import { expect, test } from '@playwright/test';

test('at 1100 wide no Waiting on others head is cut and a long feed key stops before its copy button (RMA-455)', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto('/?ws=northwind');
  await expect(page.locator('.waiting__table')).toBeVisible();
  await expect(page.locator('.feed__group-head').first()).toBeVisible();

  const cutHeads = await page.$$eval('.waiting__table thead th', (heads) =>
    heads.filter((head) => head.scrollWidth > head.clientWidth).map((head) => head.textContent?.trim()),
  );
  expect(cutHeads).toEqual([]);

  const overlaps = await page.$$eval('.feed__group-head', (heads) =>
    heads.filter((head) => {
      const key = head.querySelector('.feed__group-key')?.getBoundingClientRect();
      const copy = head.querySelector('.feed__group-copy')?.getBoundingClientRect();
      return key && copy && key.right > copy.left;
    }).length,
  );
  expect(overlaps).toBe(0);

  const cutShortKeys = await page.$$eval('.feed__group-ticket', (keys) =>
    keys.filter((key) => /^[A-Z]+-\d+$/.test(key.textContent?.trim() ?? '') && key.scrollWidth > key.clientWidth).length,
  );
  expect(cutShortKeys).toBe(0);
});
