import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { h, ref } from 'vue';
import { fireEvent, render, screen } from '@testing-library/vue';
import Island from './Island.vue';
import RowScroll from './RowScroll.vue';

test('the fold toggle is a native button, so Space and Enter fold the panel like a click', async () => {
  const { container } = render(Island, { props: { id: 'panel', title: 'Panel' } });
  const toggle = screen.getByRole('button', { name: 'Fold Panel' });

  expect(toggle.tagName).toBe('BUTTON');
  expect(toggle.getAttribute('type')).toBe('button');
  await fireEvent.click(toggle);

  expect(container.querySelector('.island--collapsed')).not.toBeNull();
});

test('the fold hint of a folded width strip is anchored to the arrow and opens to its left', async () => {
  render(Island, { props: { id: 'strip-panel', title: 'Strip', resize: 'width' } });
  const arrow = screen.getByRole('button', { name: 'Fold Strip' });

  expect(arrow.getAttribute('data-tippy-placement')).toBeNull();
  await fireEvent.click(arrow);

  expect(arrow.closest('.island--strip')).not.toBeNull();
  expect(arrow.getAttribute('data-tip')).toBe('Open this panel');
  expect(arrow.getAttribute('aria-label')).toBe('Open Strip');
  expect(arrow.getAttribute('data-tippy-placement')).toBe('left');
});

describe('a remembered height', () => {
  const rowCount = ref(0);
  const Rows = () =>
    h(RowScroll, () =>
      h('table', [h('tbody', Array.from({ length: rowCount.value }, () => h('tr', [h('td', 'row')])))]),
    );

  beforeEach(() => {
    localStorage.setItem('wt-panel-sizes', JSON.stringify({ move: 400 }));
    rowCount.value = 0;
  });
  afterEach(() => localStorage.clear());

  test('applies only while the panel has rows and comes back when they appear', async () => {
    const { container } = render(Island, {
      props: { id: 'move-panel', title: 'Panel', sizeKey: 'move' },
      slots: { default: Rows },
    });
    const panel = container.querySelector('.island') as HTMLElement;

    await vi.waitFor(() => expect(panel.classList.contains('island--sized')).toBe(false));
    expect(panel.style.getPropertyValue('--island-height')).toBe('0px');

    rowCount.value = 2;
    await vi.waitFor(() => expect(panel.classList.contains('island--sized')).toBe(true));
    expect(panel.style.getPropertyValue('--island-height')).toBe('400px');
    expect(JSON.parse(localStorage.getItem('wt-panel-sizes') ?? '{}')).toEqual({ move: 400 });
  });
});

test('the floor is measured from the first row when every row has its own tbody', async () => {
  const { container } = render(Island, {
    props: { id: 'split-panel', title: 'Panel' },
    slots: {
      default: () =>
        h(RowScroll, () =>
          h(
            'table',
            [1, 2].map(() => h('tbody', [h('tr', [h('td', 'row')]), h('tr', [h('td', 'tail')])])),
          ),
        ),
    },
  });
  const panel = container.querySelector('.island') as HTMLElement;

  await vi.waitFor(() => expect(panel.style.getPropertyValue('--island-floor')).toMatch(/px$/));
  expect(container.querySelectorAll('tbody > tr')).toHaveLength(4);
});

describe('an empty island with a table of its own below the row scroller', () => {
  const HEAD = 48;
  const FOLD = 30;
  const spies: Array<() => void> = [];

  afterEach(() => spies.splice(0).forEach((restore) => restore()));

  const fakeLayout = (panel: HTMLElement) => {
    const floor = () => parseFloat(panel.style.getPropertyValue('--island-floor')) || 0;
    const stretched = () => Math.max(80, floor() - HEAD - FOLD);
    const rect = vi
      .spyOn(Element.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: Element) {
        const bottom = this.closest('.recently') ? HEAD + stretched() + FOLD : HEAD + 40;
        return { top: this.classList.contains('island') ? 0 : HEAD, bottom } as DOMRect;
      });
    const height = vi
      .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return this.classList.contains('recently') ? FOLD : 40;
      });
    const top = vi
      .spyOn(HTMLElement.prototype, 'offsetTop', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return this.classList.contains('island__body') ? HEAD : 0;
      });
    spies.push(() => [rect, height, top].forEach((spy) => spy.mockRestore()));
  };

  test('measures only its own rows, so the floor stays put across measures', async () => {
    const { container } = render(Island, {
      props: { id: 'empty-panel', title: 'Panel' },
      slots: {
        default: () => [
          h(RowScroll, { floor: true }, () => h('table', [h('thead', [h('tr', [h('th', 'Ticket')])])])),
          h('div', { class: 'recently' }, [
            h('table', [h('tbody', [h('tr', [h('td', 'done')])])]),
          ]),
        ],
      },
    });
    const panel = container.querySelector('.island') as HTMLElement;
    fakeLayout(panel);
    const readings: string[] = [];

    for (let round = 0; round < 6; round += 1) {
      panel.querySelector('.recently')?.append(document.createElement('span'));
      await new Promise((resolve) => setTimeout(resolve, 40));
      readings.push(panel.style.getPropertyValue('--island-floor'));
    }

    expect(new Set(readings.slice(-3)).size).toBe(1);
    expect(parseFloat(readings.at(-1) ?? '')).toBeLessThan(300);
  });
});

describe('a panel folded when the page loads', () => {
  beforeEach(() => localStorage.setItem('wt-collapsed', JSON.stringify(['late'])));
  afterEach(() => localStorage.clear());

  test('mounts no body while folded and shows its rows once it is unfolded', async () => {
    const { container } = render(Island, {
      props: { id: 'late', title: 'Late' },
      slots: { default: () => h('p', 'the rows') },
    });

    expect(container.querySelector('.island__body')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Open Late' }));

    expect(container.querySelector('.island__body')?.textContent).toBe('the rows');
  });
});
