import type { Meta, StoryObj } from '@storybook/vue3';
import { withState } from '@/stories/with-state.ts';
import YourMove from '../YourMove.vue';
import { useMoveView } from '../useMoveView.ts';
import { yourMoveStorybookMock } from './YourMove.mock.ts';

type State = keyof typeof yourMoveStorybookMock;
interface Args {
  state: State;
  view: 'open' | 'handled';
}

const meta = {
  title: 'Islands/Your move',
  component: YourMove,
  args: { state: 'default', view: 'open' } as never,
  argTypes: {
    state: { control: 'select', options: Object.keys(yourMoveStorybookMock), description: 'failing: every mark answers "server unreachable"' },
    view: { control: 'radio', options: ['open', 'handled'] },
  } as never,
  parameters: { frame: { height: '40rem' } },
  decorators: [
    withState<Args>(({ state, view }) => {
      useMoveView().value = view;
      return { snapshot: yourMoveStorybookMock[state], server: state === 'failing' ? 'offline' : undefined };
    }),
  ],
} satisfies Meta<typeof YourMove>;

export default meta;

export const Panel: StoryObj<typeof meta> = {};
