import type * as Store from '@/store.ts';
import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/vue';
import { setMarks, showInFeed, snapshot, ui } from '@/store.ts';
import type { TurnRow } from '@/lib/types.ts';
import YourMove from './YourMove.vue';
import NoteModal from './NoteModal.vue';
import { useMoveView } from './useMoveView.ts';

vi.mock('@/backdrop.ts', () => ({ show: vi.fn(), repaint: vi.fn(), seeded: vi.fn() }));
vi.mock('@/store.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof Store>()),
  setMarks: vi.fn(),
  showInFeed: vi.fn(),
}));

const LONG = 'Looks done, please test the export. '.repeat(20).trim();

const row = (id: string, handled: boolean): TurnRow => ({
  row_id: id,
  key: id.toUpperCase(),
  summary: 'Summary of ' + id,
  ticket_url: 'https://tracker.example/' + id,
  group: 'you',
  rank: 1,
  updated: '2026-11-02T10:00:00Z',
  activity_at: '2026-11-02T10:00:00Z',
  status: 'In review',
  handled,
  next: 'Review ' + id,
});

beforeEach(() => {
  snapshot.turn = [row('nw-1', false), row('nw-2', true)];
  snapshot.marks = { seen: [], base: 0, handled: {}, info: {} };
  useMoveView().value = 'open';
  ui.note = '';
});

test('the PR and Last comment columns are left out while every row is empty in them', async () => {
  render({ components: { YourMove, NoteModal }, template: '<YourMove /><NoteModal />' });
  await screen.findByText('Review nw-1');

  expect(screen.queryByRole('columnheader', { name: 'PR' })).toBeNull();
  expect(screen.queryByRole('columnheader', { name: 'Last comment' })).toBeNull();
});

test('a PR row without a ticket links the PR from the ticket column and leaves the PR column out', async () => {
  snapshot.turn = [
    {
      ...row('nw-3', false),
      key: 'repo#7',
      ticket_url: '',
      pr: 'repo#7',
      pr_url: 'https://host.example/pull/7',
    },
  ];
  render({ components: { YourMove, NoteModal }, template: '<YourMove /><NoteModal />' });

  const link = await screen.findByRole('link', { name: 'repo#7' });

  expect(link.getAttribute('href')).toBe('https://host.example/pull/7');
  expect(screen.getAllByRole('link', { name: 'repo#7' })).toHaveLength(1);
  expect(screen.queryByRole('columnheader', { name: 'PR' })).toBeNull();
});

test('Handled sends the id of its row to setMarks', async () => {
  vi.mocked(setMarks).mockResolvedValue('');
  render({ components: { YourMove, NoteModal }, template: '<YourMove /><NoteModal />' });

  await fireEvent.click(await screen.findByRole('button', { name: 'Mark as handled: NW-1' }));

  expect(setMarks).toHaveBeenCalledWith({ handled: { 'nw-1': expect.any(String) } });
});

test('no note input shows before Handled', async () => {
  render({ components: { YourMove, NoteModal }, template: '<YourMove /><NoteModal />' });
  await screen.findByText('Review nw-1');

  expect(screen.queryByLabelText('Note for NW-1')).toBeNull();
});

test('Handled opens the note modal with the field focused', async () => {
  vi.mocked(setMarks).mockResolvedValue('');
  render({ components: { YourMove, NoteModal }, template: '<YourMove /><NoteModal />' });

  await fireEvent.click(await screen.findByRole('button', { name: 'Mark as handled: NW-1' }));

  const field = await screen.findByLabelText(/Note/);
  expect(screen.getByRole('dialog')).toBeTruthy();
  await vi.waitFor(() => expect(document.activeElement).toBe(field));
});

