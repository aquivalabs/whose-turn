import type { Meta, StoryObj } from '@storybook/vue3';
import SettingsFrame from '../SettingsFrame.vue';
import { settingsFrameStorybookMock } from './SettingsFrame.mock.ts';

type State = 'default' | 'unsaved' | 'confirm' | 'problems' | 'unloaded';
interface Args {
  state: State;
  wide: boolean;
}

const meta = {
  title: 'Sheets/Settings frame',
  component: SettingsFrame,
  args: { state: 'default', wide: false } as never,
  argTypes: {
    state: { control: 'select', options: ['default', 'unsaved', 'confirm', 'problems', 'unloaded'] },
    wide: { control: 'boolean' },
  } as never,
  render: (args) => ({
    components: { SettingsFrame },
    setup: () => {
      const props = () => {
        const { state, wide } = args as unknown as Args;
        return {
          title: settingsFrameStorybookMock.title,
          labelId: 'frame-title',
          dirty: state === 'unsaved' || state === 'confirm',
          ask: state === 'confirm' ? settingsFrameStorybookMock.ask : null,
          unloaded: state === 'unloaded' ? settingsFrameStorybookMock.unloaded : '',
          problems: state === 'problems' ? settingsFrameStorybookMock.problems : [],
          wide,
        };
      };
      return { props, body: settingsFrameStorybookMock.body };
    },
    template: '<SettingsFrame v-bind="props()"><p style="padding: 1.25rem">{{ body }}</p></SettingsFrame>',
  }),
} satisfies Meta<typeof SettingsFrame>;

export default meta;

export const Frame: StoryObj<typeof meta> = {};
