// Tooltips: instant on hover or keyboard focus; one delegate covers rows drawn later. Tippy and Popper are the vendored scripts the page loads first.
// Every shown tooltip is tracked and dismissed on pointerdown, drag, scroll, resize, and when its control leaves the page or the layout.
import type { TippyInstance } from '../env.d.ts';

const isLaidOut = (element: Element): boolean => element.isConnected && element.getClientRects().length > 0;

export const installTooltips = (): (() => void) => {
  if (!window.tippy) {
    return () => {};
  }
  const shown = new Set<TippyInstance>();
  let pointerIsDown = false;

  const hideAll = () => shown.forEach((instance) => instance.hide());
  const sweep = () => {
    shown.forEach((instance) => {
      if (!instance.reference.isConnected) {
        shown.delete(instance);
        instance.destroy();
      } else if (!isLaidOut(instance.reference)) {
        instance.hide();
      }
    });
  };
  const onPointerDown = () => {
    pointerIsDown = true;
    hideAll();
  };
  const onPointerUp = () => {
    pointerIsDown = false;
  };

  window.tippy.delegate(document.body, {
    target: '[data-tip]',
    content: (element: HTMLElement) => element.dataset.tip || '',
    trigger: 'mouseenter focus',
    delay: [0, 80],
    duration: [120, 80],
    interactive: true,
    maxWidth: 440,
    placement: 'top',
    theme: 'wt',
    appendTo: () => document.body,
    onShow: (instance: TippyInstance) => {
      if (pointerIsDown) {
        return false;
      }
      shown.add(instance);
      return undefined;
    },
    onHidden: (instance: TippyInstance) => shown.delete(instance),
    onDestroy: (instance: TippyInstance) => shown.delete(instance),
  });

  const observer = new MutationObserver(sweep);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
  const resizeObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(hideAll);
  resizeObserver?.observe(document.body);

  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('pointerup', onPointerUp, true);
  document.addEventListener('pointercancel', onPointerUp, true);
  document.addEventListener('dragstart', hideAll, true);
  document.addEventListener('scroll', hideAll, true);
  window.addEventListener('resize', hideAll);

  return () => {
    observer.disconnect();
    resizeObserver?.disconnect();
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('pointerup', onPointerUp, true);
    document.removeEventListener('pointercancel', onPointerUp, true);
    document.removeEventListener('dragstart', hideAll, true);
    document.removeEventListener('scroll', hideAll, true);
    window.removeEventListener('resize', hideAll);
  };
};
