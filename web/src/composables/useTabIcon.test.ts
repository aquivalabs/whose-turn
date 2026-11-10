import { afterEach, expect, test } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { useTabIcon } from './useTabIcon.ts';

afterEach(() => {
  document.head.querySelectorAll('link').forEach((node) => node.remove());
});

test('the tab icon is an SVG link that follows the URL, and an empty URL leaves it alone (RMA-450)', async () => {
  const href = ref<string | null>(null);
  const scope = effectScope();
  scope.run(() => useTabIcon(href));
  expect(document.head.querySelector('link[rel~="icon"]')).toBeNull();

  href.value = 'data:image/svg+xml,%3Csvg%3E%3C%2Fsvg%3E';
  await nextTick();
  const link = document.head.querySelector<HTMLLinkElement>('link[rel~="icon"]');
  expect(link?.type).toBe('image/svg+xml');
  expect(link?.getAttribute('href')).toBe(href.value);

  href.value = null;
  await nextTick();
  expect(link?.getAttribute('href')).toBe('data:image/svg+xml,%3Csvg%3E%3C%2Fsvg%3E');
  scope.stop();
});
