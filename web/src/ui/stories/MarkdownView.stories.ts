import type { Meta, StoryObj } from '@storybook/vue3';
import MarkdownView from '../MarkdownView.vue';
import { markdownViewStorybookMock } from './MarkdownView.mock.ts';

interface Args {
  sample: keyof typeof markdownViewStorybookMock.sources;
}

const meta = {
  title: 'Primitives/MarkdownView',
  component: MarkdownView,
  args: { sample: 'default' } as never,
  argTypes: {
    sample: { control: 'radio', options: Object.keys(markdownViewStorybookMock.sources) },
    source: { table: { disable: true } },
  } as never,
  render: (args) => ({
    components: { MarkdownView },
    setup: () => ({ args, sources: markdownViewStorybookMock.sources, key: () => (args as unknown as Args).sample }),
    template: '<MarkdownView :source="sources[key()]" />',
  }),
} satisfies Meta<typeof MarkdownView>;

export default meta;

export const Document: StoryObj<typeof meta> = {};
