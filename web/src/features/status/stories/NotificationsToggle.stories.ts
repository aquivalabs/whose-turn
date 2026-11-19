import type { Meta, StoryObj } from '@storybook/vue3';
import { withState } from '@/stories/with-state.ts';
import NotificationsToggle from '../NotificationsToggle.vue';
import { notificationsToggleStorybookMock } from './NotificationsToggle.mock.ts';

interface Args {
  state: keyof typeof notificationsToggleStorybookMock;
}

const meta = {
  title: 'Islands/Status line/Notifications switch',
  component: NotificationsToggle,
  args: { state: 'on' } as never,
  argTypes: { state: { control: 'radio', options: Object.keys(notificationsToggleStorybookMock) } } as never,
  decorators: [withState<Args>(({ state }) => ({ snapshot: notificationsToggleStorybookMock[state] }))],
} satisfies Meta<typeof NotificationsToggle>;

export default meta;

export const Switch: StoryObj<typeof meta> = {};
