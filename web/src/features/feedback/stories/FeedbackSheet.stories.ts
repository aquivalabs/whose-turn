import type { Decorator, Meta, StoryObj } from '@storybook/vue3';
import { onMounted } from 'vue';
import { ui } from '@/store.ts';
import { answer, goOffline } from '@/stories/fake-server.ts';
import FeedbackSheet from '../FeedbackSheet.vue';
import { feedbackSheetStorybookMock } from './FeedbackSheet.mock.ts';

type State = 'default' | 'noReports' | 'unreachable';
interface Args {
  state: State;
}

const withFeedbackServer: Decorator = (story, context) => ({
  components: { story },
  setup: () => {
    const { state } = context.args as unknown as Args;
    const mock = feedbackSheetStorybookMock;
    ui.feedback = false;
    if (state === 'unreachable') {
      goOffline();
    } else {
      const reports = state === 'noReports' ? [] : mock.reports;
      answer('/api/feedback', (body) => {
        if (body.preview) {
          return mock.preview;
        }
        return body.text ? { ...mock.sent, reports } : { reports };
      });
    }
    onMounted(() => {
      ui.feedback = true;
    });
  },
  template: '<story />',
});

const meta = {
  title: 'Sheets/Report',
  component: FeedbackSheet,
  args: { state: 'default' } as never,
  argTypes: {
    state: { control: 'select', options: ['default', 'noReports', 'unreachable'], description: 'unreachable: the past reports and Send both fail' },
  } as never,
  decorators: [withFeedbackServer],
} satisfies Meta<typeof FeedbackSheet>;

export default meta;

export const Sheet: StoryObj<typeof meta> = {};
