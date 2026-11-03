import type * as Store from '../store.ts';
import { expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/vue';
import { todoAct } from '../store.ts';
import Todos from './Todos.vue';

vi.mock('../backdrop.ts', () => ({ show: vi.fn(), repaint: vi.fn(), seeded: vi.fn() }));
vi.mock('../store.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof Store>()),
  todoAct: vi.fn(),
}));

const typeIntoBox = async (text: string) => {
  const box = await screen.findByRole('textbox', { name: 'New to-do' });
  await fireEvent.update(box, text);
  await fireEvent.keyDown(box, { key: 'Enter' });
  return box as HTMLInputElement;
};

test('typing and pressing Enter adds the to-do and clears the box', async () => {
  vi.mocked(todoAct).mockResolvedValue('');
  render(Todos);

  const box = await typeIntoBox('  call the vendor  ');

  expect(todoAct).toHaveBeenCalledWith({ action: 'add', text: 'call the vendor' });
  await vi.waitFor(() => expect(box.value).toBe(''));
});

test('a refused add keeps the text and shows the line', async () => {
  vi.mocked(todoAct).mockResolvedValue('The local server is not answering; your text is kept.');
  render(Todos);

  const box = await typeIntoBox('call the vendor');

  expect((await screen.findByRole('alert')).textContent).toContain('your text is kept');
  expect(box.value).toBe('call the vendor');
});
