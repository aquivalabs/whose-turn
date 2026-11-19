import type { Meta, StoryObj } from '@storybook/vue3';
import { withState } from '@/stories/with-state.ts';
import { snapshot } from '@/store.ts';
import Rail from '../Rail.vue';
import { railStorybookMock } from './Rail.mock.ts';

interface Args {
  state: keyof typeof railStorybookMock;
}

const meta = {
  title: 'Islands/Rail',
  component: Rail,
  args: { state: 'default' } as never,
  argTypes: { state: { control: 'select', options: Object.keys(railStorybookMock) } } as never,
  decorators: [
    withState<Args>(({ state }) => ({
      snapshot: { errors: {}, ...railStorybookMock[state] },
      server: { '/api/snapshot': () => snapshot },
    })),
  ],
  parameters: { frame: { height: '32rem' } },
} satisfies Meta<typeof Rail>;

export default meta;

export const Workspaces: StoryObj<typeof meta> = {};
