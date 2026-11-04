import { afterEach, expect, test, vi } from 'vitest';
import { h } from 'vue';
import { fireEvent, render, screen } from '@testing-library/vue';
import RowScroll from './RowScroll.vue';

const rect = (top: number, bottom: number) => () => ({ top, bottom }) as DOMRect;
const twoLine = (bottom: number) =>
  h('tbody', { 'data-bottom': bottom }, [h('tr', [h('td', 'row')]), h('tr', [h('td', 'tail')])]);

afterEach(() => vi.restoreAllMocks());

test('counts one hidden row per tbody, however many lines the row has', async () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const bottom = Number(this.dataset.bottom ?? 0);
    return rect(0, this.classList.contains('row-scroll') ? 100 : bottom)();
  });
  const { container } = render(RowScroll, {
    slots: { default: () => h('table', [twoLine(60), twoLine(160), twoLine(260)]) },
  });
  const scroller = container.querySelector('.row-scroll') as HTMLElement;
  Object.defineProperty(scroller, 'clientHeight', { value: 100 });
  scroller.scrollTop = 1;
  await fireEvent.scroll(scroller);

  expect(await screen.findByRole('button', { name: '+2 more' })).toBeTruthy();
});

test('the scroll padding follows the height of the sticky header', async () => {
  const { container } = render(RowScroll, {
    slots: { default: () => h('table', [h('thead', [h('tr', [h('th', 'Ticket')])])]) },
  });

  expect((container.querySelector('.row-scroll') as HTMLElement).style.scrollPaddingTop).toBe('0px');
});
