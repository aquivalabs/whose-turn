import { afterEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/vue';
import ResizeHandle from './ResizeHandle.vue';

const bounds = { current: 200, min: 100, max: 400 };

const handle = (props: Record<string, unknown> = {}) =>
  render(ResizeHandle, {
    props: { label: 'Resize panel', axis: 'y', bounds: () => bounds, ...props },
  });

const separator = () => screen.getByRole('separator', { name: 'Resize panel' });

const pointer = (type: string, clientY: number, clientX = 0) => {
  const event = new MouseEvent(type, { clientX, clientY, bubbles: true, cancelable: true });
  Object.assign(event, { pointerId: 1 });
  return event;
};

afterEach(() => {
  bounds.current = 200;
  bounds.min = 100;
});

test('arrow keys step the size by 16 along the axis and ignore other keys', async () => {
  const { emitted } = handle();

  await fireEvent.keyDown(separator(), { key: 'ArrowDown' });
  await fireEvent.keyDown(separator(), { key: 'ArrowUp' });
  await fireEvent.keyDown(separator(), { key: 'ArrowRight' });
  await fireEvent.keyDown(separator(), { key: 'Enter' });

  expect(emitted().resize).toEqual([[216], [184]]);
});

test('a horizontal handle answers to the left and right arrows, reversed by grow -1', async () => {
  const { emitted } = handle({ axis: 'x', grow: -1 });

  await fireEvent.keyDown(separator(), { key: 'ArrowRight' });
  await fireEvent.keyDown(separator(), { key: 'ArrowDown' });

  expect(emitted().resize).toEqual([[184]]);
});

test('an arrow key at the minimum clamps to the minimum', async () => {
  bounds.current = 104;
  const { emitted } = handle();

  await fireEvent.keyDown(separator(), { key: 'ArrowUp' });

  expect(emitted().resize).toEqual([[100]]);
});

test('a pointer drag reports the start size plus the travel, clamped to the bounds', async () => {
  const capture = vi.fn();
  const { emitted } = handle();
  const target = separator();
  let captured = false;
  target.setPointerCapture = () => {
    captured = true;
    capture();
  };
  target.hasPointerCapture = () => captured;

  await fireEvent(target, pointer('pointerdown', 50));
  await fireEvent(target, pointer('pointermove', 80));
  await fireEvent(target, pointer('pointermove', -500));
  await fireEvent(target, pointer('pointermove', 900));

  expect(capture).toHaveBeenCalledOnce();
  expect(emitted().resize).toEqual([[230], [100], [400]]);
});

test('moving without a pointer grab reports nothing', async () => {
  const { emitted } = handle();
  const target = separator();
  target.hasPointerCapture = () => false;

  await fireEvent(target, pointer('pointermove', 80));

  expect(emitted().resize).toBeUndefined();
});

test('double click asks the caller to reset', async () => {
  const { emitted } = handle();

  await fireEvent.dblClick(separator());

  expect(emitted().reset).toHaveLength(1);
});

test('the handle keeps its drag hint for the tooltip', () => {
  handle();

  expect(separator().getAttribute('data-tip')).toBe('Drag to resize; double click to reset');
});
