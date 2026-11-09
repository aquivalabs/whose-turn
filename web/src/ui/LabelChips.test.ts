import { afterEach, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/vue';
import { nextTick } from 'vue';
import LabelChips from './LabelChips.vue';

const layout = (lineWidth: number, chipWidth: number) => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(lineWidth);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(chipWidth);
};

afterEach(() => {
  vi.restoreAllMocks();
});

test('every label shows when the line has room, the highlighted one in the accent style, and no hover text is needed', async () => {
  // Setup
  layout(400, 40);
  // Exercise
  const { container } = render(LabelChips, { props: { labels: ['User report', 'bug', 'p1'], badges: ['User report'] } });
  await nextTick();
  await nextTick();
  // Verify
  expect(screen.getByText('User report').className).toContain('label-chips__chip--badge');
  expect(screen.getByText('bug').className).not.toContain('--badge');
  expect(screen.queryByText(/^\+\d/)).toBeNull();
  expect(container.querySelector('.label-chips')?.getAttribute('data-tip')).toBeNull();
});

test('labels that do not fit the line fold into +N, and hovering the line names every label', async () => {
  // Setup
  layout(120, 40);
  // Exercise
  const { container } = render(LabelChips, { props: { labels: ['User report', 'bug', 'p1', 'frontend'], badges: ['User report'] } });
  await nextTick();
  await nextTick();
  // Verify
  const visible = [...container.querySelectorAll<HTMLElement>('.label-chips__chip')].filter((chip) => chip.style.display !== 'none').map((chip) => chip.textContent);
  expect(visible).toEqual(['User report', 'bug', '+2']);
  expect(container.querySelector('.label-chips')?.getAttribute('data-tip')).toBe('Labels: User report, bug, p1, frontend');
});

test('a row without labels draws nothing', () => {
  const { container } = render(LabelChips, { props: { labels: [] } });
  expect(container.querySelector('.label-chips')).toBeNull();
});
