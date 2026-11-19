import type { Meta, StoryObj } from '@storybook/vue3';
import PrCell from '../PrCell.vue';
import { prCellStorybookMock } from './PrCell.mock.ts';

const meta = {
  title: 'Primitives/PrCell',
  component: PrCell,
  args: { state: 'passing' } as never,
  argTypes: {
    state: { control: 'select', options: Object.keys(prCellStorybookMock), description: 'The PR as the row shows it' },
  } as never,
  render: (args) => ({
    components: { PrCell },
    setup: () => ({ args, mock: prCellStorybookMock }),
    template: '<table><tbody><tr><PrCell :row="mock[args.state]" /></tr></tbody></table>',
  }),
} satisfies Meta<typeof PrCell>;

export default meta;

export const Cell: StoryObj<typeof meta> = {};
