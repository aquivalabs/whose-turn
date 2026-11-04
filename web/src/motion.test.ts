import { describe, expect, it, vi } from 'vitest';

const animate = vi.hoisted(() => vi.fn());
vi.mock('motion-v', () => ({ animate }));

const asking = (reduce: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }));

const load = async (reduce: boolean) => {
  vi.resetModules();
  asking(reduce);
  return import('./motion.ts');
};

describe('motion tokens', () => {
  it('give every preset a real duration and the shared easing', async () => {
    const motion = await load(false);
    const ease = [0.33, 1, 0.68, 1];
    expect(motion.fade.value.transition).toEqual({ duration: 0.48, ease });
    expect(motion.rise.value.transition).toEqual({ duration: 0.64, ease });
    expect(motion.rise.value.exit).toEqual({ opacity: 0, y: 12 });
    expect((motion.listed.value.transition as { default: unknown }).default).toEqual({ duration: 0.48, ease });
    expect(motion.listed.value.initial).toEqual({ opacity: 0, x: -10 });
    expect(motion.listed.value.layout).toBe('position');
  });

  it('make every change instant while the system asks for reduced motion', async () => {
    const motion = await load(true);
    expect(motion.reduced.value).toBe(true);
    for (const transition of [
      motion.fade.value.transition,
      motion.rise.value.transition,
      motion.listed.value.transition,
    ]) {
      expect(transition).toEqual({ duration: 0 });
    }
  });

  it('glide nothing under reduced motion: the element is left to the stylesheet', async () => {
    const motion = await load(true);
    const element = document.createElement('section');
    let changed = 0;
    await motion.glideThrough(element, 'height', () => (changed += 1));
    expect(changed).toBe(1);
    expect(element.getAttribute('style')).toBeNull();
  });

  it('tweens a height as border-box, so padding and border are not added on top of the target', async () => {
    const motion = await load(false);
    const element = document.createElement('section');
    let held = '';
    let start = '';
    animate.mockImplementation(async () => {
      held = element.style.boxSizing;
      start = element.style.height;
    });
    let offset = 46;
    Object.defineProperty(element, 'offsetHeight', { configurable: true, get: () => offset });
    await motion.glideThrough(element, 'height', () => {
      offset = 122;
    });
    expect(animate).toHaveBeenCalledWith(element, { height: ['46px', '122px'] }, motion.fade.value.transition);
    expect(held).toBe('border-box');
    expect(start).toBe('46px');
    expect(element.style.cssText).toBe('');
  });
});
