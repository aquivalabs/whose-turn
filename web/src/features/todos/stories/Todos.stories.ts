import type { Meta, StoryObj } from '@storybook/vue3';
import { withState } from '@/stories/with-state.ts';
import Todos from '../Todos.vue';
import { useTodosView } from '../useTodosView.ts';
import { todosStorybookMock } from './Todos.mock.ts';

type State = keyof typeof todosStorybookMock;
interface Args {
  state: State;
  showDone: boolean;
}

const meta = {
  title: 'Islands/To do',
  component: Todos,
  args: { state: 'default', showDone: false } as never,
  argTypes: {
    state: { control: 'select', options: Object.keys(todosStorybookMock), description: 'failing: every change answers "server unreachable"' },
    showDone: { control: 'boolean', description: 'List the done items too' },
  } as never,
  parameters: { frame: { height: '30rem' } },
  decorators: [
    withState<Args>(({ state, showDone }) => {
      useTodosView().value = showDone;
      return { snapshot: todosStorybookMock[state], server: state === 'failing' ? 'offline' : undefined };
    }),
  ],
} satisfies Meta<typeof Todos>;

export default meta;

export const Panel: StoryObj<typeof meta> = {};
