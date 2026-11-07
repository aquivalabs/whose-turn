import { afterEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/vue';
import { ui } from '@/store.ts';
import { browserOf } from '@/lib/browser.ts';
import FeedbackSheet from './FeedbackSheet.vue';

const answer = (body: object) => ({ ok: true, json: () => Promise.resolve(body) });
const PREVIEW = { preview: { environment: { os: 'darwin' }, diagnostics: { channel: 'window', 'rows.your_move': '1-5' } }, preview_token: 'tok-1' };
const sentBody = (options?: RequestInit) => JSON.parse(String(options?.body || '{}'));
/** Answers the preview, the list and the send by what each request is. */
const routed = ({ list = { reports: [] } as object, sent = { reports: [] } as object } = {}) =>
  vi.fn((url: string, options?: RequestInit) => {
    if (options?.method !== 'POST') {
      return Promise.resolve(answer(list));
    }
    return Promise.resolve(answer(sentBody(options).preview ? PREVIEW : sent));
  });

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

test('the sheet always lets you send, and says in one line what is sent', async () => {
  await openSheet(routed());

  expect(screen.getByText(/Only what you write, the monitor version, a rough description of your system and counts about the monitor's health are sent/)).toBeTruthy();
  expect(screen.queryByText(/not connected/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Copy remark' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Send' }).getAttribute('aria-disabled')).toBe('false');
});

test('a sent report shows its identifier as a link and joins the list with its state', async () => {
  await openSheet(
    routed({
      sent: {
        issue: { identifier: 'RMA-9', title: 'Chevron wraps' },
        reports: [{ id: 'RMA-9', title: 'Chevron wraps', state: 'Open', outcome: 'open', filed_at: '2026-11-04T10:00:00.000Z' }],
      },
    }),
  );

  await fireEvent.update(screen.getByPlaceholderText(/Describe the problem/), 'The chevron wraps');
  await fireEvent.click(screen.getByRole('button', { name: 'Send' }));

  expect(await screen.findByText('Open')).toBeTruthy();
  expect(screen.getAllByRole('link', { name: 'RMA-9' }).length).toBeGreaterThan(0);
});

test('a report fixed for the next release shows its own pill', async () => {
  await openSheet(
    routed({
      list: {
        reports: [
          {
            id: 'RMA-9',
            title: 'Chevron wraps',
            state: 'Fixed, coming in the next release',
            outcome: 'ready',
            filed_at: '2026-11-04T10:00:00.000Z',
          },
        ],
      },
    }),
  );

  const pill = await screen.findByText('Fixed, coming in the next release');
  expect(pill.className).toContain('pill--ready');
});

test('opening the sheet asks for the preview once, and What is sent shows exactly that payload', async () => {
  const fetch = routed();
  await openSheet(fetch);

  await fireEvent.click(await screen.findByRole('button', { name: 'What is sent' }));

  expect(screen.getByText(/"rows.your_move": "1-5"/)).toBeTruthy();
  const previews = fetch.mock.calls.filter(([, options]) => options?.method === 'POST' && sentBody(options).preview);
  expect(previews).toHaveLength(1);
  expect(sentBody(previews[0][1]).window).toMatchObject({ panel: 'dashboard', console_errors: expect.any(Number) });
});

test('the sheet sends the remark, who sent it, the workspace id, the preview token and the snapshot the preview was built from', async () => {
  const fetch = routed();
  await openSheet(fetch);
  await screen.findByRole('button', { name: 'What is sent' });

  await fireEvent.update(screen.getByPlaceholderText(/Describe the problem/), 'The chevron wraps');
  await fireEvent.click(screen.getByRole('button', { name: 'Send' }));

  const posts = fetch.mock.calls.filter(([, options]) => options?.method === 'POST');
  const preview = sentBody(posts[0][1]);
  const sent = sentBody(posts[1][1]);
  expect(sent.window).toEqual(preview.window);
  expect(sent).toEqual({
      text: 'The chevron wraps',
      from: 'the window',
      ws: expect.any(String),
      preview_token: 'tok-1',
      window: expect.any(Object),
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

test('a list that marks reports as mine is headed All reports and flags the user\'s own', async () => {
  const at = '2026-11-04T10:00:00.000Z';
  await openSheet(
    routed({
      list: {
        reports: [
          { id: 'RMA-2', title: 'Someone else', state: 'Open', outcome: 'open', filed_at: at, mine: false },
          { id: 'RMA-1', title: 'Mine', state: 'Open', outcome: 'open', filed_at: at, mine: true },
        ],
      },
    }),
  );

  expect(await screen.findByText('All reports')).toBeTruthy();
  expect(screen.getAllByText('yours')).toHaveLength(1);
});

test('a plain list keeps the Your reports heading and no marker', async () => {
  await openSheet(
    routed({ list: { reports: [{ id: 'RMA-1', title: 'Mine', state: 'Open', outcome: 'open', filed_at: '2026-11-04T10:00:00.000Z' }] } }),
  );

  expect(await screen.findByText('Your reports')).toBeTruthy();
  expect(screen.queryByText('yours')).toBeNull();
});
