import type { Decorator, Meta, StoryObj } from '@storybook/vue3';
import { onMounted } from 'vue';
import { snapshot, ui } from '@/store.ts';
import { answer, goOffline } from '@/stories/fake-server.ts';
import type { Workspace } from '@/lib/types.ts';
import WorkspaceSettingsSheet from '../WorkspaceSettingsSheet.vue';
import { workspaceSettingsSheetStorybookMock } from './WorkspaceSettingsSheet.mock.ts';

type State = 'default' | 'empty' | 'refused' | 'unreachable';
interface Args {
  state: State;
}

const withWorkspaceServer: Decorator = (story, context) => ({
  components: { story },
  setup: () => {
    const { state } = context.args as unknown as Args;
    const mock = workspaceSettingsSheetStorybookMock;
    snapshot.workspaces = mock.default.workspaces.map(({ id, name }) => ({ id, name })) as Workspace[];
    snapshot.workspace = { ...snapshot.workspace, id: 'demo', name: 'Demo' } as Workspace;
    ui.settings = false;
    ui.settingsNew = false;
    if (state === 'unreachable') {
      goOffline();
    } else {
      answer('/api/config', (_body, method) =>
        method === 'POST' && state === 'refused' ? { error: mock.refused.error } : state === 'empty' ? mock.empty : mock.default,
      );
    }
    onMounted(() => {
      ui.settings = true;
    });
  },
  template: '<story />',
});

const meta = {
  title: 'Sheets/Workspace settings',
  component: WorkspaceSettingsSheet,
  args: { state: 'default' } as never,
  argTypes: {
    state: { control: 'select', options: ['default', 'empty', 'refused', 'unreachable'], description: 'empty: the new-workspace form; refused: Save answers with a field error' },
  } as never,
  decorators: [withWorkspaceServer],
} satisfies Meta<typeof WorkspaceSettingsSheet>;

export default meta;

export const Sheet: StoryObj<typeof meta> = {};
