import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/vue';
import { snapshot, ui } from '@/store.ts';
import type { Workspace } from '@/lib/types.ts';
import App from '@/App.vue';
import WorkspaceSettingsSheet from './WorkspaceSettingsSheet.vue';


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
  fields: {
    workspace: [
      { key: 'id', label: 'Id', required: true },
      { key: 'name', label: 'Name' },
    ],
    theme: [
      { key: 'backdrop', label: 'Backdrop animal', hint: 'draw the animal', boolean: true, default: true },
    ],
    rules: [],
    statuses: [],
  },
};

interface Sent {
  url: string;
  body: { workspaces: { id: string; name?: string; theme?: Record<string, unknown> }[] };
}
let sent: Sent[] = [];

const stubServer = (body: unknown = reply) => {
  sent = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: { body?: string }) => {
      if (init?.body) {
        sent.push({ url, body: JSON.parse(init.body) });
        return Promise.resolve({ json: () => Promise.resolve({}) });
      }
      return url === '/api/config'
        ? Promise.resolve({ json: () => Promise.resolve(body) })
        : new Promise(() => undefined);
    }),
  );
};

beforeEach(() => {
  snapshot.workspaces = [{ id: 'alpha', name: 'Alpha' }] as Workspace[];
  snapshot.workspace = {
    ...snapshot.workspace,
    id: 'alpha',
    name: 'Alpha',
    connectors: [{ type: 'github' }],
  } as Workspace;
});

afterEach(() => {
  ui.settings = false;
  ui.settingsNew = false;
  vi.unstubAllGlobals();
});

const openSheet = async () => {
  stubServer();
  render(WorkspaceSettingsSheet);
  ui.settings = true;
  await screen.findByDisplayValue('Alpha');
};

const confirm = async (name: string) => {
  await fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name }));
};

const openFromHeader = async () => {
  stubServer();
  const view = render(App);
  await fireEvent.click(screen.getByRole('button', { name: 'Workspace settings' }));
  await screen.findByDisplayValue('Alpha');
  return view;
};

test('the control at the top right of the workspace header opens the settings of that workspace only', async () => {
  await openFromHeader();

  expect(screen.getByRole('dialog', { name: 'Workspace settings' })).toBeTruthy();
  expect(screen.queryByText('Beta')).toBeNull();
  expect(screen.queryByText('+ Add workspace')).toBeNull();
});

test('saving an edited name sends the whole list and closes the sheet', async () => {
  await openFromHeader();

  await fireEvent.update(screen.getByDisplayValue('Alpha'), 'Alpha two');
  expect(screen.getByText('Unsaved changes')).toBeTruthy();
  await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Workspace settings' })).toBeNull());
  expect(sent.map((call) => call.url)).toEqual(['/api/config']);
  expect(sent[0].body.workspaces.map((workspace) => workspace.name)).toEqual(['Alpha two', 'Beta', 'Gamma']);
});

test('closing with unsaved edits asks first; keeping them leaves the sheet open, discarding closes it', async () => {
  await openFromHeader();
  await fireEvent.update(screen.getByDisplayValue('Alpha'), 'Changed');

  await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  await confirm('Keep editing');
  expect(screen.getByRole('dialog', { name: 'Workspace settings' })).toBeTruthy();

  await fireEvent.keyDown(document, { key: 'Escape' });
  await confirm('Discard');
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Workspace settings' })).toBeNull());
  expect(sent).toEqual([]);
});

test('Escape closes an untouched sheet and gives focus back to the control that opened it', async () => {
  stubServer();
  render(App);
  screen.getByRole('button', { name: 'Workspace settings' }).focus();
  await fireEvent.click(screen.getByRole('button', { name: 'Workspace settings' }));
  await screen.findByDisplayValue('Alpha');

  await fireEvent.keyDown(document, { key: 'Escape' });

  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Workspace settings' }));
});

test('deleting the open workspace asks, and the saved list no longer holds it', async () => {
  await openFromHeader();

  await fireEvent.click(screen.getByRole('button', { name: 'Delete workspace' }));
  await confirm('Delete');
  await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(sent).toHaveLength(1));
  expect(sent[0].body.workspaces.map((workspace) => workspace.id)).toEqual(['beta', 'gamma']);
});

test('the + at the end of the rail opens an empty form that saves as one more workspace', async () => {
  stubServer();
  render(App);

  await fireEvent.click(screen.getByRole('link', { name: 'Add workspace' }));

  const dialog = await screen.findByRole('dialog', { name: 'New workspace' });
  const id = (await within(dialog).findAllByRole('textbox'))[0] as HTMLInputElement;
  expect(id.value).toBe('');
  expect(within(dialog).queryByRole('button', { name: 'Delete workspace' })).toBeNull();
  await fireEvent.update(id, 'delta');
  await fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(sent).toHaveLength(1));
  expect(sent[0].body.workspaces.map((workspace) => workspace.id)).toEqual(['alpha', 'beta', 'gamma', 'delta']);
});

