// Globals the window's pages carry besides the modules: the vendored Tippy script and the backdrop's console hook.
import type { BackdropApi } from './backdrop.ts';

interface TippyDelegateOptions {
  target: string;
  content: (element: HTMLElement) => string;
  [option: string]: unknown;
}

declare global {
  interface Window {
    tippy?: { delegate: (root: Element, options: TippyDelegateOptions) => unknown };
    whoseTurnBackdrop: BackdropApi;
  }
}
