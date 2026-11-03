import type * as Api from '@/lib/api.ts';
import type { UpdateStatus } from '@/lib/types.ts';
import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/vue';
import { nextTick } from 'vue';
import { snapshot } from '@/store.ts';
import { post } from '@/lib/api.ts';
import UpdateChip from './UpdateChip.vue';

vi.mock('@/lib/api.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof Api>()),
  post: vi.fn(),
}));

const offer = (extra: Partial<UpdateStatus> = {}): UpdateStatus => ({
  current: '1.0.0-alpha.2',
  latest: '1.0.0-alpha.3',
  available: true,
  state: 'idle',
  ...extra,
});

beforeEach(() => {
  vi.mocked(post).mockReset();
  snapshot.update = offer({ latest: '1.0.0-alpha.2', available: false });
});

test('no chip while nothing newer is out', () => {
  const { container } = render(UpdateChip);

  expect(container.textContent).toBe('');
});

test('the offer installs on click, reads Updating, then Updated to the version the reconnect brings', async () => {
  snapshot.update = offer();
  vi.mocked(post).mockResolvedValue({ update: offer({ state: 'installing' }) });
  render(UpdateChip);

  await fireEvent.click(screen.getByRole('button', { name: '1.0.0-alpha.3 is out · Update' }));

  expect(post).toHaveBeenCalledWith('/api/update');
  expect(await screen.findByText('Updating…')).toBeTruthy();

  snapshot.update = offer({ state: 'restarting' });
  await nextTick();
  expect(screen.getByText('Updating…')).toBeTruthy();

  snapshot.update = offer({ current: '1.0.0-alpha.3', available: false });
  expect(await screen.findByText('Updated to 1.0.0-alpha.3')).toBeTruthy();
});

test('a failed install offers a retry with npm message as the tooltip', async () => {
  snapshot.update = offer({ state: 'failed', reason: 'npm error code ETARGET' });
  render(UpdateChip);

  const retry = screen.getByRole('button', { name: 'Update failed · Retry' });

  expect(retry.getAttribute('title')).toBe('npm error code ETARGET');
});

test('a refused update returns to the offer', async () => {
  snapshot.update = offer();
  vi.mocked(post).mockResolvedValue({
    error: {
      code: 409,
      status: 'ABORTED',
      message: 'x',
      details: [
        { '@type': 'ErrorInfo', reason: 'UPDATE_IN_PROGRESS', domain: 'whose-turn', metadata: {} },
      ],
    },
  });
  render(UpdateChip);

  await fireEvent.click(screen.getByRole('button', { name: '1.0.0-alpha.3 is out · Update' }));

  expect(
    await screen.findByRole('button', { name: '1.0.0-alpha.3 is out · Update' }),
  ).toBeTruthy();
});