test('Save stores the note and closes the modal', async () => {
  vi.mocked(setMarks).mockResolvedValue('');
  render({ components: { YourMove, NoteModal }, template: '<YourMove /><NoteModal />' });

  await fireEvent.click(await screen.findByRole('button', { name: 'Mark as handled: NW-1' }));
  await fireEvent.update(await screen.findByLabelText(/Note/), 'Checked with the customer, nothing to change');
  await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(setMarks).toHaveBeenLastCalledWith({ notes: { 'nw-1': 'Checked with the customer, nothing to change' } });
  await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

test('Skip closes the modal and leaves the row handled with no note', async () => {
  vi.mocked(setMarks).mockResolvedValue('');
  render({ components: { YourMove, NoteModal }, template: '<YourMove /><NoteModal />' });

  await fireEvent.click(await screen.findByRole('button', { name: 'Mark as handled: NW-1' }));
  await fireEvent.click(await screen.findByRole('button', { name: 'Skip' }));

  await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(setMarks).toHaveBeenCalledTimes(1);
  expect(setMarks).toHaveBeenCalledWith({ handled: { 'nw-1': expect.any(String) } });
});

test('a manual mark with a note shows the note on its own line with the time', async () => {
  snapshot.marks = {
    seen: [],
    base: 0,
    handled: { 'nw-2': '2026-11-02T10:05:00Z' },
    info: { 'nw-2': { note: 'Checked with the customer, nothing to change' } },
  };
  useMoveView().value = 'handled';
  const { container } = render({
    components: { YourMove, NoteModal },
    template: '<YourMove /><NoteModal />',
  });

  const line = await screen.findByRole('button', { name: /Checked with the customer, nothing to change/ });
  await fireEvent.click(line);

  expect(((await screen.findByLabelText(/Note/)) as HTMLTextAreaElement).value).toBe(
    'Checked with the customer, nothing to change',
  );
  expect(container.querySelector('.your-move__time')?.textContent).toMatch(/^\d\d:\d\d$/);
});

test('a pass-on line shows the outcome; a click opens the modal with the full event and the comment', async () => {
  snapshot.turn = [{ ...row('nw-4', true), group: 'others', next: 'Not yours now' }];
  snapshot.marks.info = {
    'nw-4': {
      auto: true,
      outcome: 'Passed to Sam · Ready for QA · Looks done',
      event: 'event:NW-4:t:reassigned',
      detail: {
        what: 'Passed to Sam · Ready for QA',
        assignee: 'you → Sam',
        status: 'In Progress → Ready for QA',
        comment: { author: 'Sam', text: LONG },
      },
    },
  };
  useMoveView().value = 'handled';
  render({ components: { YourMove, NoteModal }, template: '<YourMove /><NoteModal />' });

  await fireEvent.click(
    await screen.findByRole('button', { name: /Passed to Sam · Ready for QA/ }),
  );

  expect(await screen.findByText('you → Sam')).toBeTruthy();
  expect(screen.getByText('What happened').nextElementSibling?.textContent).toBe('Passed to Sam · Ready for QA');
  expect(screen.getByText('In Progress → Ready for QA')).toBeTruthy();
  expect(screen.getByText(new RegExp(LONG.slice(-20)))).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Move back to open/ })).toBeNull();
  expect(screen.queryByText('passed on')).toBeNull();
  await fireEvent.click(screen.getByRole('button', { name: 'Open in feed' }));
  expect(showInFeed).toHaveBeenCalledWith('event:NW-4:t:reassigned');
});

test('a trace saved before the head phrase had its own field still shows its outcome in the modal', async () => {
  snapshot.turn = [{ ...row('nw-4', true), group: 'others', next: 'Not yours now' }];
  snapshot.marks.info = {
    'nw-4': { auto: true, outcome: 'Passed to Sam', event: 'event:NW-4:t:reassigned', detail: { assignee: 'you → Sam' } },
  };
  useMoveView().value = 'handled';
  render({ components: { YourMove, NoteModal }, template: '<YourMove /><NoteModal />' });

  await fireEvent.click(await screen.findByRole('button', { name: /Passed to Sam/ }));

  expect((await screen.findByText('What happened')).nextElementSibling?.textContent).toBe('Passed to Sam');
});

test('the Handled view lists the handled rows and not the open ones', async () => {
  render({ components: { YourMove, NoteModal }, template: '<YourMove /><NoteModal />' });
  expect(await screen.findByText('Review nw-1')).toBeTruthy();
  expect(screen.queryByText('Review nw-2')).toBeNull();

  await fireEvent.click(screen.getByRole('button', { name: /Handled/ }));

  expect(await screen.findByText('Review nw-2')).toBeTruthy();
  expect(screen.queryByText('Review nw-1')).toBeNull();
});

test('a stream reconnect clears the problem lines of refused rows', async () => {
  vi.mocked(setMarks).mockResolvedValue('The local server is not answering.');
  render({ components: { YourMove, NoteModal }, template: '<YourMove /><NoteModal />' });
  await fireEvent.click(await screen.findByRole('button', { name: 'Mark as handled: NW-1' }));
  await screen.findByRole('alert');

  ui.reconnects++;

  await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
});

test('Handled offers Undo for a moment, and Undo moves the row back', async () => {
  vi.mocked(setMarks).mockResolvedValue('');
  render({ components: { YourMove, NoteModal }, template: '<YourMove /><NoteModal />' });

  await fireEvent.click(await screen.findByRole('button', { name: 'Mark as handled: NW-1' }));
  await fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));

  expect(setMarks).toHaveBeenLastCalledWith({ handled: { 'nw-1': null } });
});
