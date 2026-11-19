import type { Decorator, Meta, StoryObj } from '@storybook/vue3';
import { withSnapshot } from '@/stories/with-snapshot.ts';
import { answer, goOffline } from '@/stories/fake-server.ts';
import { snapshot, ui } from '@/store.ts';
import type { TurnRow } from '@/lib/types.ts';
import YourMove from '../YourMove.vue';
import { useMoveView } from '../useMoveView.ts';
import { yourMoveStorybookMock } from './YourMove.mock.ts';

type State = keyof typeof yourMoveStorybookMock;
interface Args {
  state: State;
  view: 'open' | 'handled';
}

/** The marks server for the story: unreachable in the failing state, otherwise it applies handled marks and notes to the local rows. */
const withMarksServer: Decorator = (story, context) => ({
  components: { story },
  setup: () => {
    const { state } = context.args as unknown as Args;
    if (state === 'failing') {
      goOffline();
      return;
    }
    answer('/api/marks', (body) => {
      const { handled = {}, notes = {} } = body as { handled?: Record<string, string | null>; notes?: Record<string, string> };
      const marks = structuredClone(snapshot.marks);
      Object.entries(handled).forEach(([id, stamp]) => {
        marks.handled[id] = stamp;
        if (!stamp) {
          delete marks.info[id];
        }
      });
      Object.entries(notes).forEach(([id, note]) => {
        marks.info[id] = { ...marks.info[id], note };
      });
      const turn: TurnRow[] = snapshot.turn.map((row) => ({ ...row, handled: Boolean(marks.handled[row.row_id]) }));
      return { marks, turn, counts: snapshot.counts };
    });
  },
  template: '<story />',
});

const meta = {
  title: 'Islands/Your move',
  component: YourMove,
  args: { state: 'default', view: 'open' } as never,
  argTypes: {
    state: { control: 'select', options: Object.keys(yourMoveStorybookMock), description: 'failing: every mark answers "server unreachable"' },
    view: { control: 'radio', options: ['open', 'handled'] },
  } as never,
  decorators: [
    withSnapshot((args) => {
      const { state, view } = args as unknown as Args;
      useMoveView().value = view;
      ui.note = '';
      return structuredClone(yourMoveStorybookMock[state]);
    }),
    withMarksServer,
    () => ({ template: '<div style="height: 40rem; display: flex"><story /></div>' }),
  ],
} satisfies Meta<typeof YourMove>;

export default meta;

export const Panel: StoryObj<typeof meta> = {};
