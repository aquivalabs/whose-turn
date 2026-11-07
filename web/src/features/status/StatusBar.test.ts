import type * as Api from '@/lib/api.ts';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/vue';
import { ui } from '@/store.ts';
import { post } from '@/lib/api.ts';
import StatusBar from './StatusBar.vue';

// The network boundary: post is the only call that leaves the window.
vi.mock('@/lib/api.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof Api>()),
  post: vi.fn(),
}));

beforeEach(() => {
  vi.useFakeTimers();
  ui.mode = 'tab';
  ui.status = '';
});

afterEach(() => {
  vi.useRealTimers();
});

test('Open as app turns to Opening, ignores a second click, then returns after the window', async () => {
  vi.mocked(post).mockResolvedValue({ ok: true });
  render(StatusBar);

  const button = screen.getByRole('button', { name: 'Open as app' });
  await fireEvent.click(button);
  await fireEvent.click(button);

  expect(post).toHaveBeenCalledTimes(1);
  expect(button.textContent).toBe('Opening…');
  expect(button.getAttribute('aria-disabled')).toBe('true');
  expect(await screen.findByText('Opened in the app window. You can close this tab.')).toBeTruthy();

  await vi.advanceTimersByTimeAsync(5000);

  expect(button.textContent).toBe('Open as app');
  expect(button.getAttribute('aria-disabled')).toBe('false');
});

test('a refused open shows the refusal and not the opened line', async () => {
  vi.mocked(post).mockResolvedValue({
    error: {
      code: 429,
      status: 'RESOURCE_EXHAUSTED',
      message: 'x',
      details: [
        { '@type': 'ErrorInfo', reason: 'OPEN_TOO_SOON', domain: 'whose-turn', metadata: {} },
      ],
    },
  });
  render(StatusBar);

  await fireEvent.click(screen.getByRole('button', { name: 'Open as app' }));

  expect(
    await screen.findByText('The app window is already opening; give it a few seconds.'),
  ).toBeTruthy();
  expect(screen.queryByText('Opened in the app window. You can close this tab.')).toBeNull();
});
