import type { Meta, StoryObj } from '@storybook/vue3';
import { withSnapshot } from '@/stories/with-snapshot.ts';
import NotificationsToggle from '../NotificationsToggle.vue';
import { notificationsToggleStorybookMock } from './NotificationsToggle.mock.ts';

const meta = {
  title: 'Islands/Status line/Notifications switch',
  component: NotificationsToggle,
  args: { state: 'on' } as never,
  argTypes: { state: { control: 'radio', options: Object.keys(notificationsToggleStorybookMock) } } as never,
  decorators: [
    withSnapshot((args) => structuredClone(notificationsToggleStorybookMock[(args as unknown as { state: 'on' | 'off' }).state])),
  ],
} satisfies Meta<typeof NotificationsToggle>;

export default meta;

export const Switch: StoryObj<typeof meta> = {};
