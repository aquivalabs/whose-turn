import type { Meta, StoryObj } from '@storybook/vue3';
import Island from '../Island.vue';
import { islandStorybookMock } from './Island.mock.ts';

const { rows, ...props } = islandStorybookMock;

const meta = {
  title: 'Primitives/Island',
  component: Island,
  args: { ...props, rank: undefined, rows: 3 } as never,
  argTypes: {
    rank: { control: 'radio', options: [undefined, 'lead', 'quiet'] },
    resize: { control: 'radio', options: ['height', 'width'] },
    rows: { control: { type: 'range', min: 0, max: 3 }, description: 'How many sample rows the body holds; 0 is the empty state' },
    id: { table: { disable: true } },
  } as never,
  render: (args) => ({
    components: { Island },
    setup: () => ({ args, rows }),
    template: `<Island v-bind="{ ...args, rows: undefined }" style="flex: 1">
      <p v-if="!args.rows" style="padding: 1rem">Nothing here</p>
      <ul v-else style="margin: 0; padding: 0 1rem 1rem; list-style: none"><li v-for="row in rows.slice(0, args.rows)" :key="row">{{ row }}</li></ul>
    </Island>`,
  }),
  parameters: { frame: { height: '22rem' } },
} satisfies Meta<typeof Island>;

export default meta;

export const Panel: StoryObj<typeof meta> = {};
