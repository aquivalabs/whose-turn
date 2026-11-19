import type { Meta, StoryObj } from '@storybook/vue3';
import { withState } from '@/stories/with-state.ts';
import WorkspaceHeader from '../WorkspaceHeader.vue';
import { workspaceHeaderStorybookMock } from './WorkspaceHeader.mock.ts';

type State = keyof typeof workspaceHeaderStorybookMock;
interface Args {
  state: State;
  collapsed: boolean;
}

const meta = {
  title: 'Islands/Header',
  component: WorkspaceHeader,
  args: { state: 'default', collapsed: false } as never,
  argTypes: {
    state: { control: 'select', options: Object.keys(workspaceHeaderStorybookMock) },
    collapsed: { control: 'boolean', description: 'Folded to one line' },
  } as never,
  decorators: [
    withState<Args>(({ state, collapsed }) => ({
      snapshot: workspaceHeaderStorybookMock[state],
      storage: { 'wt-collapsed': JSON.stringify(collapsed ? ['header'] : []) },
    })),
  ],
} satisfies Meta<typeof WorkspaceHeader>;

export default meta;

export const Panel: StoryObj<typeof meta> = {};
