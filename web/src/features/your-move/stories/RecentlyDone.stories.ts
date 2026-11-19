import type { Meta, StoryObj } from '@storybook/vue3';
import { withSnapshot } from '@/stories/with-snapshot.ts';
import RecentlyDone from '../RecentlyDone.vue';
import { recentlyDoneStorybookMock } from './RecentlyDone.mock.ts';

type State = keyof typeof recentlyDoneStorybookMock;
interface Args {
  state: State;
  open: boolean;
}

const meta = {
  title: 'Islands/Your move/Recently done',
  component: RecentlyDone,
  args: { state: 'default', open: true } as never,
  argTypes: {
    state: { control: 'select', options: Object.keys(recentlyDoneStorybookMock), description: 'empty: the block hides itself' },
    open: { control: 'boolean', description: 'The fold, as remembered in the browser' },
  } as never,
  decorators: [
    withSnapshot((args) => {
      const { state, open } = args as unknown as Args;
      localStorage.setItem('wt-recent-open', open ? '1' : '0');
      return structuredClone(recentlyDoneStorybookMock[state]);
    }),
    () => ({ template: '<div style="width: 100%"><story /></div>' }),
  ],
} satisfies Meta<typeof RecentlyDone>;

export default meta;

export const Block: StoryObj<typeof meta> = {};
