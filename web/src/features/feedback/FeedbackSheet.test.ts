import { afterEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/vue';
import { ui } from '@/store.ts';
import { browserOf } from '@/lib/browser.ts';
import FeedbackSheet from './FeedbackSheet.vue';

const answer = (body: object) => ({ json: () => Promise.resolve(body) });

afterEach(() => {
  ui.feedback = false;
  vi.unstubAllGlobals();
});

const openSheet = async (fetch: ReturnType<typeof vi.fn>) => {
  vi.stubGlobal('fetch', fetch);
  render(FeedbackSheet);
  ui.feedback = true;
  await screen.findByText('Report a problem or a wish');
};

test('the sheet always lets you send, and says in one line that only what you write, the version and your system are sent', async () => {
  await openSheet(vi.fn().mockResolvedValue(answer({ reports: [] })));

  expect(screen.getByText(/Only what you write, the monitor version and a description of your system \(OS, browser, screen, language, time zone\) are sent/)).toBeTruthy();
  expect(screen.queryByText(/not connected/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Copy remark' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Send' }).getAttribute('aria-disabled')).toBe('false');
});

test('a sent report shows its identifier as a link and joins the list with its state', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(answer({ reports: [] }))
    .mockResolvedValueOnce(
      answer({
        issue: { identifier: 'RMA-9', title: 'Chevron wraps' },
        reports: [{ id: 'RMA-9', title: 'Chevron wraps', state: 'Open', outcome: 'open', filed_at: '2026-11-04T10:00:00.000Z' }],
      }),
    );
  await openSheet(fetch);

  await fireEvent.update(screen.getByPlaceholderText(/Describe the problem/), 'The chevron wraps');
  await fireEvent.click(screen.getByRole('button', { name: 'Send' }));

  expect(await screen.findByText('Open')).toBeTruthy();
  expect(screen.getAllByRole('link', { name: 'RMA-9' }).length).toBeGreaterThan(0);
});

test('the sheet sends the remark, who sent it and the workspace id, and no context', async () => {
  const fetch = vi.fn().mockResolvedValue(answer({ reports: [] }));
  await openSheet(fetch);

  await fireEvent.update(screen.getByPlaceholderText(/Describe the problem/), 'The chevron wraps');
  await fireEvent.click(screen.getByRole('button', { name: 'Send' }));

  const post = fetch.mock.calls.find(([, options]) => options?.method === 'POST');
  expect(JSON.parse(post?.[1].body)).toEqual({
      text: 'The chevron wraps',
      from: 'the window',
      ws: expect.any(String),
      client: {
        browser: browserOf(navigator),
        display: {
          width: window.screen.width,
          height: window.screen.height,
          scale: devicePixelRatio,
          viewport: [innerWidth, innerHeight],
        },
        locale: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        theme: expect.stringMatching(/^(light|dark)$/),
        mode: expect.stringMatching(/^(app|tab)$/),
      },
    });
});
