import type { Meta, StoryObj } from '@storybook/vue3';
import { setScheme } from '@/scheme.ts';
import type { SchemeChoice } from '@/scheme.ts';
import SchemeToggle from '../SchemeToggle.vue';
import { schemeToggleStorybookMock } from './SchemeToggle.mock.ts';

const meta = {
  title: 'Islands/Status line/Scheme switch',
  component: SchemeToggle,
  args: { choice: 'system' } as never,
  argTypes: {
    choice: { control: 'radio', options: schemeToggleStorybookMock.choices, description: 'Starting choice; each click moves System, Light, Dark' },
  } as never,
  decorators: [
    (story, context) => ({
      components: { story },
      setup: () => setScheme((context.args as unknown as { choice: SchemeChoice }).choice),
      template: '<story />',
    }),
  ],
} satisfies Meta<typeof SchemeToggle>;

export default meta;

export const Switch: StoryObj<typeof meta> = {};
