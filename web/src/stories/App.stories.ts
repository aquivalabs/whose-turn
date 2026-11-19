import type { Meta, StoryObj } from '@storybook/vue3';
import { withState } from '@/stories/with-state.ts';
import App from '../App.vue';
import { appStorybookMock } from './App.mock.ts';

interface Args {
  state: keyof typeof appStorybookMock;
  serverStopped: boolean;
}

const meta = {
  title: 'App/Window',
  component: App,
  args: { state: 'default', serverStopped: false } as never,
  argTypes: {
    state: { control: 'select', options: Object.keys(appStorybookMock) },
    serverStopped: { control: 'boolean', description: 'The window lost the server' },
  } as never,
  decorators: [
    withState<Args>(({ state, serverStopped }) => ({
      snapshot: appStorybookMock[state],
      ui: { lifecycle: serverStopped ? 'lost' : '' },
    })),
  ],
  parameters: { layout: 'fullscreen', chrome: 'none' },
} satisfies Meta<typeof App>;

export default meta;

export const Window: StoryObj<typeof meta> = {};
