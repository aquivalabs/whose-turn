import type { Meta, StoryObj } from '@storybook/vue3';
import { ui } from '@/store.ts';
import HelpSheet from '../HelpSheet.vue';
import { helpSheetStorybookMock } from './HelpSheet.mock.ts';

const meta = {
  title: 'Sheets/Help',
  component: HelpSheet,
  args: helpSheetStorybookMock as never,
  argTypes: { open: { control: 'boolean', description: 'The sheet is open' } } as never,
  render: (args) => ({
    components: { HelpSheet },
    setup: () => {
      ui.help = Boolean((args as unknown as { open: boolean }).open);
      return {};
    },
    template: '<HelpSheet />',
  }),
} satisfies Meta<typeof HelpSheet>;

export default meta;

export const Sheet: StoryObj<typeof meta> = {};
