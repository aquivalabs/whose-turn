import type { Meta, StoryObj } from '@storybook/vue3';
import { ref } from 'vue';
import Segmented from '../Segmented.vue';
import { segmentedStorybookMock } from './Segmented.mock.ts';

const meta = {
  title: 'Primitives/Segmented',
  component: Segmented,
  args: { withCounts: true, chips: false, label: 'Filter' } as never,
  argTypes: {
    withCounts: { control: 'boolean', description: 'A count on each option' },
    chips: { control: 'boolean', description: 'The larger variant of the feed filter' },
  } as never,
  render: (args) => ({
    components: { Segmented },
    setup: () => {
      const selected = ref('all');
      const options = () => ((args as unknown as { withCounts: boolean }).withCounts ? segmentedStorybookMock.options : segmentedStorybookMock.plain);
      return { args, selected, options };
    },
    template: '<Segmented v-model="selected" :options="options()" :label="args.label" :chips="args.chips" />',
  }),
} satisfies Meta<typeof Segmented>;

export default meta;

export const Control: StoryObj<typeof meta> = {};
