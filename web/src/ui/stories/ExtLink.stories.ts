import type { Meta, StoryObj } from '@storybook/vue3';
import ExtLink from '../ExtLink.vue';
import { extLinkStorybookMock } from './ExtLink.mock.ts';

interface Args {
  text: string;
  link: keyof typeof extLinkStorybookMock.links;
}

const meta = {
  title: 'Primitives/ExtLink',
  component: ExtLink,
  args: { text: extLinkStorybookMock.text, link: 'https' } as never,
  argTypes: {
    text: { control: 'text' },
    link: { control: 'radio', options: Object.keys(extLinkStorybookMock.links), description: 'Only https is followed; the others render as plain text' },
    url: { table: { disable: true } },
  } as never,
  render: (args) => ({
    components: { ExtLink },
    setup: () => ({ args, url: () => extLinkStorybookMock.links[(args as unknown as Args).link] }),
    template: '<ExtLink :text="args.text" :url="url()" />',
  }),
} satisfies Meta<typeof ExtLink>;

export default meta;

export const Link: StoryObj<typeof meta> = {};
