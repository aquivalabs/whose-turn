import type { Decorator, Meta, StoryObj } from '@storybook/vue3';
import { answer, goOffline } from '@/stories/fake-server.ts';
import ReportPage from '../ReportPage.vue';
import { reportPageStorybookMock } from './ReportPage.mock.ts';

type State = keyof typeof reportPageStorybookMock.states;
interface Args {
  state: State;
}

const withReportServer: Decorator = (story, context) => ({
  components: { story },
  setup: () => {
    const reply = reportPageStorybookMock.states[(context.args as unknown as Args).state];
    if (reply === null) {
      goOffline();
      return;
    }
    answer('/api/feedback', () => reply);
    answer('/api/workspaces', () => reportPageStorybookMock.workspaces);
  },
  template: '<story />',
});

const meta = {
  title: 'Pages/Report',
  component: ReportPage,
  args: { state: 'answered' } as never,
  argTypes: {
    state: { control: 'select', options: Object.keys(reportPageStorybookMock.states) },
  } as never,
  decorators: [withReportServer],
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ReportPage>;

export default meta;

export const Page: StoryObj<typeof meta> = {};
