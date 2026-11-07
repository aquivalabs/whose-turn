import { expect, test } from '@playwright/test';

interface Panel {
  name: string;
  body: number;
  scroller: number;
  content: number;
  scrolled: number;
}

const measure = () =>
  [...document.querySelectorAll<HTMLElement>('.island')].flatMap((island) => {
    const body = island.querySelector<HTMLElement>('.island__body');
    const scroller = [...island.querySelectorAll<HTMLElement>('*')].find((node) =>
      /auto|scroll/.test(getComputedStyle(node).overflowY),
    );
    if (!body || !scroller) {
      return [];
    }
    scroller.scrollTop = 40;
    const scrolled = scroller.scrollTop;
    scroller.scrollTop = 0;
    const name = [...island.classList].find((name) => name.startsWith('dashboard__')) ?? island.className;
    return [{ name, body: body.clientHeight, scroller: scroller.clientHeight, content: scroller.scrollHeight, scrolled }];
  });

for (const [width, height] of [
  [1710, 985],
  [1200, 640],
]) {
  test(`in the fitted dashboard at ${width}×${height}, every panel's list stays inside the panel and scrolls when it overflows`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(page.locator('.dashboard__waiting tbody tr').first()).toBeVisible();

    const panels: Panel[] = await page.evaluate(measure);

    expect(panels.length).toBeGreaterThan(1);
    for (const panel of panels) {
      expect(panel.scroller, panel.name).toBeLessThanOrEqual(panel.body + 1);
      if (panel.content > panel.scroller + 1) {
        expect(panel.scrolled, `${panel.name} overflows but does not scroll`).toBeGreaterThan(0);
      }
    }
  });
}

test('below the breakpoint the page flows: no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 900 });
  await page.goto('/');
  await expect(page.locator('.dashboard__waiting')).toBeVisible();

  const sideways = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);

  expect(sideways).toBe(false);
});
