import type * as Api from '@/lib/api.ts';
import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/vue';
import { snapshot, notice } from '@/store.ts';
import { post } from '@/lib/api.ts';
import NotificationsToggle from './NotificationsToggle.vue';

vi.mock('@/lib/api.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof Api>()),
  post: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(post).mockReset();
  vi.mocked(post).mockResolvedValue({ notifications: { desktop: false } });
  snapshot.notifications = { desktop: true };
  notice.value = '';
});

test('a click turns notifications off, shows the off state and saves the setting', async () => {
  render(NotificationsToggle);

  const toggle = screen.getByRole('switch', { name: 'Notifications on' });
  expect(toggle.getAttribute('aria-checked')).toBe('true');
  await fireEvent.click(toggle);

  expect(post).toHaveBeenCalledWith('/api/notifications', { desktop: false });
  const off = await screen.findByRole('switch', { name: 'Notifications off' });
  expect(off.getAttribute('aria-checked')).toBe('false');
  expect(off.className).toContain('notifications-toggle--off');
});

test('a second click turns them back on', async () => {
  snapshot.notifications = { desktop: false };
  render(NotificationsToggle);

  await fireEvent.click(screen.getByRole('switch', { name: 'Notifications off' }));

  expect(post).toHaveBeenCalledWith('/api/notifications', { desktop: true });
  expect(await screen.findByRole('switch', { name: 'Notifications on' })).toBeTruthy();
});

test('a refused save puts the switch back and says so', async () => {
  vi.mocked(post).mockResolvedValue({
    error: { code: 400, status: 'INVALID_ARGUMENT', message: 'x', details: [] },
  });
  render(NotificationsToggle);

  await fireEvent.click(screen.getByRole('switch', { name: 'Notifications on' }));

  expect(await screen.findByRole('switch', { name: 'Notifications on' })).toBeTruthy();
  expect(notice.value).not.toBe('');
});
