import type { Meta, StoryObj } from '@storybook/vue3';
import { withState } from '@/stories/with-state.ts';
import UpdateChip from '../UpdateChip.vue';
import { updateChipStorybookMock } from './UpdateChip.mock.ts';

interface Args {
  state: keyof typeof updateChipStorybookMock;
}

const meta = {
  title: 'Islands/Status line/Update chip',
  component: UpdateChip,
  args: { state: 'available' } as never,
  argTypes: {
    state: { control: 'select', options: Object.keys(updateChipStorybookMock), description: 'none shows nothing' },
  } as never,
  decorators: [
    withState<Args>(({ state }) => ({
      snapshot: { update: updateChipStorybookMock[state] },
      server: {
        '/api/update': () => ({ update: updateChipStorybookMock.installing }),
        '/api/update/plugin-copied': () => ({ update: updateChipStorybookMock.none }),
      },
    })),
  ],
  parameters: { frame: { height: '2rem' } },
} satisfies Meta<typeof UpdateChip>;

export default meta;

export const Chip: StoryObj<typeof meta> = {};
