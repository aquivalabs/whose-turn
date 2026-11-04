import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installTooltips } from './tooltips.ts';

const makeInstance = (reference: Element) => ({ reference, hide: vi.fn(), destroy: vi.fn() });

describe('installTooltips', () => {
  let options: Record<string, (...args: never[]) => unknown>;
  let teardown: () => void;
  let control: HTMLElement;

  beforeEach(() => {
    window.tippy = {
      delegate: vi.fn((_root, given) => {
        options = given as unknown as typeof options;
      }),
    };
    teardown = installTooltips();
    control = document.createElement('button');
    control.dataset.tip = 'Hint';
    document.body.append(control);
  });

  afterEach(() => {
    teardown();
    control.remove();
    delete window.tippy;
  });

  it('hides a shown tooltip on pointerdown', () => {
    // Setup
    const instance = makeInstance(control);
    options.onShow(instance as never);
    // Exercise
    control.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    // Verify
    expect(instance.hide).toHaveBeenCalled();
  });

  it('refuses to show while the pointer is down', () => {
    document.dispatchEvent(new Event('pointerdown'));
    expect(options.onShow(makeInstance(control) as never)).toBe(false);
    document.dispatchEvent(new Event('pointerup'));
    expect(options.onShow(makeInstance(control) as never)).toBeUndefined();
  });

  it('hides on drag start and on scroll', () => {
    const instance = makeInstance(control);
    options.onShow(instance as never);
    document.dispatchEvent(new Event('dragstart'));
    document.dispatchEvent(new Event('scroll'));
    expect(instance.hide).toHaveBeenCalledTimes(2);
  });

  it('destroys the tooltip when its control unmounts', async () => {
    // Setup
    const instance = makeInstance(control);
    options.onShow(instance as never);
    // Exercise
    control.remove();
    await new Promise((resolve) => setTimeout(resolve));
    // Verify
    expect(instance.destroy).toHaveBeenCalled();
  });
});
