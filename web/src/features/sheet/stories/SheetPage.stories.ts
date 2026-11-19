import type { Meta, StoryObj } from '@storybook/vue3';
import SheetPage from '../SheetPage.vue';

const meta = {
  title: 'Pages/Species sheet',
  component: SheetPage,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof SheetPage>;

export default meta;

export const Page: StoryObj<typeof meta> = {};
