// Layout matrix for resizable panels. Usage: node scripts/panel-matrix.mjs <url> <screenshot-dir>
// Needs the plain `playwright` package (npm install --no-save playwright) and a server with two workspaces that hold rows.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [url, outDir] = process.argv.slice(2);
if (!url || !outDir) {
  console.error('usage: node scripts/panel-matrix.mjs <url> <screenshot-dir>');
  process.exit(2);
}
const { chromium } = await import('playwright');
mkdirSync(outDir, { recursive: true });

const SIZES = [
  { width: 1280, height: 720 },
  { width: 2000, height: 1175 },
];
const SCHEMES = ['light', 'dark'];
const HEIGHT_ISLANDS = ['your-move', 'todo', 'waiting'];
const failures = [];
const expectThat = (condition, message) => {
  if (!condition) {
    failures.push(message);
    console.error('FAIL', message);
  }
};

const box = (page, selector) =>
  page.evaluate((query) => {
    const rect = document.querySelector(query)?.getBoundingClientRect();
    return rect ? { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, height: rect.height, width: rect.width } : null;
  }, selector);

const drag = async (page, handleSelector, axis, target) => {
  await page.locator(handleSelector).scrollIntoViewIfNeeded();
  const rect = await box(page, handleSelector);
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  const limit = page.viewportSize();
  const end = Math.max(1, Math.min(target, (axis === 'y' ? limit.height : limit.width) - 2));
  await page.mouse.move(axis === 'y' ? x : end, axis === 'y' ? end : y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(150);
};

const rowVisible = (page, id) =>
  page.evaluate((islandId) => {
    const island = document.getElementById(islandId);
    const row = island.querySelector('tbody > tr, .todos__list > li');
    if (!row) {
      return { rows: 0, visible: true };
    }
    const rowRect = row.getBoundingClientRect();
    const clip = (row.closest('.row-scroll') ?? island).getBoundingClientRect();
    const islandRect = island.getBoundingClientRect();
    const slack = 1;
    return {
      rows: island.querySelectorAll('tbody > tr, .todos__list > li').length,
      visible: rowRect.top >= islandRect.top - slack && rowRect.bottom <= clip.bottom + slack && rowRect.bottom <= islandRect.bottom + slack,
    };
  }, id);

const noOverflow = (page) =>
  page.evaluate(() => {
    const dashboard = document.getElementById('wt');
    const main = document.querySelector('.dashboard__main');
    return {
      page: document.documentElement.scrollHeight <= window.innerHeight + 1 && document.documentElement.scrollWidth <= window.innerWidth + 1,
      dashboard: dashboard.scrollWidth <= dashboard.clientWidth + 1,
      column: main.scrollWidth <= main.clientWidth + 1,
    };
  });

const open = async (page) => {
  await page.goto(url);
  await page.waitForSelector('#your-move .island__body');
  await page.waitForTimeout(500);
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
for (const size of SIZES) {
  for (const scheme of SCHEMES) {
    const label = `${size.width}x${size.height} ${scheme}`;
    const context = await browser.newContext({ viewport: size, colorScheme: scheme });
    const page = await context.newPage();
    await open(page);
    await page.evaluate(() => localStorage.removeItem('wt-panel-sizes'));
    await page.reload();
    await page.waitForSelector('#your-move .island__body');
    await page.waitForTimeout(500);
    const handle = (id) => `#${id} > .resize-handle`;

    for (const id of HEIGHT_ISLANDS) {
      const floor = await page.evaluate((islandId) => parseFloat(document.getElementById(islandId).style.getPropertyValue('--island-floor')), id);
      await drag(page, handle(id), 'y', 0);
      const small = await box(page, '#' + id);
      expectThat(small.height >= floor - 1, `${label} ${id}: dragged to minimum ${small.height} < floor ${floor}`);
      const row = await rowVisible(page, id);
      expectThat(row.visible, `${label} ${id}: first row not fully visible at minimum`);
      expectThat(Object.values(await noOverflow(page)).every(Boolean), `${label} ${id}: overflow at minimum`);
      await page.screenshot({ path: join(outDir, `${size.width}-${scheme}-${id}-min.png`) });

      await drag(page, handle(id), 'y', size.height * 2);
      const large = await box(page, '#' + id);
      expectThat(large.height > small.height + 15, `${label} ${id}: did not grow (${small.height} to ${large.height})`);
      expectThat(Object.values(await noOverflow(page)).every(Boolean), `${label} ${id}: overflow at large size`);
      for (const other of HEIGHT_ISLANDS.filter((item) => item !== id)) {
        const otherBox = await box(page, '#' + other);
        const otherFloor = await page.evaluate((islandId) => parseFloat(document.getElementById(islandId).style.getPropertyValue('--island-floor')), other);
        expectThat(otherBox.height >= otherFloor - 1, `${label} ${id} large: ${other} below its floor (${otherBox.height} < ${otherFloor})`);
        expectThat((await rowVisible(page, other)).visible, `${label} ${id} large: ${other} first row clipped`);
      }
      await page.screenshot({ path: join(outDir, `${size.width}-${scheme}-${id}-large.png`) });
      await page.evaluate(() => localStorage.removeItem('wt-panel-sizes'));
      await page.reload();
      await page.waitForSelector('#your-move .island__body');
      await page.waitForTimeout(400);
    }

    const feedWidth = (await box(page, '#feed')).width;
    await drag(page, handle('feed'), 'x', size.width);
    const narrow = (await box(page, '#feed')).width;
    await drag(page, handle('feed'), 'x', 0);
    const wide = (await box(page, '#feed')).width;
    expectThat(narrow >= 279 && narrow < feedWidth, `${label} feed: narrow ${narrow} (default ${feedWidth})`);
    expectThat(wide > feedWidth, `${label} feed: wide ${wide}`);
    expectThat((await box(page, '.dashboard__main')).width >= 359, `${label} feed: main column squeezed`);
    expectThat(Object.values(await noOverflow(page)).every(Boolean), `${label} feed: overflow`);
    await page.screenshot({ path: join(outDir, `${size.width}-${scheme}-feed-wide.png`) });
    await page.evaluate(() => localStorage.removeItem('wt-panel-sizes'));

    // Persistence: size survives a reload and stays per workspace.
    await page.reload();
    await page.waitForSelector('#waiting .island__body');
    await page.waitForTimeout(400);
    const before = (await box(page, '#your-move')).height;
    await drag(page, handle('your-move'), 'y', size.height);
    const sized = (await box(page, '#your-move')).height;
    expectThat(sized > before, `${label} persistence: drag did not grow`);
    await page.reload();
    await page.waitForSelector('#your-move .island__body');
    await page.waitForTimeout(500);
    expectThat(Math.abs((await box(page, '#your-move')).height - sized) <= 1, `${label} persistence: size lost on reload`);
    await page.click('.rail__item[aria-label="Atlas"]');
    await page.waitForTimeout(800);
    const other = (await box(page, '#your-move')).height;
    expectThat(Math.abs(other - sized) > 1 || (await page.evaluate(() => !document.getElementById('your-move').classList.contains('island--sized'))), `${label} persistence: size leaked into another workspace`);
    await page.click('.rail__item[aria-label="Northwind"]');
    await page.waitForTimeout(800);
    expectThat(Math.abs((await box(page, '#your-move')).height - sized) <= 1, `${label} persistence: size lost after workspace switch`);

    // Folding keeps working on a sized panel.
    await page.evaluate(() => {
      document.querySelector('.dashboard__main').scrollTop = 0;
      document.getElementById('wt').scrollTop = 0;
    });
    await page.mouse.move(700, 10);
    await page.click('#your-move .island__head .chevron');
    expectThat(await page.evaluate(() => document.getElementById('your-move').classList.contains('island--collapsed')), `${label} fold: panel did not fold`);
    await page.evaluate(() => {
      document.querySelector('.dashboard__main').scrollTop = 0;
      document.getElementById('wt').scrollTop = 0;
    });
    await page.click('#your-move .island__head .chevron');

    // Recently done: open it and drag its list.
    const recent = await page.$('.recently-done');
    if (recent) {
      if (!(await page.evaluate(() => document.querySelector('.recently-done').open))) {
        await page.click('.recently-done__summary');
      }
      await page.waitForTimeout(200);
      await drag(page, handle('your-move'), 'y', size.height);
      const initial = (await box(page, '.recently-done__list')).height;
      await drag(page, '.recently-done > .resize-handle', 'y', 0);
      const tall = (await box(page, '.recently-done__list')).height;
      await drag(page, '.recently-done > .resize-handle', 'y', size.height);
      const short = (await box(page, '.recently-done__list')).height;
      expectThat(tall > initial + 10 && short < tall && short > 20, `${label} recently done: initial ${initial}, tall ${tall}, short ${short}`);
      expectThat(Object.values(await noOverflow(page)).every(Boolean), `${label} recently done: overflow`);
      await page.screenshot({ path: join(outDir, `${size.width}-${scheme}-recently-done.png`) });
    }
    await context.close();
  }
}
await browser.close();
console.log(failures.length ? `${failures.length} failure(s)` : 'panel matrix passed');
process.exit(failures.length ? 1 : 0);
