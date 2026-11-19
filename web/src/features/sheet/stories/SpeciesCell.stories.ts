import type { Meta, StoryObj } from '@storybook/vue3';
import { speciesNames } from '@/lib/species.ts';
import { registry } from '@/species/index.ts';
import SpeciesCell from '../SpeciesCell.vue';
import { speciesCellStorybookMock } from './SpeciesCell.mock.ts';

const names = speciesNames(registry);

const meta = {
  title: 'Pages/Species sheet/Species cell',
  component: SpeciesCell,
  args: { ...speciesCellStorybookMock.cell, name: names[0] },
  argTypes: {
    name: { control: 'select', options: [...names, speciesCellStorybookMock.unknownSpecies], description: 'An unknown name shows the build error' },
    pose: { control: 'text' },
    seed: { control: { type: 'number', min: 0 } },
    ink: { control: 'text' },
  },
  parameters: { frame: { width: '12rem' } },
} satisfies Meta<typeof SpeciesCell>;

export default meta;

export const Cell: StoryObj<typeof meta> = {};
