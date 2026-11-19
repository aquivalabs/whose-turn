import type { FiledReport, Workspace } from '@/lib/types.ts';
import { demoWorkspace, hoursAgo } from '@/stories/fixtures.ts';

const at = hoursAgo;

const filed: FiledReport = {
  id: 'PROJ-12',
  title: 'Item — rising wraps badly',
  kind: 'bug',
  state: 'In Progress',
  outcome: 'open',
  body: 'The chip wraps onto a second line at a narrow width.\nIt happens on every row.',
  filed_at: at(30),
  changed_at: at(2),
  answers: [
    { by: 'dana', at: at(20), text: 'Thanks, reproduced. A fix is coming.' },
    { by: 'dana', at: at(2), text: 'Fixed in the next release.' },
  ],
};

const workspaces: Workspace[] = [demoWorkspace({ connectors: [], key_pattern: '' })];

/** The server replies behind the page, one per state of the story. */
export const reportPageStorybookMock = {
  workspaces,
  states: {
    answered: { report: filed },
    unanswered: { report: { ...filed, state: 'Done', outcome: 'done', unanswered: true, answers: [] } },
    hidden: { report: { ...filed, answers_hidden: true, answers: [] } },
    'no answers yet': { report: { ...filed, state: '', answers: [] } },
    'not filed': {},
    'server down': null,
  },
} satisfies { workspaces: Workspace[]; states: Record<string, { report?: FiledReport } | null> };
