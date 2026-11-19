import type { Meta, StoryObj } from '@storybook/vue3';
import { withState } from '@/stories/with-state.ts';
import { demoWorkspace } from '@/stories/fixtures.ts';
import WorkspaceSettingsSheet from '../WorkspaceSettingsSheet.vue';
import { workspaceSettingsSheetStorybookMock } from './WorkspaceSettingsSheet.mock.ts';

interface Args {
  state: 'default' | 'empty' | 'refused' | 'unreachable';
}

const mock = workspaceSettingsSheetStorybookMock;

const meta = {
  title: 'Sheets/Workspace settings',
  component: WorkspaceSettingsSheet,
  args: { state: 'default' } as never,
  argTypes: {
    state: { control: 'select', options: ['default', 'empty', 'refused', 'unreachable'], description: 'empty: the new-workspace form; refused: Save answers with a field error' },
  } as never,
  decorators: [
    withState<Args>(({ state }) => ({
      snapshot: {
        workspaces: mock.default.workspaces.map(({ id, name }) => demoWorkspace({ id, name })),
        workspace: demoWorkspace(),
      },
      open: ['settings'],
      server:
        state === 'unreachable'
          ? 'offline'
          : {
              '/api/config': (_body, method) =>
                method === 'POST' && state === 'refused' ? { error: mock.refused.error } : state === 'empty' ? mock.empty : mock.default,
            },
    })),
  ],
} satisfies Meta<typeof WorkspaceSettingsSheet>;

export default meta;

export const Sheet: StoryObj<typeof meta> = {};
