import type { Meta, StoryObj } from '@storybook/vue3';
import { M as Motion } from 'motion-v';
import { ref } from 'vue';
import { fade } from '@/motion.ts';
import Swap from '../Swap.vue';
import { swapStorybookMock } from './Swap.mock.ts';

const meta = {
  title: 'Primitives/Swap',
  component: Swap,
  args: { face: swapStorybookMock.faces[0] },
  argTypes: {
    face: { control: 'select', options: swapStorybookMock.faces, description: 'The text on show; a change fades the old one out first' },
  },
  render: (args) => ({
    components: { Swap, Motion },
    setup: () => ({ args, fade, shown: ref(true) }),
    template: `<Swap :face="args.face"><template #default="{ face }"><Motion v-if="face" :key="face" v-bind="fade" as="p">{{ face }}</Motion></template></Swap>`,
  }),
} satisfies Meta<typeof Swap>;

export default meta;

export const Text: StoryObj<typeof meta> = {};
