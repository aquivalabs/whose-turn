import type { Decorator, Meta, StoryObj } from '@storybook/vue3';
import type { Todo } from '@/lib/types.ts';
import { ui } from '@/store.ts';
import { answer } from '@/stories/fake-server.ts';
import { withSnapshot } from '@/stories/with-snapshot.ts';
import App from '../App.vue';
import { appStorybookMock } from './App.mock.ts';

type State = keyof typeof appStorybookMock;
interface Args {
  state: State;
  serverStopped: boolean;
}

const withLifecycle: Decorator = (story, context) => ({
  components: { story },
  setup: () => {
    ui.lifecycle = (context.args as unknown as Args).serverStopped ? 'lost' : '';
    answer('/api/changelog', () => ({ versions: [] }));
    let list: Todo[] = structuredClone(appStorybookMock[(context.args as unknown as Args).state].todos ?? []);
    answer('/api/todos', (body) => {
      const { action, id, text } = body as { action?: string; id?: string; text?: string };
      const stamp = new Date().toISOString();
      if (action === 'add') {
        list = [{ id: `n${list.length + 1}`, text: text || '', done: null, created: stamp }, ...list];
      } else if (action === 'done' || action === 'undo') {
        list = list.map((todo) => (todo.id === id ? { ...todo, done: action === 'done' ? stamp : null } : todo));
      } else if (action === 'delete') {
        list = list.filter((todo) => todo.id !== id);
      }
      return list;
    });
  },
  template: '<story />',
});

const meta = {
  title: 'App/Window',
  component: App,
  args: { state: 'default', serverStopped: false } as never,
  argTypes: {
    state: { control: 'select', options: Object.keys(appStorybookMock) },
    serverStopped: { control: 'boolean', description: 'The window lost the server' },
  } as never,
  decorators: [
    withSnapshot((args) => structuredClone(appStorybookMock[(args as unknown as Args).state])),
    withLifecycle,
    () => ({ template: '<div style="height: 100vh; width: 100vw; position: fixed; inset: 0"><story /></div>' }),
  ],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof App>;

export default meta;

export const Window: StoryObj<typeof meta> = {};
