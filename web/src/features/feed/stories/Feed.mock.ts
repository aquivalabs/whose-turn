import type { Snapshot } from '@/lib/types.ts';
import { demoWorkspace, emptyMarks, failingHealth, healthy, hoursAgo } from '@/stories/fixtures.ts';

const workspace = demoWorkspace();


const feed: Snapshot['feed'] = [
  { id: 'e1', ref: 'PROJ-12', key: 'PROJ-12', title: 'Item — rising', kind: 'comment', who: 'dana', at: hoursAgo(0.2), text: 'Could you take another look at the retry?', body: 'Could you take another look at the retry?\n\nThe second attempt still waits the full minute before it gives up.', source: 'github' },
  { id: 'e2', ref: 'PROJ-12', key: 'PROJ-12', title: 'Item — rising', kind: 'approved', who: 'lee', at: hoursAgo(1), text: 'Approved', body: 'Looks good to me. One nit on the log line, not blocking.', source: 'github' },
  { id: 'e3', ref: 'PROJ-14', key: 'PROJ-14', title: 'Item — steady', kind: 'status', who: 'sam', at: hoursAgo(3), text: 'In Progress → Code Review', source: 'tracker' },
  { id: 'e4', ref: 'PROJ-14', key: 'PROJ-14', title: 'Item — steady', kind: 'comment', who: 'sam', at: hoursAgo(5), text: 'Moved the date to Friday.', body: 'Moved the date to Friday, the review needs one more day.', source: 'tracker' },
  { id: 'e5', ref: 'PROJ-15', key: 'PROJ-15', title: 'Item — falling', kind: 'check', who: 'ci', at: hoursAgo(8), text: 'build failed', source: 'github' },
];

/** The snapshot slices the feed reads, one per state of the story. */
export const feedStorybookMock = {
  default: { workspace, feed, turn: [], marks: emptyMarks({ seen: ['e3', 'e4', 'e5'] }), health: healthy(), polled_at: hoursAgo(0) },
  empty: { workspace, feed: [], turn: [], marks: emptyMarks(), health: healthy(), polled_at: hoursAgo(0) },
  failing: { workspace, feed: [], turn: [], marks: emptyMarks(), health: failingHealth('github'), polled_at: hoursAgo(0) },
} satisfies Record<string, Partial<Snapshot>>;
