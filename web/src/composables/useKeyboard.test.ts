import { expect, test } from 'vitest';
import { wrapTarget } from './useKeyboard.ts';

const items = ['first', 'middle', 'last'].map((name) => {
  const element = document.createElement('button');
  element.textContent = name;
  return element;
});

test('Tab on the last control wraps to the first, Shift+Tab on the first to the last', () => {
  expect(wrapTarget(items, items[2], false)).toBe(items[0]);
  expect(wrapTarget(items, items[0], true)).toBe(items[2]);
});

test('Tab inside the dialog is left to the browser; focus outside it comes in at the ends', () => {
  expect(wrapTarget(items, items[1], false)).toBeNull();
  expect(wrapTarget(items, document.body, false)).toBe(items[0]);
  expect(wrapTarget(items, document.body, true)).toBe(items[2]);
  expect(wrapTarget([], document.body, false)).toBeNull();
});
