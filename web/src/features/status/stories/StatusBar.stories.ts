import type { Meta, StoryObj } from '@storybook/vue3';
import { withState } from '@/stories/with-state.ts';
import { notice } from '@/store.ts';
import StatusBar from '../StatusBar.vue';
import { statusBarStorybookMock } from './StatusBar.mock.ts';

interface Args {
  state: keyof typeof statusBarStorybookMock;
  mode: 'app' | 'tab';
  notifications: boolean;
  reportNews: boolean;
  showNotice: boolean;
}

const meta = {
  title: 'Islands/Status line',
  component: StatusBar,
  args: { state: 'default', mode: 'tab', notifications: true, reportNews: false, showNotice: false } as never,
  argTypes: {
    state: { control: 'select', options: Object.keys(statusBarStorybookMock) },
    mode: { control: 'radio', options: ['tab', 'app'], description: 'Tab offers "Open as app", app offers "Open in browser"' },
    notifications: { control: 'boolean' },
    reportNews: { control: 'boolean', description: 'The Report button shows its news dot' },
    showNotice: { control: 'boolean', description: 'A refused write puts a notice into the line' },
  } as never,
  decorators: [
    withState<Args>(({ state, mode, notifications, reportNews, showNotice }) => {
      notice.value = showNotice ? 'The change was not saved' : '';
      return {
        snapshot: { ...statusBarStorybookMock[state], notifications: { desktop: notifications } },
        ui: { mode, reportNews, status: '' },
      };
    }),
  ],
  parameters: { frame: { width: '70rem' } },
} satisfies Meta<typeof StatusBar>;

export default meta;

export const Line: StoryObj<typeof meta> = {};
