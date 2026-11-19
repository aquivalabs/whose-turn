import type { Meta, StoryObj } from '@storybook/vue3';
import { withState } from '@/stories/with-state.ts';
import FeedbackSheet from '../FeedbackSheet.vue';
import { feedbackSheetStorybookMock } from './FeedbackSheet.mock.ts';

interface Args {
  state: 'default' | 'noReports' | 'unreachable';
}

const mock = feedbackSheetStorybookMock;

const meta = {
  title: 'Sheets/Report',
  component: FeedbackSheet,
  args: { state: 'default' } as never,
  argTypes: {
    state: { control: 'select', options: ['default', 'noReports', 'unreachable'], description: 'unreachable: the past reports and Send both fail' },
  } as never,
  decorators: [
    withState<Args>(({ state }) => {
      const reports = state === 'noReports' ? [] : mock.reports;
      return {
        open: ['feedback'],
        server:
          state === 'unreachable'
            ? 'offline'
            : { '/api/feedback': (body) => (body.preview ? mock.preview : body.text ? { ...mock.sent, reports } : { reports }) },
      };
    }),
  ],
} satisfies Meta<typeof FeedbackSheet>;

export default meta;

export const Sheet: StoryObj<typeof meta> = {};
