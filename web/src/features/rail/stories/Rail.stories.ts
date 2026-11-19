import type { Meta, StoryObj } from '@storybook/vue3';
import { withSnapshot } from '@/stories/with-snapshot.ts';
import { answer } from '@/stories/fake-server.ts';
import { snapshot } from '@/store.ts';
import Rail from '../Rail.vue';
import { railStorybookMock } from './Rail.mock.ts';

type State = keyof typeof railStorybookMock;
interface Args {
  state: State;
}

const meta = {
  title: 'Islands/Rail',
  component: Rail,
  args: { state: 'default' } as never,
  argTypes: { state: { control: 'select', options: Object.keys(railStorybookMock) } } as never,
  decorators: [
    withSnapshot((args) => ({ errors: {}, ...structuredClone(railStorybookMock[(args as unknown as Args).state]) })),
    (story) => ({
      components: { story },
      setup: () => {
        answer('/api/workspaces/order', () => ({}));
        answer('/api/snapshot', () => snapshot);
      },
      template: '<story />',
    }),
    () => ({ template: '<div style="position: relative; height: 32rem; transform: translateZ(0)"><story /></div>' }),
  ],
} satisfies Meta<typeof Rail>;

export default meta;

export const Workspaces: StoryObj<typeof meta> = {};
