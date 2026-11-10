import { afterEach, expect, test, vi } from 'vitest';
import { nextTick } from 'vue';

const loadWith = async (search: string) => {
  window.history.replaceState(null, '', `/${search}`);
  vi.resetModules();
  return import('./scheme.ts');
};

const sheetWith = (css: string) => {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);
  return () => [...(style.sheet?.cssRules ?? [])].map((rule) => (rule as CSSMediaRule).media.mediaText);
};

const BOTH = '@media (prefers-color-scheme: dark) { a { color: red } } @media (prefers-color-scheme: light) { a { color: blue } }';

afterEach(() => {
  window.history.replaceState(null, '', '/');
  localStorage.clear();
  document.head.querySelectorAll('style').forEach((node) => node.remove());
});

test('?scheme=dark and ?scheme=light pin the scheme and win over the stored choice', async () => {
  localStorage.setItem('wt-scheme', 'light');
  const dark = await loadWith('?scheme=dark');
  expect(dark.isDark()).toBe(true);
  expect(dark.pinnedByAddress).toBe(true);
  expect((await loadWith('?scheme=light')).isDark()).toBe(false);
});

test('the switch moves System, Light, Dark and back to System, and keeps the choice in the browser', async () => {
  const scheme = await loadWith('');
  expect(scheme.schemeChoice.value).toBe('system');
  scheme.cycleScheme();
  expect([scheme.schemeChoice.value, scheme.isDark()]).toEqual(['light', false]);
  scheme.cycleScheme();
  expect([scheme.schemeChoice.value, scheme.isDark()]).toEqual(['dark', true]);
  await nextTick();
  expect(localStorage.getItem('wt-scheme')).toBe('dark');
  scheme.cycleScheme();
  expect(scheme.schemeChoice.value).toBe('system');
});

test('pinning turns the colour-scheme rules on and off, and System gives them back to the system', async () => {
  const media = sheetWith(BOTH);
  const scheme = await loadWith('');
  scheme.cycleScheme();
  scheme.cycleScheme();
  scheme.pinStylesheets();
  expect(media()).toEqual(['all', 'not all']);
  scheme.cycleScheme();
  scheme.pinStylesheets();
  expect(media()[0]).toContain('prefers-color-scheme: dark');
  expect(media()[1]).toContain('prefers-color-scheme: light');
});

test('a stylesheet added after install is pinned to the choice too (RMA-457)', async () => {
  localStorage.setItem('wt-scheme', 'dark');
  const scheme = await loadWith('');
  scheme.installScheme();
  const media = sheetWith(BOTH);
  await vi.waitFor(() => expect(media()).toEqual(['all', 'not all']));
});

test('a stored value that is not a choice reads as System', async () => {
  localStorage.setItem('wt-scheme', 'sepia');
  expect((await loadWith('')).schemeChoice.value).toBe('system');
});
