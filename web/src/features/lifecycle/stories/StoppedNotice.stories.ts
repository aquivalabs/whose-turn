import type { Meta, StoryObj } from '@storybook/vue3';
import { withState } from '@/stories/with-state.ts';
import type { ui } from '@/store.ts';
import StoppedNotice from '../StoppedNotice.vue';
import { stoppedNoticeStorybookMock } from './StoppedNotice.mock.ts';

const meta = {
  title: 'Sheets/Stopped notice',
  component: StoppedNotice,
  args: { state: 'quitting' } as never,
  argTypes: { state: { control: 'select', options: stoppedNoticeStorybookMock.states } } as never,
  decorators: [withState<{ state: typeof ui.lifecycle }>(({ state }) => ({ ui: { lifecycle: state } }))],
} satisfies Meta<typeof StoppedNotice>;

export default meta;

export const Notice: StoryObj<typeof meta> = {};
