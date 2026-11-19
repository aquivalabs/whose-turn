import type { Meta, StoryObj } from '@storybook/vue3';
import { withState } from '@/stories/with-state.ts';
import Feed from '../Feed.vue';
import { useFeedState } from '../useFeedState.ts';
import { feedStorybookMock } from './Feed.mock.ts';

type State = keyof typeof feedStorybookMock;
interface Args {
  state: State;
  view: 'ticket' | 'flat';
  open: boolean;
}

const meta = {
  title: 'Islands/What changed',
  component: Feed,
  args: { state: 'default', view: 'ticket', open: false } as never,
  argTypes: {
    state: { control: 'select', options: Object.keys(feedStorybookMock) },
    view: { control: 'radio', options: ['ticket', 'flat'] },
    open: { control: 'boolean', description: 'Every ticket group open' },
  } as never,
  parameters: { frame: { height: '36rem' } },
  decorators: [
    withState<Args>(({ state, view, open }) => {
      const feedState = useFeedState();
      feedState.view = view;
      feedState.query = '';
      feedState.openGroups.clear();
      const slice = feedStorybookMock[state];
      if (open) {
        slice.feed.forEach((item) => feedState.openGroups.add(item.key || item.ref));
      }
      return { snapshot: slice };
    }),
  ],
} satisfies Meta<typeof Feed>;

export default meta;

export const Panel: StoryObj<typeof meta> = {};
