// Tooltips: instant on hover or keyboard focus; one delegate covers rows drawn later. Tippy and Popper are the vendored scripts the page loads first.
// Every shown tooltip is tracked and dismissed on pointerdown, drag, scroll, resize, Escape, and when its control leaves the page or the layout.
// Explanation controls ([data-tip-click]: the "?" icons and "why") also toggle on click, which is what opens them on touch.
import type { TippyInstance } from '../env.d.ts';

const EXPLAIN = '[data-tip-click]';
const explainControl = (target: EventTarget | null): Element | null => (target instanceof Element ? target.closest(EXPLAIN) : null);

const isLaidOut = (element: Element): boolean => element.isConnected && element.getClientRects().length > 0;

export const installTooltips = (): (() => void) => {
  if (!window.tippy) {
    return () => {};
  }
  const shown = new Set<TippyInstance>();
  let pointerIsDown = false;
  const pinned = new Set<TippyInstance>();

  const dismiss = (instance: TippyInstance) => {
    pinned.delete(instance);
    instance.hide();
  };
  const hideExcept = (except: Element | null) =>
    shown.forEach((instance) => {
      if (instance.reference !== except) {
        dismiss(instance);
      }
    });
  const hideAll = () => hideExcept(null);
  const sweep = () => {
    shown.forEach((instance) => {
      if (!instance.reference.isConnected) {
        shown.delete(instance);
        instance.destroy();
      } else if (!isLaidOut(instance.reference)) {
        dismiss(instance);
      }
    });
  };
  const onPointerDown = (event: Event) => {
    const control = explainControl(event.target);
    pointerIsDown = !control;
    hideExcept(control);
  };
  const onClick = (event: Event) => {
    const control = explainControl(event.target);
    const instance = control?._tippy;
    if (!instance) {
      return;
    }
    if (pinned.has(instance)) {
      dismiss(instance);
    } else {
      pinned.add(instance);
      instance.show();
    }
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      hideAll();
    }
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
    hideOnClick: false,
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
    onHide: (instance: TippyInstance) => (pinned.has(instance) ? false : undefined),
    onHidden: (instance: TippyInstance) => shown.delete(instance),
    onDestroy: (instance: TippyInstance) => {
      shown.delete(instance);
      pinned.delete(instance);
    },
  });

  const observer = new MutationObserver(sweep);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
  const resizeObserver = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(hideAll);
  resizeObserver?.observe(document.body);

  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('pointerup', onPointerUp, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('pointercancel', onPointerUp, true);
  document.addEventListener('dragstart', hideAll, true);
  document.addEventListener('scroll', hideAll, true);
  window.addEventListener('resize', hideAll);

  return () => {
    observer.disconnect();
    resizeObserver?.disconnect();
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('pointerup', onPointerUp, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('pointercancel', onPointerUp, true);
    document.removeEventListener('dragstart', hideAll, true);
    document.removeEventListener('scroll', hideAll, true);
    window.removeEventListener('resize', hideAll);
  };
};
