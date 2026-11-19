import type { Decorator, Meta, StoryObj } from '@storybook/vue3';
import { onMounted } from 'vue';
import { ui } from '@/store.ts';
import { SEEN_KEY, useWhatsNew } from '@/composables/useWhatsNew.ts';
import { answer, goOffline } from '@/stories/fake-server.ts';
import WhatsNewSheet from '../WhatsNewSheet.vue';
import { whatsNewSheetStorybookMock } from './WhatsNewSheet.mock.ts';

type State = keyof typeof whatsNewSheetStorybookMock | 'unreachable';
interface Args {
  state: State;
  sinceLastVisit: boolean;
}

const withChangelog: Decorator = (story, context) => ({
  components: { story },
  setup: () => {
    const { state, sinceLastVisit } = context.args as unknown as Args;
    ui.whatsNew = false;
    useWhatsNew().changelog.value = null;
    try {
      localStorage.setItem(SEEN_KEY, sinceLastVisit ? '1.0.0' : '');
    } catch {
      // storage unavailable: the sheet still renders
    }
    if (state === 'unreachable') {
      goOffline();
    } else {
      answer('/api/changelog', () => whatsNewSheetStorybookMock[state]);
    }
    onMounted(() => {
      ui.whatsNew = true;
    });
  },
  template: '<story />',
});

const meta = {
  title: 'Sheets/What is new',
  component: WhatsNewSheet,
  args: { state: 'default', sinceLastVisit: true } as never,
  argTypes: {
    state: { control: 'select', options: ['default', 'empty', 'unavailable', 'unreachable'] },
    sinceLastVisit: { control: 'boolean', description: 'The last visit was on 1.0.0, so newer versions are flagged' },
  } as never,
  decorators: [withChangelog],
} satisfies Meta<typeof WhatsNewSheet>;

export default meta;

export const Sheet: StoryObj<typeof meta> = {};
