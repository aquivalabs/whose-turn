import type { Meta, StoryObj } from '@storybook/vue3';
import { withSnapshot } from '@/stories/with-snapshot.ts';
import { useFold } from '@/composables/useFold.ts';
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
    withSnapshot((args) => {
      const { state, collapsed } = args as unknown as Args;
      useFold('header').folded.value = collapsed ? ['header'] : [];
      return structuredClone(workspaceHeaderStorybookMock[state]);
    }),
    () => ({ template: '<div class="dashboard"><story /></div>' }),
  ],
} satisfies Meta<typeof WorkspaceHeader>;

export default meta;

export const Panel: StoryObj<typeof meta> = {};
