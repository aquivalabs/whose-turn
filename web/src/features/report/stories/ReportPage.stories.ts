import type { Meta, StoryObj } from '@storybook/vue3';
import { withState } from '@/stories/with-state.ts';
import ReportPage from '../ReportPage.vue';
import { reportPageStorybookMock } from './ReportPage.mock.ts';

interface Args {
  state: keyof typeof reportPageStorybookMock.states;
}

const meta = {
  title: 'Pages/Report',
  component: ReportPage,
  args: { state: 'answered' } as never,
  argTypes: {
    state: { control: 'select', options: Object.keys(reportPageStorybookMock.states) },
  } as never,
  decorators: [
    withState<Args>(({ state }) => {
      const reply = reportPageStorybookMock.states[state];
      return {
        server:
          reply === null
            ? 'offline'
            : { '/api/feedback': () => reply, '/api/workspaces': () => reportPageStorybookMock.workspaces },
      };
    }),
  ],
  parameters: { layout: 'fullscreen', chrome: 'none' },
} satisfies Meta<typeof ReportPage>;

export default meta;

export const Page: StoryObj<typeof meta> = {};
