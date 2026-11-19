import type { Meta, StoryObj } from '@storybook/vue3';
import { withSnapshot } from '@/stories/with-snapshot.ts';
import { ui } from '@/store.ts';
import CommentModal from '../CommentModal.vue';
import { commentModalStorybookMock } from './CommentModal.mock.ts';

type State = keyof typeof commentModalStorybookMock.items;

const meta = {
  title: 'Sheets/Comment',
  component: CommentModal,
  args: { state: 'formatted' } as never,
  argTypes: { state: { control: 'select', options: Object.keys(commentModalStorybookMock.items) } } as never,
  decorators: [
    withSnapshot((args) => {
      ui.modal = structuredClone(commentModalStorybookMock.items[(args as { state: State }).state]);
      return { workspace: structuredClone(commentModalStorybookMock.workspace) };
    }),
  ],
} satisfies Meta<typeof CommentModal>;

export default meta;

export const Sheet: StoryObj<typeof meta> = {};
