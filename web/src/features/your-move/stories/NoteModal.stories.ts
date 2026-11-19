import type { Meta, StoryObj } from '@storybook/vue3';
import { withState } from '@/stories/with-state.ts';
import NoteModal from '../NoteModal.vue';
import { noteModalStorybookMock } from './NoteModal.mock.ts';

type Kind = keyof typeof noteModalStorybookMock;
interface Args {
  kind: Kind;
  failing: boolean;
}

const meta = {
  title: 'Sheets/Note',
  component: NoteModal,
  args: { kind: 'note', failing: false } as never,
  argTypes: {
    kind: { control: 'radio', options: Object.keys(noteModalStorybookMock), description: 'note: a mark you handled; passedOn: an automatic mark with its outcome' },
    failing: { control: 'boolean', description: 'Saving answers "server unreachable"' },
  } as never,
  parameters: { frame: { height: '30rem' } },
  decorators: [
    withState<Args>(({ kind, failing }) => ({
      snapshot: noteModalStorybookMock[kind].slice,
      ui: { note: noteModalStorybookMock[kind].id },
      server: failing ? 'offline' : undefined,
    })),
  ],
} satisfies Meta<typeof NoteModal>;

export default meta;

export const Window: StoryObj<typeof meta> = {};
