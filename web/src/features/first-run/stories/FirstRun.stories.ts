import type { Meta, StoryObj } from '@storybook/vue3';
import { withState } from '@/stories/with-state.ts';
import FirstRun from '../FirstRun.vue';
import { firstRunStorybookMock } from './FirstRun.mock.ts';

const meta = {
  title: 'Islands/First run',
  component: FirstRun,
  decorators: [withState(() => ({ snapshot: firstRunStorybookMock.default }))],
} satisfies Meta<typeof FirstRun>;

export default meta;

export const Card: StoryObj<typeof meta> = {};
