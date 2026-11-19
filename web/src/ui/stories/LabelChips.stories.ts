import type { Meta, StoryObj } from '@storybook/vue3';
import LabelChips from '../LabelChips.vue';
import { labelChipsStorybookMock } from './LabelChips.mock.ts';

const meta = {
  title: 'Primitives/LabelChips',
  component: LabelChips,
  args: { ...labelChipsStorybookMock, count: 8, width: 24 } as never,
  argTypes: {
    count: { control: { type: 'range', min: 0, max: 8 }, description: 'How many labels; 0 renders nothing' },
    width: { control: { type: 'range', min: 8, max: 40 }, description: 'Row width in rem; narrow rows fold into +N' },
    labels: { table: { disable: true } },
  } as never,
  render: (args) => ({
    components: { LabelChips },
    setup: () => ({ args, labels: labelChipsStorybookMock.labels }),
    template: `<div :style="{ width: args.width + 'rem', display: 'flex' }"><LabelChips :labels="labels.slice(0, args.count)" :badges="args.badges" /></div>`,
  }),
} satisfies Meta<typeof LabelChips>;

export default meta;

export const Chips: StoryObj<typeof meta> = {};
