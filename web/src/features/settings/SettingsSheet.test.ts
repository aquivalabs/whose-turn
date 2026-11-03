import { afterEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/vue';
import { ui } from '@/store.ts';
import SettingsSheet from './SettingsSheet.vue';

vi.mock('@/backdrop.ts', () => ({ show: vi.fn(), repaint: vi.fn(), seeded: vi.fn() }));

const reply = {
  workspaces: [
    { id: 'alpha', name: 'Alpha', connectors: [{ type: 'github' }, { type: 'jira' }] },
    { id: 'beta', name: 'Beta' },
    { id: 'gamma', name: 'Gamma' },
  ],
  connectors: [
    { type: 'github', label: 'GitHub', fields: [{ key: 'token', label: 'Token', secret: true }] },
    { type: 'jira', label: 'Jira', fields: [{ key: 'token', label: 'Token', secret: true }] },
  ],
  fields: { workspace: [], theme: [], rules: [], statuses: [] },
};

afterEach(() => {
  ui.settings = false;
  vi.unstubAllGlobals();
});

const openSheet = async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: () => Promise.resolve(reply) }));
  render(SettingsSheet);
  ui.settings = true;
  await screen.findByText('Alpha');
};

const confirm = async (name: string) => {
  await fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name }));
};

test('removing a middle workspace keeps the rest in order and selects its neighbour', async () => {
  await openSheet();
  await fireEvent.click(screen.getByText('Beta'));

  await fireEvent.click(screen.getByRole('button', { name: 'Delete workspace' }));
  await confirm('Delete');

  const tabs = screen
    .getAllByRole('button')
    .map((button) => button.textContent?.trim())
    .filter((text) => ['Alpha', 'Beta', 'Gamma'].includes(text || ''));
  expect(tabs).toEqual(['Alpha', 'Gamma']);
  expect(screen.getByText('Unsaved changes')).toBeTruthy();
});

test('removing the first connector leaves a secret typed into the second where it was', async () => {
  await openSheet();
  const [, jiraToken] = screen.getAllByPlaceholderText('paste to replace');
  await fireEvent.update(jiraToken, 'jira-secret');

  await fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
  await confirm('Remove');

  const remaining = screen.getAllByPlaceholderText('paste to replace');
  expect(remaining).toHaveLength(1);
  expect((remaining[0] as HTMLInputElement).value).toBe('jira-secret');
  expect(screen.getByText('Jira')).toBeTruthy();
});
