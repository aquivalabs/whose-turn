import { expect, test } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/vue';
import Island from './Island.vue';

test('the fold toggle is a native button, so Space and Enter fold the panel like a click', async () => {
  const { container } = render(Island, { props: { id: 'panel', title: 'Panel' } });
  const toggle = screen.getByRole('button', { name: 'Collapse or expand panel' });

  expect(toggle.tagName).toBe('BUTTON');
  expect(toggle.getAttribute('type')).toBe('button');
  await fireEvent.click(toggle);

  expect(container.querySelector('.island--collapsed')).not.toBeNull();
});
