import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { effectScope, ref, type EffectScope } from 'vue';
import { useShortcuts, wrapTarget } from './useKeyboard.ts';

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

describe('useShortcuts', () => {
  const covered = ref(false);
  const search = document.createElement('input');
  search.className = 'feed__search-input';
  const outside = document.createElement('div');
  const typing = document.createElement('textarea');
  let scope: EffectScope;

  const press = (target: HTMLElement, key: string, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
  };

  beforeEach(() => {
    covered.value = false;
    document.body.append(search, outside, typing);
    scope = effectScope();
    scope.run(() => useShortcuts(covered));
  });

  afterEach(() => {
    scope.stop();
    search.remove();
    outside.remove();
    typing.remove();
  });

  test('the slash key focuses the feed search and is consumed', () => {
    const event = press(outside, '/');

    expect(document.activeElement).toBe(search);
    expect(event.defaultPrevented).toBe(true);
  });

  test('an open dialog keeps the keyboard', () => {
    covered.value = true;

    const event = press(outside, '/');

    expect(document.activeElement).not.toBe(search);
    expect(event.defaultPrevented).toBe(false);
  });

  test.each(['metaKey', 'ctrlKey', 'altKey'])(
    '%s held leaves the key to the browser',
    (modifier) => {
      const event = press(outside, '/', { [modifier]: true });

      expect(document.activeElement).not.toBe(search);
      expect(event.defaultPrevented).toBe(false);
    },
  );

  test('a key typed in a field stays in the field', () => {
    typing.focus();

    const event = press(typing, '/');

    expect(document.activeElement).toBe(typing);
    expect(event.defaultPrevented).toBe(false);
  });

  test('nothing is consumed when the target field is not on the page', () => {
    const event = press(outside, 't');

    expect(event.defaultPrevented).toBe(false);
  });
});
