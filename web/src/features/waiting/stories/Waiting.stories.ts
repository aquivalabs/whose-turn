import type { Meta, StoryObj } from '@storybook/vue3';
import { withState } from '@/stories/with-state.ts';
import Waiting from '../Waiting.vue';
import { waitingStorybookMock } from './Waiting.mock.ts';

type State = keyof typeof waitingStorybookMock;

const meta = {
  title: 'Islands/Waiting on others',
  component: Waiting,
  args: { state: 'default' } as never,
  argTypes: {
    state: { control: 'select', options: Object.keys(waitingStorybookMock), description: 'backlog: only your own tickets, nobody else holds the step' },
  } as never,
  parameters: { frame: { height: '30rem' } },
  decorators: [withState<{ state: State }>(({ state }) => ({ snapshot: waitingStorybookMock[state] }))],
} satisfies Meta<typeof Waiting>;

export default meta;

export const Panel: StoryObj<typeof meta> = {};
