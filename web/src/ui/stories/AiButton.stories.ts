import type { Meta, StoryObj } from '@storybook/vue3';
import { withState } from '@/stories/with-state.ts';
import AiButton from '../AiButton.vue';
import { aiButtonStorybookMock } from './AiButton.mock.ts';

const withHandoff = withState<{ failing?: boolean }>((args) => ({
  server: args.failing ? 'offline' : { '/api/handoff': () => aiButtonStorybookMock.handoff },
}));

const meta = {
  title: 'Primitives/AiButton',
  component: AiButton,
  args: { query: aiButtonStorybookMock.query, big: false, failing: false } as never,
  argTypes: {
    big: { control: 'boolean' },
    failing: { control: 'boolean', description: 'The hand-off call fails, so the click shows the failure tip' },
  } as never,
  decorators: [withHandoff],
} satisfies Meta<typeof AiButton>;

export default meta;

export const Button: StoryObj<typeof meta> = {};
