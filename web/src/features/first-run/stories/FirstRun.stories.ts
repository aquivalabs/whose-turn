import type { Meta, StoryObj } from '@storybook/vue3';
import { withSnapshot } from '@/stories/with-snapshot.ts';
import FirstRun from '../FirstRun.vue';
import { firstRunStorybookMock } from './FirstRun.mock.ts';

const meta = {
  title: 'Islands/First run',
  component: FirstRun,
  decorators: [withSnapshot(() => structuredClone(firstRunStorybookMock.default)), () => ({ template: '<div class="dashboard"><story /></div>' })],
} satisfies Meta<typeof FirstRun>;

export default meta;

export const Card: StoryObj<typeof meta> = {};
