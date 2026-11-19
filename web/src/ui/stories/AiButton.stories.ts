import type { Decorator, Meta, StoryObj } from '@storybook/vue3';
import { answer, goOffline } from '@/stories/fake-server.ts';
import AiButton from '../AiButton.vue';
import { aiButtonStorybookMock } from './AiButton.mock.ts';

const withHandoff: Decorator = (story, context) => ({
  components: { story },
  setup: () => {
    if ((context.args as { failing?: boolean }).failing) {
      goOffline();
      return;
    }
    answer('/api/handoff', () => aiButtonStorybookMock.handoff);
  },
  template: '<story />',
});

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
