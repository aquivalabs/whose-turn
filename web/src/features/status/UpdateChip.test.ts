import type * as Api from '@/lib/api.ts';
import type { UpdateStatus } from '@/lib/types.ts';
import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/vue';
import { nextTick } from 'vue';
import { snapshot, ui } from '@/store.ts';
import { post } from '@/lib/api.ts';
import { rememberUpdated, reloadPage, takeUpdated } from '@/lib/page-reload.ts';
import UpdateChip from './UpdateChip.vue';

// The network boundary: post is the only call that leaves the window.
vi.mock('@/lib/api.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof Api>()),
  post: vi.fn(),
}));
// The browser boundary: a test cannot reload its own page.
vi.mock('@/lib/page-reload.ts', () => ({ rememberUpdated: vi.fn(), reloadPage: vi.fn(), takeUpdated: vi.fn(() => '') }));

const offer = (extra: Partial<UpdateStatus> = {}): UpdateStatus => ({
  current: '1.0.0-alpha.2',
  latest: '1.0.0-alpha.3',
  available: true,
  state: 'idle',
  ...extra,
});

beforeEach(() => {
  vi.mocked(post).mockReset();
  vi.mocked(reloadPage).mockReset();
  vi.mocked(rememberUpdated).mockReset();
  vi.mocked(takeUpdated).mockReturnValue('');
  ui.live = true;
  ui.whatsNew = false;
  snapshot.update = offer({ latest: '1.0.0-alpha.2', available: false });
});

test('no chip while nothing newer is out', () => {
  const { container } = render(UpdateChip);

  expect(container.textContent).toBe('');
});

test('the offer installs on click: Installing, then Restarting, then a Reload prompt once the server runs the new version', async () => {
  snapshot.update = offer();
  vi.mocked(post).mockResolvedValue({ update: offer({ state: 'installing' }) });
  render(UpdateChip);

  await fireEvent.click(screen.getByRole('button', { name: '1.0.0-alpha.3 is out · Update' }));

  expect(post).toHaveBeenCalledWith('/api/update');
  expect(await screen.findByText('Installing 1.0.0-alpha.3…')).toBeTruthy();

  snapshot.update = offer({ state: 'restarting' });
  await nextTick();
  expect(screen.getByText('Restarting…')).toBeTruthy();

  snapshot.update = offer({ current: '1.0.0-alpha.3', available: false });
  const reload = await screen.findByRole('button', { name: 'Updated to 1.0.0-alpha.3 · Reload' });
  expect(reloadPage).not.toHaveBeenCalled();

  await fireEvent.click(reload);
  expect(rememberUpdated).toHaveBeenCalledWith('1.0.0-alpha.3');
  expect(reloadPage).toHaveBeenCalledOnce();
});

test('the stream dropping during an update reads Restarting', async () => {
  snapshot.update = offer();
  vi.mocked(post).mockResolvedValue({ update: offer({ state: 'installing' }) });
  render(UpdateChip);

  await fireEvent.click(screen.getByRole('button', { name: '1.0.0-alpha.3 is out · Update' }));
  ui.live = false;

  expect(await screen.findByText('Restarting…')).toBeTruthy();
});

test('a version change under an open window, from the session hook, asks for a reload too', async () => {
  snapshot.update = offer({ latest: '1.0.0-alpha.2', available: false });
  render(UpdateChip);

  snapshot.update = offer({ current: '1.0.0-alpha.3', latest: '1.0.0-alpha.3', available: false });

  expect(await screen.findByRole('button', { name: 'Updated to 1.0.0-alpha.3 · Reload' })).toBeTruthy();
});

test('after the reload the chip announces the new version once', async () => {
  vi.mocked(takeUpdated).mockReturnValue('1.0.0-alpha.3');
  snapshot.update = offer({ current: '1.0.0-alpha.3', latest: '1.0.0-alpha.3', available: false });
  render(UpdateChip);

  const chip = await screen.findByRole('button', { name: 'Updated to 1.0.0-alpha.3' });

  await fireEvent.click(chip);

  expect(ui.whatsNew).toBe(true);
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

const clipboard = () => {
  const writeText = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  return writeText;
};

const withPlugin = (state: 'updated' | 'manual' | 'failed', copy: string) => {
  snapshot.update = offer({ available: false, latest: '1.0.0-alpha.2', plugin: { state, copy } });
};

test('after a plugin update the chip copies the text the server chose, says Copied, and tells the server', async () => {
  const writeText = clipboard();
  withPlugin('updated', '/reload-plugins --force');
  vi.mocked(post).mockResolvedValue({ update: offer({ available: false, latest: '1.0.0-alpha.2' }) });
  render(UpdateChip);

  await fireEvent.click(await screen.findByRole('button', { name: 'Reload Claude skill · Copy' }));

  expect(writeText).toHaveBeenCalledWith('/reload-plugins --force');
  expect(await screen.findByText('Copied')).toBeTruthy();
  expect(post).toHaveBeenCalledWith('/api/update/plugin-copied');
  expect(snapshot.update.plugin).toBeUndefined();
});

test.each(['manual', 'failed'] as const)('a %s plugin update shows the Update Claude skill chip, which copies the command', async (state) => {
  const writeText = clipboard();
  withPlugin(state, 'claude plugin update whose-turn@bladeforge');
  vi.mocked(post).mockResolvedValue({ update: offer({ available: false, latest: '1.0.0-alpha.2' }) });
  render(UpdateChip);

  await fireEvent.click(await screen.findByRole('button', { name: 'Update Claude skill · Copy' }));

  expect(writeText).toHaveBeenCalledWith('claude plugin update whose-turn@bladeforge');
});

test('a refused copy says so and leaves the chip for the server to keep', async () => {
  clipboard().mockRejectedValue(new Error('denied'));
  withPlugin('updated', '/reload-plugins --force');
  render(UpdateChip);

  await fireEvent.click(await screen.findByRole('button', { name: 'Reload Claude skill · Copy' }));
  await nextTick();

  expect(post).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Reload Claude skill · Copy' })).toBeTruthy();
});

test('a newer monitor version wins over the plugin chip, and no plugin result shows nothing', async () => {
  snapshot.update = offer({ plugin: { state: 'manual', copy: 'claude plugin update whose-turn@bladeforge' } });
  const { container } = render(UpdateChip);

  expect(await screen.findByRole('button', { name: '1.0.0-alpha.3 is out · Update' })).toBeTruthy();
  expect(container.textContent).not.toContain('Claude skill');
});

test('a plugin behind the marketplace shows a calm Update Claude skill chip that names the latest version (RMA-350)', async () => {
  clipboard();
  snapshot.update = offer({ available: false, latest: '1.0.0-alpha.2', plugin: { state: 'behind', copy: 'claude plugin update whose-turn@bladeforge', seen: '1.0.12', latest: '1.0.14' } });
  render(UpdateChip);

  const chip = await screen.findByRole('button', { name: 'Update Claude skill · Copy' });

  expect(chip.className).not.toContain('update-chip--failed');
  expect(chip.getAttribute('data-tip') || chip.getAttribute('title') || '').toContain('older than 1.0.14');
});
