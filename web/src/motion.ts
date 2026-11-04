// The window's motion tokens and presets (docs/adr/0009-motion-in-the-window.md). The durations and easing mirror the --motion-* variables in styles/tokens.css; reduced motion turns every duration to zero.
import { computed, nextTick } from 'vue';
import { usePreferredReducedMotion } from '@vueuse/core';
import { animate } from 'motion-v';

const DURATION = { fast: 0.32, base: 0.48, slow: 0.64 } as const;
const EASE: [number, number, number, number] = [0.33, 1, 0.68, 1];
const SPRING = { type: 'spring', stiffness: 170, damping: 26, mass: 1 } as const;

const preference = usePreferredReducedMotion();
/** True while the system asks for reduced motion: every change is instant. */
export const reduced = computed(() => preference.value === 'reduce');

const tween = (seconds: number) =>
  reduced.value ? { duration: 0 } : { duration: seconds, ease: EASE };

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
const slide = preset({ opacity: 0, x: -10 }, DURATION.base);

/** A row of a short list: slides and fades in and out, and glides to its new place when the rows around it come, go or reorder. */
export const listed = computed(() => ({
  ...slide.value,
  layout: 'position' as const,
  transition: reduced.value
    ? slide.value.transition
    : { default: slide.value.transition, layout: { ...SPRING } },
}));

type GlideProperty = 'height' | 'gridTemplateColumns';

const current = (element: HTMLElement, property: GlideProperty) =>
  property === 'height' ? element.offsetHeight + 'px' : getComputedStyle(element).gridTemplateColumns;

/**
 * Runs `change`, then tweens `property` of `element` from the value it had to the value it has now and hands the property back to the stylesheet.
 */
export const glideThrough = async (
  element: HTMLElement | null | undefined,
  property: GlideProperty,
  change: () => void,
) => {
  const from = element ? current(element, property) : '';
  change();
  if (!element) {
    return;
  }
  await nextTick();
  const to = current(element, property);
  if (reduced.value || from === to) {
    return;
  }
  // offsetHeight counts padding and border, so the tweened height must too; a content-box element would be set that much too tall.
  const hold = property === 'height' ? { flex: 'none', minHeight: '0', maxHeight: 'none', boxSizing: 'border-box' } : {};
  Object.assign(element.style, hold);
  // The old value goes back on at once: until the tween's first frame the stylesheet's new value would show.
  element.style[property] = from;
  try {
    await animate(element, { [property]: [from, to] }, tween(DURATION.base));
  } finally {
    element.style[property] = '';
    for (const key of Object.keys(hold)) {
      element.style.removeProperty(key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase()));
    }
  }
};
