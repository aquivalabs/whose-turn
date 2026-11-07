import { expect, it } from 'vitest';
import { describeClient } from './client-report.ts';

const env = {
  navigator: { userAgent: 'Mozilla/5.0 Firefox/131.0', language: 'de-DE' },
  screen: { width: 1512, height: 982 },
  devicePixelRatio: 2,
  innerWidth: 1200,
  innerHeight: 800,
  dark: false,
  mode: 'tab' as const,
};

it('describes the browser, display, locale and the time zone from the inputs', () => {
  expect(describeClient(env)).toEqual({
    browser: { name: 'Firefox', version: '131' },
    display: { width: 1512, height: 982, scale: 2, viewport: [1200, 800] },
    locale: 'de-DE',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    theme: 'light',
    mode: 'tab',
  });
});

it('reports the theme from the dark flag', () => {
  expect(describeClient({ ...env, dark: true }).theme).toBe('dark');
  expect(describeClient({ ...env, dark: false }).theme).toBe('light');
});

it('reports the window mode as given', () => {
  expect(describeClient({ ...env, mode: 'app' }).mode).toBe('app');
  expect(describeClient({ ...env, mode: 'tab' }).mode).toBe('tab');
});
