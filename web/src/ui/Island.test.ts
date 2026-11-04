import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { h, ref } from 'vue';
import { fireEvent, render, screen } from '@testing-library/vue';
import Island from './Island.vue';

test('the fold toggle is a native button, so Space and Enter fold the panel like a click', async () => {
  const { container } = render(Island, { props: { id: 'panel', title: 'Panel' } });
  const toggle = screen.getByRole('button', { name: 'Fold Panel' });

  expect(toggle.tagName).toBe('BUTTON');
  expect(toggle.getAttribute('type')).toBe('button');
  await fireEvent.click(toggle);

  expect(container.querySelector('.island--collapsed')).not.toBeNull();
});

describe('a remembered height', () => {
  const rowCount = ref(0);
  const Rows = () => h('table', [h('tbody', Array.from({ length: rowCount.value }, () => h('tr', [h('td', 'row')])))]);

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
