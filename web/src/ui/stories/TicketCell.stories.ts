import type { Meta, StoryObj } from '@storybook/vue3';
import TicketCell from '../TicketCell.vue';
import { ticketCellStorybookMock } from './TicketCell.mock.ts';

const meta = {
  title: 'Primitives/TicketCell',
  component: TicketCell,
  args: { state: 'default' } as never,
  argTypes: {
    state: { control: 'select', options: Object.keys(ticketCellStorybookMock) },
  } as never,
  render: (args) => ({
    components: { TicketCell },
    setup: () => ({ args, mock: ticketCellStorybookMock }),
    template: '<table><tbody><tr><TicketCell :row="mock[args.state]" /></tr></tbody></table>',
  }),
} satisfies Meta<typeof TicketCell>;

export default meta;

export const Cell: StoryObj<typeof meta> = {};
