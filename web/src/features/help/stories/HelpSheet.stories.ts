import type { Meta, StoryObj } from '@storybook/vue3';
import { withState } from '@/stories/with-state.ts';
import HelpSheet from '../HelpSheet.vue';
import { helpSheetStorybookMock } from './HelpSheet.mock.ts';

const meta = {
  title: 'Sheets/Help',
  component: HelpSheet,
  args: helpSheetStorybookMock as never,
  argTypes: { open: { control: 'boolean', description: 'The sheet is open' } } as never,
  decorators: [withState<typeof helpSheetStorybookMock>(({ open }) => ({ ui: { help: open } }))],
} satisfies Meta<typeof HelpSheet>;

export default meta;

export const Sheet: StoryObj<typeof meta> = {};
