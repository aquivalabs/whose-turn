import type { Meta, StoryObj } from '@storybook/vue3';
import { SEEN_KEY } from '@/composables/useWhatsNew.ts';
import { withState } from '@/stories/with-state.ts';
import WhatsNewSheet from '../WhatsNewSheet.vue';
import { whatsNewSheetStorybookMock } from './WhatsNewSheet.mock.ts';

interface Args {
  state: keyof typeof whatsNewSheetStorybookMock | 'unreachable';
  sinceLastVisit: boolean;
}

const meta = {
  title: 'Sheets/What is new',
  component: WhatsNewSheet,
  args: { state: 'default', sinceLastVisit: true } as never,
  argTypes: {
    state: { control: 'select', options: ['default', 'empty', 'unavailable', 'unreachable'] },
    sinceLastVisit: { control: 'boolean', description: 'The last visit was on 1.0.0, so newer versions are flagged' },
  } as never,
  decorators: [
    withState<Args>(({ state, sinceLastVisit }) => ({
      storage: { [SEEN_KEY]: sinceLastVisit ? '1.0.0' : '' },
      open: ['whatsNew'],
      server: state === 'unreachable' ? 'offline' : { '/api/changelog': () => whatsNewSheetStorybookMock[state] },
    })),
  ],
} satisfies Meta<typeof WhatsNewSheet>;

export default meta;

export const Sheet: StoryObj<typeof meta> = {};
