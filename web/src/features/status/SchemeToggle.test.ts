import { afterEach, expect, test } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/vue';
import SchemeToggle from './SchemeToggle.vue';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

test('each click moves the theme switch to the next choice and names it (RMA-457)', async () => {
  render(SchemeToggle);
  const button = screen.getByRole('button', { name: 'System theme' });
  await fireEvent.click(button);
  expect(button.getAttribute('aria-label')).toBe('Light theme');
  await fireEvent.click(button);
  expect(button.getAttribute('aria-label')).toBe('Dark theme');
  await fireEvent.click(button);
  expect(button.getAttribute('aria-label')).toBe('System theme');
});
