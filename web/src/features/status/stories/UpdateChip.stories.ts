import type { Meta, StoryObj } from '@storybook/vue3';
import { withSnapshot } from '@/stories/with-snapshot.ts';
import { answer } from '@/stories/fake-server.ts';
import type { Decorator } from '@storybook/vue3';
import UpdateChip from '../UpdateChip.vue';
import { updateChipStorybookMock } from './UpdateChip.mock.ts';

type State = keyof typeof updateChipStorybookMock;
interface Args {
  state: State;
}

const withUpdateServer: Decorator = (story) => ({
  components: { story },
  setup: () => {
    answer('/api/update', () => ({ update: { ...updateChipStorybookMock.installing } }));
    answer('/api/update/plugin-copied', () => ({ update: { ...updateChipStorybookMock.none } }));
  },
  template: '<story />',
});

const meta = {
  title: 'Islands/Status line/Update chip',
  component: UpdateChip,
  args: { state: 'available' } as never,
  argTypes: {
    state: { control: 'select', options: Object.keys(updateChipStorybookMock), description: 'none shows nothing' },
  } as never,
  decorators: [
    withSnapshot((args) => ({ update: structuredClone(updateChipStorybookMock[(args as unknown as Args).state]) })),
    withUpdateServer,
    () => ({ template: '<div style="min-height: 2rem"><story /></div>' }),
  ],
} satisfies Meta<typeof UpdateChip>;

export default meta;

export const Chip: StoryObj<typeof meta> = {};
