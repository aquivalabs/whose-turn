import { beforeEach, expect, test } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/vue';
import { snapshot, ui } from '@/store.ts';
import type { FeedItem } from '@/lib/types.ts';
import CommentModal from './CommentModal.vue';

const comment = (extra: Partial<FeedItem> = {}): FeedItem => ({
  id: 'c1',
  ref: 'PROJ-7',
  kind: 'comment',
  who: 'Pat',
  at: '2026-11-02T10:00:00Z',
  source: 'tracker',
  body: 'Can you look at this?',
  url: 'https://tracker.example/PROJ-7',
  ...extra,
});

beforeEach(() => {
  ui.modal = null;
  snapshot.workspace = { ...snapshot.workspace, connectors: [{ id: 'tracker', type: 'jira', label: 'Jira' }] };
});

test('nothing opens until a comment is chosen', () => {
  render(CommentModal);

  expect(screen.queryByRole('dialog')).toBeNull();
});

test('a chosen comment opens with its ref, kind and author, its text, and a link named after its source', async () => {
  ui.modal = comment();
  render(CommentModal);

  expect(await screen.findByRole('dialog')).toBeTruthy();
  expect(screen.getByText('PROJ-7 · comment · Pat')).toBeTruthy();
  expect(screen.getByText('Can you look at this?')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Open in Jira' }).getAttribute('href')).toBe('https://tracker.example/PROJ-7');
});

test('a comment from an unknown source names the source id, and a link that is not https is not offered', async () => {
  ui.modal = comment({ source: 'other', url: 'http://plain.example/x', body: undefined, text: 'Short text' });
  render(CommentModal);

  expect(await screen.findByText('Short text')).toBeTruthy();
  expect(screen.queryByRole('link', { name: /Open in/ })).toBeNull();
});

test('closing the dialog clears the chosen comment', async () => {
  ui.modal = comment();
  render(CommentModal);

  await fireEvent.click(await screen.findByRole('button', { name: /close/i }));

  expect(ui.modal).toBeNull();
});