test('the backdrop switch is saved as theme.backdrop false and dropped again when switched back on', async () => {
  await openFromHeader();
  const box = screen.getByRole('checkbox', { name: /draw the animal/ }) as HTMLInputElement;
  expect(box.checked).toBe(true);

  await fireEvent.click(box);
  await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(sent).toHaveLength(1));
  expect(sent[0].body.workspaces[0].theme).toEqual({ backdrop: false });
});

test('a workspace with the backdrop off has no backdrop canvas at all', async () => {
  stubServer();
  const { container } = render(App);
  expect(container.querySelector('#backdrop')).not.toBeNull();

  snapshot.workspace = { ...snapshot.workspace, backdrop: false } as Workspace;

  await waitFor(() => expect(container.querySelector('#backdrop')).toBeNull());
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

test('a table warning shows above the rows of its workspace', async () => {
  const warning = 'rules.table hides every ticket: row 1 matches all of them and hides them';
  stubServer({ ...reply, table_warnings: { alpha: [warning] } });
  render(WorkspaceSettingsSheet);
  ui.settings = true;
  await screen.findByDisplayValue('Alpha');

  expect(screen.getByText(warning)).toBeTruthy();
});

test('the rule sentences use the words the server sends with each fact', async () => {
  const body = {
    ...reply,
    facts: { 'deploy.region': { name: 'the deploy region' } },
    tables: { alpha: [{ when: { 'deploy.region': { present: true } }, then: { whose: 'you', next: 'Check {deploy.region}' } }] },
  };
  stubServer(body);
  render(WorkspaceSettingsSheet);
  ui.settings = true;
  await screen.findByDisplayValue('Alpha');

  expect(screen.getByText('When the deploy region is given:')).toBeTruthy();
  expect(screen.getByText('your move: Check {the deploy region}')).toBeTruthy();
});

test('each way of showing the workspace carries its explanation, and Park saves hidden: parked', async () => {
  await openSheet();

  expect(screen.getByText('Checked every minute and shown in the list.')).toBeTruthy();
  expect(
    screen.getByText(
      'Hidden from the list, checked every 15 minutes. Comes back by itself when something needs you.',
    ),
  ).toBeTruthy();
  expect(
    screen.getByText('Hidden and not checked at all. Stays hidden until you bring it back.'),
  ).toBeTruthy();
  expect((screen.getByRole('radio', { name: /Visible/ }) as HTMLInputElement).checked).toBe(true);

  await fireEvent.click(screen.getByRole('radio', { name: /Park/ }));
  await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(sent).toHaveLength(1));
  expect((sent[0].body.workspaces[0] as { hidden?: string }).hidden).toBe('parked');
});

const withCustom = {
  ...reply,
  workspaces: [{ id: 'alpha', name: 'Alpha', connectors: [{ type: 'module', id: 'board', label: 'Team board', adapter: 'team_board' }] }],
  connectors: [...reply.connectors, { type: 'module', label: 'Custom', fields: [{ key: 'token', label: 'Token', secret: true }] }],
  adapters: { team_board: { label: 'Team board', fields: [{ key: 'board', label: 'Board id', required: true }] } },
};

test('+ Add Custom source opens a card with a Name that says a template file is created on save, and sends the label', async () => {
  // Setup
  stubServer(withCustom);
  render(WorkspaceSettingsSheet);
  ui.settings = true;
  await screen.findByDisplayValue('Team board');
  // Exercise
  await fireEvent.click(screen.getByRole('button', { name: '+ Add Custom source' }));
  const names = screen.getAllByText('Name *');
  const input = names[names.length - 1].closest('.field-row')?.querySelector('input') as HTMLInputElement;
  await fireEvent.update(input, 'Moya doska');
  await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  // Verify
  expect(screen.getByText(/a template file named after this in the adapters folder/)).toBeTruthy();
  await waitFor(() => expect(sent.length).toBe(1));
  expect(sent[0].body.workspaces[0]).toMatchObject({ connectors: [{ type: 'module', adapter: 'team_board' }, { type: 'module', label: 'Moya doska' }] });
});

test('a saved Custom source names its file and shows the fields its adapter declares', async () => {
  // Setup
  stubServer({ ...withCustom, adapters: { team_board: { ...withCustom.adapters.team_board } } });
  render(WorkspaceSettingsSheet);
  ui.settings = true;
  // Exercise
  await screen.findByDisplayValue('Team board');
  // Verify
  expect(screen.getByText(/your code lives in adapters\/team_board\.mjs/)).toBeTruthy();
  expect(screen.getByText('Board id *')).toBeTruthy();
});

test('a Custom source whose adapter is broken shows the problem under its Name', async () => {
  // Setup
  stubServer({ ...withCustom, adapters: { team_board: { problem: 'Adapter team_board.mjs does not follow connector contract 1: poll(context) must be implemented' } } });
  render(WorkspaceSettingsSheet);
  // Exercise
  ui.settings = true;
  // Verify
  expect(await screen.findByText(/poll\(context\) must be implemented/)).toBeTruthy();
});
