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

test('rows that are leaving do not count: a panel whose rows are all leaving has no rows and no remembered height', async () => {
  localStorage.setItem('wt-panel-sizes', JSON.stringify({ leaving: 400 }));
  const { container } = render(Island, {
    props: { id: 'leaving-panel', title: 'Panel', sizeKey: 'leaving' },
    slots: {
      default: () =>
        h(RowScroll, () =>
          h('table', [h('tbody', { 'data-leaving': '' }, [h('tr', [h('td', 'row')])])]),
        ),
    },
  });
  const panel = container.querySelector('.island') as HTMLElement;

  await vi.waitFor(() => expect(panel.classList.contains('island--sized')).toBe(false));
  localStorage.clear();
});

test('a row that starts leaving takes the remembered height away, and the floor is measured again', async () => {
  localStorage.setItem('wt-panel-sizes', JSON.stringify({ going: 400 }));
  const leaving = ref(false);
  const { container } = render(Island, {
    props: { id: 'going-panel', title: 'Panel', sizeKey: 'going' },
    slots: {
      default: () =>
        h(RowScroll, () =>
          h('table', [
            h('tbody', leaving.value ? { 'data-leaving': '' } : {}, [h('tr', [h('td', 'row')])]),
          ]),
        ),
    },
  });
  const panel = container.querySelector('.island') as HTMLElement;
  await vi.waitFor(() => expect(panel.classList.contains('island--sized')).toBe(true));

  leaving.value = true;

  await vi.waitFor(() => expect(panel.classList.contains('island--sized')).toBe(false));
  localStorage.clear();
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

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    for (let round = 0; round < 6; round += 1) {
      panel.querySelector('.recently')?.append(document.createElement('span'));
      await vi.advanceTimersByTimeAsync(40);
      readings.push(panel.style.getPropertyValue('--island-floor'));
    }
    vi.useRealTimers();

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

describe('the resize grip of a column', () => {
  const column = () =>
    render({
      components: { Island },
      template: `<div>
        <Island id="first" title="First" />
        <Island id="second" title="Second" />
      </div>`,
    });
  const grip = (title: string) => screen.queryByRole('separator', { name: 'Resize ' + title });

  test('is absent under the last open panel and present on the edge between two panels', async () => {
    column();

    await vi.waitFor(() => expect(grip('Second')).toBeNull());
    expect(grip('First')).not.toBeNull();
  });

  test('comes back under the panel above when the panel below unfolds, and goes when it folds', async () => {
    column();
    await fireEvent.click(screen.getByRole('button', { name: 'Fold Second' }));
    await vi.waitFor(() => expect(grip('First')).toBeNull());

    await fireEvent.click(screen.getByRole('button', { name: 'Open Second' }));

    await vi.waitFor(() => expect(grip('First')).not.toBeNull());
    expect(grip('Second')).toBeNull();
  });

  test('a width grip is never withdrawn', async () => {
    render(Island, { props: { id: 'side', title: 'Side', resize: 'width' } });

    await vi.waitFor(() => expect(grip('Side')).not.toBeNull());
  });
});
