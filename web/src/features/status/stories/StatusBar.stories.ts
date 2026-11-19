import type { Meta, StoryObj } from '@storybook/vue3';
import { withSnapshot } from '@/stories/with-snapshot.ts';
import { notice, ui } from '@/store.ts';
import StatusBar from '../StatusBar.vue';
import { statusBarStorybookMock } from './StatusBar.mock.ts';

type State = keyof typeof statusBarStorybookMock;
interface Args {
  state: State;
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
    withSnapshot((args) => {
      const { state, mode, notifications, reportNews, showNotice } = args as unknown as Args;
      ui.mode = mode;
      ui.reportNews = reportNews;
      ui.status = '';
      notice.value = showNotice ? 'The change was not saved' : '';
      return { ...structuredClone(statusBarStorybookMock[state]), notifications: { desktop: notifications } };
    }),
    () => ({ template: '<div style="min-width: 70rem"><story /></div>' }),
  ],
} satisfies Meta<typeof StatusBar>;

export default meta;

export const Line: StoryObj<typeof meta> = {};
