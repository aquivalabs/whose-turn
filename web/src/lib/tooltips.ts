// Tooltips: instant on hover, also on click or keyboard focus; one delegate covers rows drawn later. Tippy and Popper are the vendored scripts the page loads first.
export const installTooltips = () => {
  if (!window.tippy) {
    return;
  }
  window.tippy.delegate(document.body, {
    target: '[data-tip]',
    content: (element: HTMLElement) => element.dataset.tip || '',
    trigger: 'mouseenter focus click',
    delay: [0, 80],
    duration: [120, 80],
    interactive: true,
    maxWidth: 440,
    placement: 'top',
    theme: 'wt',
    appendTo: () => document.body,
  });
};
