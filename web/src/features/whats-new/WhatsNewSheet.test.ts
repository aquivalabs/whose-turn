import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/vue';
import { effectScope, nextTick } from 'vue';
import { ui } from '@/store.ts';
import { SEEN_KEY, useWhatsNew } from '@/composables/useWhatsNew.ts';
import type { Changelog } from '@/lib/whats-new.ts';
import WhatsNewSheet from './WhatsNewSheet.vue';


const reply: Changelog = {
  current: '1.2.0',
  versions: [
    {
      version: '1.2.0',
      date: '2026-11-04',
      sections: [{ kind: 'Fixed', items: ['The **bold** fix with `code`.', '<img src=x onerror=alert(1)>'] }],
    },
    { version: '1.1.0', date: '2026-11-01', sections: [] },
    { version: '1.0.0', date: '2026-10-30', sections: [{ kind: 'Added', items: ['First.'] }] },
  ],
};

const stubChangelog = (body: object = reply) =>
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: () => Promise.resolve(body) }));

let scope = effectScope();
const shared = () => scope.run(useWhatsNew)!;

beforeEach(() => {
  localStorage.clear();
  scope = effectScope();
});
afterEach(() => {
  cleanup();
  scope.stop();
  ui.whatsNew = false;
});

test('the sheet lists every version newest first, marks the running one and renders Markdown as nodes, never HTML', async () => {
  stubChangelog();
  const { container } = render(WhatsNewSheet);
  ui.whatsNew = true;

  await screen.findByText('1.2.0');

  const names = [...container.querySelectorAll('.whats-new-sheet__name')].map((node) => node.textContent?.trim());
  expect(names).toEqual(['1.2.0', '1.1.0', '1.0.0']);
  expect(screen.getByText('Running')).toBeTruthy();
  expect(screen.getByText('Running 1.2.0').className).toContain('modal__meta');
  expect(screen.getByRole('dialog').getAttribute('aria-labelledby')).toBe('whats-new-title');
  expect(screen.getByText('No notes for this version.')).toBeTruthy();
  expect(container.querySelector('strong')?.textContent).toBe('bold');
  expect(container.querySelector('img')).toBeNull();
  expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
});

test('opening the sheet flags the versions since the last visit and marks them seen', async () => {
  localStorage.setItem(SEEN_KEY, '1.0.0');
  stubChangelog();
  const { container } = render(WhatsNewSheet);
  const { unseen, load } = shared();
  await load();
  expect(unseen.value.map((entry) => entry.version)).toEqual(['1.2.0', '1.1.0']);

  ui.whatsNew = true;
  await screen.findByText('1.2.0');
  await nextTick();

  expect(container.querySelectorAll('.whats-new-sheet__tag:not(.whats-new-sheet__tag--running)')).toHaveLength(2);
  expect(unseen.value).toEqual([]);
  expect(localStorage.getItem(SEEN_KEY)).toBe('1.2.0');
});

test('a first ever load stores the running version, so a new user sees no dot', async () => {
  stubChangelog();
  const { container } = render(WhatsNewSheet);
  const { unseen, load } = shared();

  await load();

  await vi.waitFor(() => expect(localStorage.getItem(SEEN_KEY)).toBe('1.2.0'));
  expect(unseen.value).toEqual([]);
  expect(container.textContent).toBe('');
});

test('the Close button hides the sheet', async () => {
  stubChangelog();
  render(WhatsNewSheet);
  ui.whatsNew = true;
  await screen.findByText('1.2.0');

  await fireEvent.click(screen.getByRole('button', { name: 'Close' }));

  expect(screen.queryByRole('dialog')).toBeNull();
});

test('an unreadable changelog shows the server message', async () => {
  vi.unstubAllGlobals();
  stubChangelog({
    error: { code: 404, status: 'NOT_FOUND', message: 'This install has no readable CHANGELOG.md.', details: [] },
  });
  const { load } = shared();
  render(WhatsNewSheet);
  await load();
  ui.whatsNew = true;

  expect(await screen.findByRole('alert')).toBeTruthy();
});

test('an Important entry shows first in its version, in its own highlighted note (RMA-86)', async () => {
  stubChangelog({
    current: '1.3.0',
    versions: [{ version: '1.3.0', date: '2026-11-06', sections: [{ kind: 'Fixed', items: ['A fix.'] }, { kind: 'Important', items: ['Check your **Jira** settings.'] }] }],
  });
  const { container } = render(WhatsNewSheet);
  ui.whatsNew = true;

  const note = await screen.findByRole('note');

  expect(note.className).toContain('whats-new-sheet__important');
  expect(note.textContent).toContain('Check your Jira settings.');
  expect(container.querySelector('.whats-new-sheet__important + .markdown-view')?.textContent).toContain('A fix.');
});
