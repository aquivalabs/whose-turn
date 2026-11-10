import { afterEach, expect, test, vi } from 'vitest';

const loadWith = async (search: string) => {
  window.history.replaceState(null, '', `/${search}`);
  vi.resetModules();
  return import('./scheme.ts');
};

afterEach(() => {
  window.history.replaceState(null, '', '/');
  document.head.querySelectorAll('style').forEach((node) => node.remove());
});

test('?scheme=dark and ?scheme=light pin the scheme whatever the system prefers', async () => {
  expect((await loadWith('?scheme=dark')).isDark()).toBe(true);
  expect((await loadWith('?scheme=light')).isDark()).toBe(false);
});

test('pinning switches the colour-scheme rules of the stylesheets on and off', async () => {
  const style = document.createElement('style');
  style.textContent = '@media (prefers-color-scheme: dark) { a { color: red } } @media (prefers-color-scheme: light) { a { color: blue } }';
  document.head.append(style);
  (await loadWith('?scheme=dark')).pinStylesheets();
  const media = [...(style.sheet?.cssRules ?? [])].map((rule) => (rule as CSSMediaRule).media.mediaText);
  expect(media).toEqual(['all', 'not all']);
});

test('without the parameter the stylesheets are left alone', async () => {
  const style = document.createElement('style');
  style.textContent = '@media (prefers-color-scheme: dark) { a { color: red } }';
  document.head.append(style);
  (await loadWith('')).pinStylesheets();
  expect((style.sheet?.cssRules[0] as CSSMediaRule).media.mediaText).toContain('prefers-color-scheme');
});
