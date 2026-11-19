import type { Meta, StoryObj } from '@storybook/vue3';
import RowScroll from '../RowScroll.vue';
import { rowScrollStorybookMock } from './RowScroll.mock.ts';

const meta = {
  title: 'Primitives/RowScroll',
  component: RowScroll,
  args: { rowCount: 14, floor: false } as never,
  argTypes: {
    rowCount: { control: { type: 'range', min: 0, max: 14 }, description: 'Rows in the table; 0 is empty' },
    floor: { control: 'boolean', description: 'Keep a minimum height' },
  } as never,
  render: (args) => ({
    components: { RowScroll },
    setup: () => ({ args, rows: rowScrollStorybookMock.rows }),
    template: `<div style="flex: 1; display: flex; flex-direction: column; overflow: hidden; padding: 0 1.25rem"><RowScroll :floor="args.floor" style="flex: 1 1 auto; min-height: 0; overflow: auto">
      <table><thead><tr><th>Key</th><th>Summary</th></tr></thead>
        <tbody v-for="row in rows.slice(0, args.rowCount)" :key="row.key"><tr><td>{{ row.key }}</td><td>{{ row.summary }}</td></tr></tbody>
      </table></RowScroll></div>`,
  }),
  parameters: { frame: { height: '14rem' } },
} satisfies Meta<typeof RowScroll>;

export default meta;

export const Rows: StoryObj<typeof meta> = {};
