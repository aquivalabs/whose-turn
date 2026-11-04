import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TippyDelegateOptions } from '../env.d.ts';
import { installTooltips } from './tooltips.ts';

type Hooks = Required<Pick<TippyDelegateOptions, 'onShow' | 'onHide'>>;
const hooksOf = ({ onShow, onHide }: TippyDelegateOptions): Hooks => {
  if (!onShow || !onHide) {
    throw new Error('installTooltips registered no onShow or onHide');
  }
  return { onShow, onHide };
};

const makeInstance = (reference: Element, isVisible = false) => {
  const instance = { reference, state: { isVisible }, show: vi.fn(), hide: vi.fn(), destroy: vi.fn() };
  (reference as { _tippy?: unknown })._tippy = instance;
  return instance;
};

describe('installTooltips', () => {
  let options: Hooks;
  let teardown: () => void;
  let control: HTMLElement;

  beforeEach(() => {
    window.tippy = {
      delegate: vi.fn((_root: Element, given: TippyDelegateOptions) => {
        options = hooksOf(given);
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
    options.onShow(instance);
    // Exercise
    control.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    // Verify
    expect(instance.hide).toHaveBeenCalled();
  });

  it('refuses to show while the pointer is down', () => {
    document.dispatchEvent(new Event('pointerdown'));
    expect(options.onShow(makeInstance(control))).toBe(false);
    document.dispatchEvent(new Event('pointerup'));
    expect(options.onShow(makeInstance(control))).toBeUndefined();
  });

  it('hides on drag start and on scroll', () => {
    const instance = makeInstance(control);
    options.onShow(instance);
    document.dispatchEvent(new Event('dragstart'));
    document.dispatchEvent(new Event('scroll'));
    expect(instance.hide).toHaveBeenCalledTimes(2);
  });

  it('destroys the tooltip when its control unmounts', async () => {
    // Setup
    const instance = makeInstance(control);
    options.onShow(instance);
    // Exercise
    control.remove();
    await new Promise((resolve) => setTimeout(resolve));
    // Verify
    expect(instance.destroy).toHaveBeenCalled();
  });

  it('does not show a hint for focus that only came back to the control after a dialog closed', () => {
    const instance = makeInstance(control);
    control.focus();
    vi.spyOn(control, 'matches').mockImplementation(() => false);

    expect(options.onShow(instance as never)).toBe(false);
  });

  it('shows a hint for keyboard focus', () => {
    const instance = makeInstance(control);
    control.focus();
    vi.spyOn(control, 'matches').mockImplementation((selector: string) => selector === ':focus-visible');

    expect(options.onShow(instance as never)).toBeUndefined();
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
      options.onShow(instance);
      const click = () => {
        help.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        help.dispatchEvent(new Event('click', { bubbles: true }));
      };
      click();
      expect(options.onHide(instance)).toBe(false);
      click();
      expect(instance.hide).toHaveBeenCalledTimes(1);
      expect(options.onHide(instance)).toBeUndefined();
    });

    it('is allowed to show while its own pointer is down', () => {
      help.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      expect(options.onShow(makeInstance(help))).toBeUndefined();
    });

    it('closes on a click elsewhere and on Escape', () => {
      const instance = makeInstance(help, true);
      options.onShow(instance);
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
