import type { Decorator, Meta, StoryObj } from '@storybook/vue3';
import { withSnapshot } from '@/stories/with-snapshot.ts';
import { answer, goOffline } from '@/stories/fake-server.ts';
import { snapshot, ui } from '@/store.ts';
import NoteModal from '../NoteModal.vue';
import { noteModalStorybookMock } from './NoteModal.mock.ts';

type Kind = keyof typeof noteModalStorybookMock;
interface Args {
  kind: Kind;
  failing: boolean;
}

/** The marks server for the story: it keeps the saved note in the local marks, or is unreachable when `failing` is on. */
const withMarksServer: Decorator = (story, context) => ({
  components: { story },
  setup: () => {
    if ((context.args as unknown as Args).failing) {
      goOffline();
      return;
    }
    answer('/api/marks', (body) => {
      const { notes = {} } = body as { notes?: Record<string, string> };
      const marks = structuredClone(snapshot.marks);
      Object.entries(notes).forEach(([id, note]) => {
        marks.info[id] = { ...marks.info[id], note };
      });
      return { marks, turn: snapshot.turn, counts: snapshot.counts };
    });
  },
  template: '<story />',
});

const meta = {
  title: 'Sheets/Note',
  component: NoteModal,
  args: { kind: 'note', failing: false } as never,
  argTypes: {
    kind: { control: 'radio', options: Object.keys(noteModalStorybookMock), description: 'note: a mark you handled; passedOn: an automatic mark with its outcome' },
    failing: { control: 'boolean', description: 'Saving answers "server unreachable"' },
  } as never,
  decorators: [
    withSnapshot((args) => {
      const { kind } = args as unknown as Args;
      ui.note = noteModalStorybookMock[kind].id;
      return structuredClone(noteModalStorybookMock[kind].slice);
    }),
    withMarksServer,
    () => ({ template: '<div style="min-height: 30rem"><story /></div>' }),
  ],
} satisfies Meta<typeof NoteModal>;

export default meta;

export const Window: StoryObj<typeof meta> = {};
