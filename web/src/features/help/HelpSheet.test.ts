import { afterEach, expect, test } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/vue';
import { computed, defineComponent, h } from 'vue';
import { ui } from '@/store.ts';
import { useShortcuts } from '@/composables/useKeyboard.ts';
import Rail from '@/features/rail/Rail.vue';
import HelpSheet from './HelpSheet.vue';

afterEach(() => {
  cleanup();
  ui.help = false;
});

const Host = defineComponent({
  setup() {
    useShortcuts(computed(() => false));
    return () => h('div', { class: 'app' }, [h(Rail), h(HelpSheet)]);
  },
});

test('the rail Help entry opens the shortcut list with the README link (RMA-447)', async () => {
  render(Host);
  expect(screen.queryByRole('dialog')).toBeNull();
  await fireEvent.click(screen.getByRole('link', { name: 'Help and shortcuts' }));
  expect(await screen.findByRole('dialog', { name: 'Help' })).toBeTruthy();
  expect(screen.getByText('Search the feed')).toBeTruthy();
  const link = screen.getByRole('link', { name: 'Read the README on GitHub' });
  expect(link.getAttribute('href')).toBe('https://github.com/aquivalabs/whose-turn#readme');
});

test('pressing ? opens Help (RMA-447)', async () => {
  render(Host);
  await fireEvent.keyDown(document, { key: '?', shiftKey: true });
  expect(await screen.findByRole('dialog', { name: 'Help' })).toBeTruthy();
});
