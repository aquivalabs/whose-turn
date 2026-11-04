// Globals the window's pages carry besides the modules: the vendored Tippy script and the backdrop's console hook.
import type { BackdropApi } from './backdrop.ts';

export interface TippyInstance {
  reference: Element;
  hide: () => void;
  destroy: () => void;
}

interface TippyDelegateOptions {
  target: string;
  content: (element: HTMLElement) => string;
  onShow?: (instance: TippyInstance) => boolean | undefined;
  onHidden?: (instance: TippyInstance) => void;
  onDestroy?: (instance: TippyInstance) => void;
  [option: string]: unknown;
}

declare global {
  interface Window {
    tippy?: { delegate: (root: Element, options: TippyDelegateOptions) => unknown };
    whoseTurnBackdrop: BackdropApi;
  }
}
