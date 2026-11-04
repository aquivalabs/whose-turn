import { describe, expect, it, vi } from 'vitest';

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
    expect(motion.baseTransition.value).toEqual({ duration: 0.2, ease: motion.EASE });
    expect(motion.fade.value.transition).toEqual(motion.baseTransition.value);
    expect(motion.rise.value.exit).toEqual({ opacity: 0, y: 12 });
  });

  it('make every change instant while the system asks for reduced motion', async () => {
    const motion = await load(true);
    expect(motion.reduced.value).toBe(true);
    for (const transition of [
      motion.baseTransition.value,
      motion.fade.value.transition,
      motion.rise.value.transition,
      motion.slide.value.transition,
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
});
