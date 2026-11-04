// The window's motion tokens and presets (docs/adr/0009-motion-in-the-window.md). The durations and easing mirror the --motion-* variables in styles/tokens.css; reduced motion turns every duration to zero.
import { computed, nextTick } from 'vue';
import { usePreferredReducedMotion } from '@vueuse/core';
import { animate } from 'motion-v';

export const DURATION = { fast: 0.22, base: 0.32, slow: 0.42 } as const;
export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
export const SPRING = { type: 'spring', stiffness: 280, damping: 34, mass: 1 } as const;

const preference = usePreferredReducedMotion();
/** True while the system asks for reduced motion: every change is instant. */
export const reduced = computed(() => preference.value === 'reduce');

const tween = (seconds: number) =>
  reduced.value ? { duration: 0 } : { duration: seconds, ease: EASE };

export const baseTransition = computed(() => tween(DURATION.base));

const preset = (from: Record<string, number>, seconds: number) =>
  computed(() => ({
    initial: from,
    animate: Object.fromEntries(Object.keys(from).map((key) => [key, key === 'opacity' ? 1 : 0])),
    exit: from,
    transition: tween(seconds),
  }));

/** Appears and disappears by opacity alone: chips, banners, notices, dots. */
export const fade = preset({ opacity: 0 }, DURATION.base);
/** Fades and rises: a dialog card. */
export const rise = preset({ opacity: 0, y: 12 }, DURATION.slow);
/** Fades and slides in from the left: a table row or a list item. */
export const slide = preset({ opacity: 0, x: -10 }, DURATION.base);

/** A row of a list: slides and fades in and out, and glides to its new place when the rows around it come, go or reorder. */
export const listed = computed(() => ({
  initial: slide.value.initial,
  animate: slide.value.animate,
  exit: slide.value.exit,
  layout: 'position' as const,
  transition: reduced.value
    ? { duration: 0 }
    : { default: tween(DURATION.base), layout: { ...SPRING } },
}));

/**
 * Tweens `property` of `element` from the value it had to the value it has now, then hands the property back to the stylesheet. Call it after the change that moved the element; `from` was read before.
 */
export const glide = async (element: HTMLElement, property: 'height' | 'gridTemplateColumns', from: string) => {
  const to = property === 'height' ? element.offsetHeight + 'px' : getComputedStyle(element).gridTemplateColumns;
  if (reduced.value || from === to) {
    return;
  }
  const hold = property === 'height' ? { flex: 'none', minHeight: '0', maxHeight: 'none' } : {};
  Object.assign(element.style, hold);
  try {
    await animate(element, { [property]: [from, to] }, baseTransition.value);
  } finally {
    element.style[property] = '';
    for (const key of Object.keys(hold)) {
      element.style.removeProperty(key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase()));
    }
  }
};

const current = (element: HTMLElement, property: 'height' | 'gridTemplateColumns') =>
  property === 'height' ? element.offsetHeight + 'px' : getComputedStyle(element).gridTemplateColumns;

/** Runs `change`, then glides `property` of `element` from its old value to its new one. */
export const glideThrough = async (
  element: HTMLElement | null | undefined,
  property: 'height' | 'gridTemplateColumns',
  change: () => void,
) => {
  const from = element ? current(element, property) : '';
  change();
  if (element) {
    await nextTick();
    await glide(element, property, from);
  }
};
