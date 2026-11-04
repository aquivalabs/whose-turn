import type * as Store from '@/store.ts';
import { expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/vue';
import { snapshot, todoAct, ui } from '@/store.ts';
import Todos from './Todos.vue';

vi.mock('@/backdrop.ts', () => ({ show: vi.fn(), repaint: vi.fn(), seeded: vi.fn() }));
vi.mock('@/store.ts', async (importOriginal) => ({
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

test('the done check is a native button, so Space and Enter tick it like a click', async () => {
  vi.mocked(todoAct).mockResolvedValue('');
  snapshot.todos = [
    { id: 't1', text: 'call the vendor', created: '2026-11-02T10:00:00Z', done: null },
  ];
  render(Todos);
  const check = await screen.findByRole('checkbox', { name: 'Mark done' });

  expect(check.tagName).toBe('BUTTON');
  expect(check.getAttribute('type')).toBe('button');
  await fireEvent.click(check);

  expect(todoAct).toHaveBeenCalledWith({ action: 'done', id: 't1' });
  snapshot.todos = [];
});

test('a stream reconnect clears the line of a refused action', async () => {
  vi.mocked(todoAct).mockResolvedValue('The local server is not answering; your text is kept.');
  render(Todos);
  await typeIntoBox('call the vendor');
  await screen.findByRole('alert');

  ui.reconnects++;

  await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
});

const one = () => {
  snapshot.todos = [
    { id: 't1', text: 'call the vendor', created: '2026-11-02T10:00:00Z', done: null },
  ];
};

test('the pencil turns the row into an input and Enter saves through edit', async () => {
  vi.mocked(todoAct).mockResolvedValue('');
  one();
  render(Todos);
  await fireEvent.click(await screen.findByRole('button', { name: 'Edit to-do' }));
  const box = await screen.findByRole('textbox', { name: 'Edit to-do' });

  await fireEvent.update(box, ' call the supplier ');
  await fireEvent.keyDown(box, { key: 'Enter' });

  expect(todoAct).toHaveBeenCalledWith({ action: 'edit', id: 't1', text: 'call the supplier' });
  await vi.waitFor(() => expect(screen.queryByRole('textbox', { name: 'Edit to-do' })).toBeNull());
  snapshot.todos = [];
});

test('Escape cancels an edit without calling the server', async () => {
  vi.mocked(todoAct).mockClear();
  one();
  render(Todos);
  await fireEvent.dblClick(await screen.findByText('call the vendor'));
  const box = await screen.findByRole('textbox', { name: 'Edit to-do' });

  await fireEvent.update(box, 'something else');
  await fireEvent.keyDown(box, { key: 'Escape' });

  expect(todoAct).not.toHaveBeenCalled();
  expect(await screen.findByText('call the vendor')).toBeTruthy();
  snapshot.todos = [];
});

test('delete offers Undo, which adds the text back', async () => {
  vi.mocked(todoAct).mockReset();
  vi.mocked(todoAct).mockResolvedValue('');
  one();
  render(Todos);
  await fireEvent.click(await screen.findByRole('button', { name: 'Delete to-do' }));

  await fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));

  expect(todoAct).toHaveBeenLastCalledWith({ action: 'add', text: 'call the vendor' });
  await vi.waitFor(() => expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull());
  snapshot.todos = [];
});

test('Undo of a deleted done to-do adds it back and marks it done again', async () => {
  vi.mocked(todoAct).mockReset();
  vi.mocked(todoAct).mockImplementation(async (body) => {
    if (body.action === 'add') {
      snapshot.todos = [
        { id: 't2', text: body.text ?? '', created: '2026-11-02T11:00:00Z', done: null },
      ];
    }
    return '';
  });
  snapshot.todos = [
    {
      id: 't1',
      text: 'call the vendor',
      created: '2026-11-02T10:00:00Z',
      done: '2026-11-02T10:30:00Z',
    },
  ];
  const { unmount } = render(Todos);
  await fireEvent.click(await screen.findByRole('button', { name: 'Done 1' }));
  await fireEvent.click(await screen.findByRole('button', { name: 'Delete to-do' }));

  await fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));

  await vi.waitFor(() => expect(todoAct).toHaveBeenLastCalledWith({ action: 'done', id: 't2' }));
  expect(todoAct).toHaveBeenCalledWith({ action: 'add', text: 'call the vendor' });
  unmount();
  snapshot.todos = [];
});

test.each([
  ['an empty', ''],
  ['a blank', '   '],
  ['an unchanged', ' call the vendor '],
])('%s edit saves nothing and closes the box', async (_name, text) => {
  vi.mocked(todoAct).mockReset();
  vi.mocked(todoAct).mockResolvedValue('');
  one();
  const { unmount } = render(Todos);
  await fireEvent.dblClick(await screen.findByText('call the vendor'));
  const box = await screen.findByRole('textbox', { name: 'Edit to-do' });

  await fireEvent.update(box, text);
  await fireEvent.keyDown(box, { key: 'Enter' });

  expect(todoAct).not.toHaveBeenCalled();
  await vi.waitFor(() => expect(screen.queryByRole('textbox', { name: 'Edit to-do' })).toBeNull());
  unmount();
  snapshot.todos = [];
});

test('a delete the server refuses shows the line and offers no Undo', async () => {
  vi.mocked(todoAct).mockReset();
  vi.mocked(todoAct).mockResolvedValue('The local server is not answering.');
  one();
  const { unmount } = render(Todos);

  await fireEvent.click(await screen.findByRole('button', { name: 'Delete to-do' }));

  expect((await screen.findByRole('alert')).textContent).toContain('not answering');
  expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  expect(screen.getByText('call the vendor')).toBeTruthy();
  unmount();
  snapshot.todos = [];
});
