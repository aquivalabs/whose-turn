import type * as Api from '@/lib/api.ts';
import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import AiButton from './AiButton.vue';
import { handOffText } from '@/lib/api.ts';

vi.mock('@/lib/api.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof Api>()),
  handOffText: vi.fn(),
}));

const clipboard = () => {
  const write = vi.fn(async (items: ClipboardItem[]) => {
    await items[0]!.getType('text/plain');
  });
  Object.defineProperty(navigator, 'clipboard', { value: { write }, configurable: true });
  return write;
};

beforeEach(() => {
  vi.mocked(handOffText).mockReset();
});

test('the AI button copies the hand-off text of its item and says Copied (RMA-416)', async () => {
  const write = clipboard();
  vi.mocked(handOffText).mockResolvedValue('PROJ-123 needs your review');
  render(AiButton, { props: { query: { row: 'PROJ-123' } } });
  await flushPromises();

  await fireEvent.click(screen.getByRole('button'));

  await vi.waitFor(() => expect(screen.getByRole('button').dataset.tip).toBe('Copied'));
  expect(handOffText).toHaveBeenCalledWith({ row: 'PROJ-123' });
  expect(await (await write.mock.calls[0]![0][0]!.getType('text/plain')).text()).toBe('PROJ-123 needs your review');
});

test('the AI button says the copy failed when the hand-off text cannot be read', async () => {
  clipboard();
  vi.mocked(handOffText).mockRejectedValue(new Error('unreachable'));
  render(AiButton, { props: { query: { row: 'PROJ-123' } } });
  await flushPromises();

  await fireEvent.click(screen.getByRole('button'));

  await vi.waitFor(() => expect(screen.getByRole('button').classList.contains('ai-button--failed')).toBe(true));
});
