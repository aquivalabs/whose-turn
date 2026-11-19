import type { Decorator, Meta, StoryObj } from '@storybook/vue3';
import { onMounted } from 'vue';
import { snapshot, ui } from '@/store.ts';
import { answer, goOffline } from '@/stories/fake-server.ts';
import type { Workspace } from '@/lib/types.ts';
import MonitorSettingsSheet from '../MonitorSettingsSheet.vue';
import { monitorHiddenWorkspaces, monitorSettingsSheetStorybookMock } from './MonitorSettingsSheet.mock.ts';

type State = 'default' | 'refused' | 'unreachable';
interface Args {
  state: State;
  hiddenWorkspaces: boolean;
}

const withMonitorServer: Decorator = (story, context) => ({
  components: { story },
  setup: () => {
    const { state, hiddenWorkspaces } = context.args as unknown as Args;
    snapshot.workspaces = (hiddenWorkspaces ? monitorHiddenWorkspaces : []) as Workspace[];
    ui.monitor = false;
    if (state === 'unreachable') {
      goOffline();
    } else {
      answer('/api/config', (_body, method) =>
        method === 'POST' && state === 'refused' ? { error: monitorSettingsSheetStorybookMock.refused.error } : monitorSettingsSheetStorybookMock.default,
      );
      answer('/api/notifications', () => ({}));
    }
    onMounted(() => {
      ui.monitor = true;
    });
  },
  template: '<story />',
});

const meta = {
  title: 'Sheets/Monitor settings',
  component: MonitorSettingsSheet,
  args: { state: 'default', hiddenWorkspaces: false } as never,
  argTypes: {
    state: { control: 'select', options: ['default', 'refused', 'unreachable'], description: 'refused: Save answers with a field error' },
    hiddenWorkspaces: { control: 'boolean', description: 'List parked and paused workspaces' },
  } as never,
  decorators: [withMonitorServer],
} satisfies Meta<typeof MonitorSettingsSheet>;

export default meta;

export const Sheet: StoryObj<typeof meta> = {};
