import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installTooltips } from './tooltips.ts';

const makeInstance = (reference: Element, isVisible = false) => {
  const instance = { reference, state: { isVisible }, show: vi.fn(), hide: vi.fn(), destroy: vi.fn() };
  (reference as { _tippy?: unknown })._tippy = instance;
  return instance;
};

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

  describe('explanation controls', () => {
    let help: HTMLElement;

    beforeEach(() => {
      help = document.createElement('button');
      help.dataset.tip = 'Why';
      help.dataset.tipClick = '';
      document.body.append(help);
    });

    afterEach(() => help.remove());

    it('opens on click', () => {
      const instance = makeInstance(help);
      help.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      help.dispatchEvent(new Event('click', { bubbles: true }));
      expect(instance.show).toHaveBeenCalled();
    });

    it('keeps a hover-opened tooltip open on the first click and closes it on the second', () => {
      const instance = makeInstance(help, true);
      options.onShow(instance as never);
      const click = () => {
        help.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        help.dispatchEvent(new Event('click', { bubbles: true }));
      };
      click();
      expect(options.onHide(instance as never)).toBe(false);
      click();
      expect(instance.hide).toHaveBeenCalledTimes(1);
      expect(options.onHide(instance as never)).toBeUndefined();
    });

    it('is allowed to show while its own pointer is down', () => {
      help.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      expect(options.onShow(makeInstance(help) as never)).toBeUndefined();
    });

    it('closes on a click elsewhere and on Escape', () => {
      const instance = makeInstance(help, true);
      options.onShow(instance as never);
      control.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(instance.hide).toHaveBeenCalledTimes(2);
    });

    it('does not open a resize handle on click', () => {
      const instance = makeInstance(control);
      control.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      control.dispatchEvent(new Event('click', { bubbles: true }));
      expect(instance.show).not.toHaveBeenCalled();
    });
  });
});
