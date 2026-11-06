import type * as Api from '@/lib/api.ts';
import type { FiledReport } from '@/lib/types.ts';
import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/vue';
import { getJson } from '@/lib/api.ts';
import { SERVER_DOWN } from '@/lib/problems.ts';

// The network boundary: getJson is the only call that leaves the window.
vi.mock('@/lib/api.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof Api>()),
  getJson: vi.fn(),
}));

const report = (extra: Partial<FiledReport> = {}): FiledReport => ({
  id: 'RMA-900',
  title: 'The chip wraps',
  filed_at: '2026-11-01T10:00:00Z',
  answers: [],
  ...extra,
});

const open = async (search: string) => {
  window.history.replaceState(null, '', `/report${search}`);
  vi.resetModules();
  const { default: ReportPage } = await import('./ReportPage.vue');
  return render(ReportPage);
};

beforeEach(() => {
  vi.mocked(getJson).mockReset();
});

test('a link without an id says so and asks the server nothing', async () => {
  await open('');

  expect(await screen.findByText('No report id in the link.')).toBeTruthy();
  expect(getJson).not.toHaveBeenCalled();
});

test('a filed report shows its title, state, kind, text and every answer, and names the tab', async () => {
  vi.mocked(getJson).mockResolvedValue({
    report: report({
      kind: 'bug',
      state: 'In Progress',
      outcome: 'open',
      body: 'It wraps at 1200px.',
      changed_at: '2026-11-02T10:00:00Z',
      answers: [{ by: 'Roman', at: '2026-11-02T11:00:00Z', text: 'Fixed in the next release.' }],
    }),
  });

  await open('?id=RMA-900');

  expect(await screen.findByRole('heading', { name: 'The chip wraps' })).toBeTruthy();
  expect(screen.getByText('In Progress')).toBeTruthy();
  expect(screen.getByText(/bug · filed .* · last change/)).toBeTruthy();
  expect(screen.getByText('It wraps at 1200px.')).toBeTruthy();
  expect(screen.getByText('Fixed in the next release.')).toBeTruthy();
  expect(screen.getByText(/^Roman · /)).toBeTruthy();
  expect(document.title).toBe('RMA-900 · Your report · Whose Turn');
  expect(getJson).toHaveBeenCalledWith('/api/feedback?id=RMA-900');
});

test('a report with nothing filled in yet reads as filed, unseen, with no text kept and no answer', async () => {
  vi.mocked(getJson).mockResolvedValue({ report: report() });

  await open('?id=RMA-900');

  expect(await screen.findByText('filed, not yet seen')).toBeTruthy();
  expect(screen.getByText(/^report · filed /)).toBeTruthy();
  expect(screen.getByText('(no text kept)')).toBeTruthy();
  expect(screen.getByText('No answer yet.')).toBeTruthy();
});

test('a report closed without an answer says the maintainer owes a reason', async () => {
  vi.mocked(getJson).mockResolvedValue({ report: report({ unanswered: true }) });

  await open('?id=RMA-900');

  expect(await screen.findByText(/Closed without an answer/)).toBeTruthy();
  expect(screen.queryByText('No answer yet.')).toBeNull();
});

test('an id the server does not know says it was not filed from this machine', async () => {
  vi.mocked(getJson).mockResolvedValue({});

  await open('?id=RMA-404');

  expect(await screen.findByText('No report RMA-404 was filed from this machine.')).toBeTruthy();
});

test('a server that does not answer is named, with what to do', async () => {
  vi.mocked(getJson).mockRejectedValue(new Error('unreachable'));

  await open('?id=RMA-900');

  expect(await screen.findByText(`${SERVER_DOWN}; reload this page once it is back.`)).toBeTruthy();
});
