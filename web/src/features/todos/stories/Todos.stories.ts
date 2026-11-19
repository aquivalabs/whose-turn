import type { Decorator, Meta, StoryObj } from '@storybook/vue3';
import { withSnapshot } from '@/stories/with-snapshot.ts';
import { answer, goOffline } from '@/stories/fake-server.ts';
import type { Todo } from '@/lib/types.ts';
import Todos from '../Todos.vue';
import { useTodosView } from '../useTodosView.ts';
import { todosStorybookMock } from './Todos.mock.ts';

type State = keyof typeof todosStorybookMock;
interface Args {
  state: State;
  showDone: boolean;
}

/** The to-do server for the story: unreachable in the failing state, otherwise it applies each change to a local list. */
const withTodoServer: Decorator = (story, context) => ({
  components: { story },
  setup: () => {
    const { state } = context.args as unknown as Args;
    if (state === 'failing') {
      goOffline();
      return;
    }
    let list: Todo[] = structuredClone(todosStorybookMock[state].todos);
    answer('/api/todos', (body) => {
      const stamp = new Date().toISOString();
      const { action, id, text } = body as { action?: string; id?: string; text?: string };
      if (action === 'add') {
        list = [{ id: `n${list.length + 1}`, text: text || '', done: null, created: stamp }, ...list];
      } else if (action === 'done' || action === 'undo') {
        list = list.map((todo) => (todo.id === id ? { ...todo, done: action === 'done' ? stamp : null } : todo));
      } else if (action === 'edit') {
        list = list.map((todo) => (todo.id === id ? { ...todo, text: text || todo.text } : todo));
      } else if (action === 'delete') {
        list = list.filter((todo) => todo.id !== id);
      }
      return list;
    });
  },
  template: '<story />',
});

const meta = {
  title: 'Islands/To do',
  component: Todos,
  args: { state: 'default', showDone: false } as never,
  argTypes: {
    state: { control: 'select', options: Object.keys(todosStorybookMock), description: 'failing: every change answers "server unreachable"' },
    showDone: { control: 'boolean', description: 'List the done items too' },
  } as never,
  decorators: [
    withSnapshot((args) => {
      const { state, showDone } = args as unknown as Args;
      useTodosView().value = showDone;
      return structuredClone(todosStorybookMock[state]);
    }),
    withTodoServer,
    () => ({ template: '<div style="height: 30rem; display: flex"><story /></div>' }),
  ],
} satisfies Meta<typeof Todos>;

export default meta;

export const Panel: StoryObj<typeof meta> = {};
