import type { Meta, StoryObj } from '@storybook/vue3';
import Chevron from '../Chevron.vue';
import { chevronStorybookMock } from './Chevron.mock.ts';

const meta = {
  title: 'Primitives/Chevron',
  component: Chevron,
  args: { ...chevronStorybookMock, tag: 'button' },
  argTypes: {
    open: { control: 'boolean' },
    tag: { control: 'radio', options: ['button', 'span'] },
  },
} satisfies Meta<typeof Chevron>;

export default meta;

export const Disclosure: StoryObj<typeof meta> = {};
