import type { Meta, StoryObj } from '@storybook/vue3';
import { withState } from '@/stories/with-state.ts';
import MonitorSettingsSheet from '../MonitorSettingsSheet.vue';
import { monitorHiddenWorkspaces, monitorSettingsSheetStorybookMock } from './MonitorSettingsSheet.mock.ts';

interface Args {
  state: 'default' | 'refused' | 'unreachable';
  hiddenWorkspaces: boolean;
}

const meta = {
  title: 'Sheets/Monitor settings',
  component: MonitorSettingsSheet,
  args: { state: 'default', hiddenWorkspaces: false } as never,
  argTypes: {
    state: { control: 'select', options: ['default', 'refused', 'unreachable'], description: 'refused: Save answers with a field error' },
    hiddenWorkspaces: { control: 'boolean', description: 'List parked and paused workspaces' },
  } as never,
  decorators: [
    withState<Args>(({ state, hiddenWorkspaces }) => ({
      snapshot: { workspaces: hiddenWorkspaces ? monitorHiddenWorkspaces : [] },
      open: ['monitor'],
      server:
        state === 'unreachable'
          ? 'offline'
          : {
              '/api/config': (_body, method) =>
                method === 'POST' && state === 'refused' ? { error: monitorSettingsSheetStorybookMock.refused.error } : monitorSettingsSheetStorybookMock.default,
            },
    })),
  ],
} satisfies Meta<typeof MonitorSettingsSheet>;

export default meta;

export const Sheet: StoryObj<typeof meta> = {};
