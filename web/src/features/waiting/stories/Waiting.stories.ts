import type { Meta, StoryObj } from '@storybook/vue3';
import { withSnapshot } from '@/stories/with-snapshot.ts';
import Waiting from '../Waiting.vue';
import { waitingStorybookMock } from './Waiting.mock.ts';

type State = keyof typeof waitingStorybookMock;
interface Args {
  state: State;
}

const meta = {
  title: 'Islands/Waiting on others',
  component: Waiting,
  args: { state: 'default' } as never,
  argTypes: {
    state: { control: 'select', options: Object.keys(waitingStorybookMock), description: 'backlog: only your own tickets, nobody else holds the step' },
  } as never,
  decorators: [
    withSnapshot((args) => structuredClone(waitingStorybookMock[(args as unknown as Args).state])),
    () => ({ template: '<div style="height: 30rem; display: flex"><story /></div>' }),
  ],
} satisfies Meta<typeof Waiting>;

export default meta;

export const Panel: StoryObj<typeof meta> = {};
