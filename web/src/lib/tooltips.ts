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

  const observer = new MutationObserver(() => sweep());
  let watching = false;
  const syncObserver = () => {
    if (shown.size && !watching) {
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
    } else if (!shown.size && watching) {
      observer.disconnect();
    }
    watching = shown.size > 0;
  };
  const track = (instance: TippyInstance) => {
    shown.add(instance);
    syncObserver();
  };
  const untrack = (instance: TippyInstance) => {
    shown.delete(instance);
    syncObserver();
  };

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
        untrack(instance);
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
      track(instance);
      return undefined;
    },
    onHide: (instance: TippyInstance) => (pinned.has(instance) ? false : undefined),
    onHidden: untrack,
    onDestroy: (instance: TippyInstance) => {
      untrack(instance);
      pinned.delete(instance);
    },
  });

  const resizeObserver = new ResizeObserver(hideAll);
  resizeObserver.observe(document.body);

  const listeners: [Document | Window, string, EventListener, boolean][] = [
    [document, 'pointerdown', onPointerDown, true],
    [document, 'pointerup', onPointerUp, true],
    [document, 'click', onClick, true],
    [document, 'keydown', onKeyDown as EventListener, true],
    [document, 'pointercancel', onPointerUp, true],
    [document, 'dragstart', hideAll, true],
    [document, 'scroll', hideAll, true],
    [window, 'resize', hideAll, false],
  ];
  listeners.forEach(([target, type, handler, capture]) => target.addEventListener(type, handler, capture));

  return () => {
    observer.disconnect();
    resizeObserver.disconnect();
    listeners.forEach(([target, type, handler, capture]) => target.removeEventListener(type, handler, capture));
  };
};
