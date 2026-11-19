import type { Meta, StoryObj } from '@storybook/vue3';
import { withState } from '@/stories/with-state.ts';
import CommentModal from '../CommentModal.vue';
import { commentModalStorybookMock } from './CommentModal.mock.ts';

type State = keyof typeof commentModalStorybookMock.items;

const meta = {
  title: 'Sheets/Comment',
  component: CommentModal,
  args: { state: 'formatted' } as never,
  argTypes: { state: { control: 'select', options: Object.keys(commentModalStorybookMock.items) } } as never,
  decorators: [
    withState<{ state: State }>(({ state }) => ({
      snapshot: { workspace: commentModalStorybookMock.workspace },
      ui: { modal: structuredClone(commentModalStorybookMock.items[state]) },
    })),
  ],
} satisfies Meta<typeof CommentModal>;

export default meta;

export const Sheet: StoryObj<typeof meta> = {};
