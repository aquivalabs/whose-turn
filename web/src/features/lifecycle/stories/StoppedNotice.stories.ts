import type { Meta, StoryObj } from '@storybook/vue3';
import { withSnapshot } from '@/stories/with-snapshot.ts';
import { ui } from '@/store.ts';
import StoppedNotice from '../StoppedNotice.vue';
import { stoppedNoticeStorybookMock } from './StoppedNotice.mock.ts';

const meta = {
  title: 'Sheets/Stopped notice',
  component: StoppedNotice,
  args: { state: 'quitting' } as never,
  argTypes: { state: { control: 'select', options: stoppedNoticeStorybookMock.states } } as never,
  decorators: [
    withSnapshot((args) => {
      ui.lifecycle = (args as { state: typeof ui.lifecycle }).state;
      return {};
    }),
  ],
} satisfies Meta<typeof StoppedNotice>;

export default meta;

export const Notice: StoryObj<typeof meta> = {};
