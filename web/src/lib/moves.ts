// Your move and Waiting on others: which rows, in which order. Rendering lives in the islands.
import type { Marks, TurnRow } from './types.ts';

type HandledMarks = Pick<Marks, 'handled'>;

export const isHandled = (row: TurnRow, marks: HandledMarks) => {
  const at = marks.handled[row.row_id];
  return Boolean(at) && String(row.activity_at || '') <= String(at);
};

/** How many rows on you are still open. */
export const openCount = (turn: TurnRow[], marks: HandledMarks) =>
  turn.filter((row) => row.group === 'you' && !isHandled(row, marks)).length;

/** The workspace list with one workspace's badge set; the same list when nothing changes. */
export const withOpenMoves = <T extends { id: string; open_moves?: number }>(
  workspaces: T[],
  id: string,
  count: number,
) =>
  workspaces.some((entry) => entry.id === id && entry.open_moves !== count)
    ? workspaces.map((entry) => (entry.id === id ? { ...entry, open_moves: count } : entry))
    : workspaces;

export interface YourRow {
  row: TurnRow;
  handled: boolean;
}

/** Rows on you, each with its handled flag: by the server's rank (lowest first), then oldest first; the open view lists only open rows and the handled view only handled ones. */
export const yourRows = (turn: TurnRow[], marks: HandledMarks, view: string) => {
  const you: YourRow[] = turn
    .filter((row) => row.group === 'you')
    .map((row) => ({ row, handled: isHandled(row, marks) }))
    .sort(
      (first, second) =>
        first.row.rank - second.row.rank ||
        String(first.row.updated).localeCompare(String(second.row.updated)),
    );
  const open = you.filter((item) => !item.handled).length;
  const wantHandled = view === 'handled';
  const rows = you.filter((item) => item.handled === wantHandled);
  return { rows, open, handled: you.length - open };
};

/** Tickets that recently left your move: done ones, most recently done first, at most 15. */
const doneAt = (row: TurnRow) => String(row.status_since || row.updated);
export const recentlyDone = (turn: TurnRow[]) =>
  turn
    .filter((row) => row.group === 'done')
    .sort((first, second) => doneAt(second).localeCompare(doneAt(first)))
    .slice(0, 15);

/** The four tiles of the workspace header. */
export const turnCounts = (turn: TurnRow[], marks: HandledMarks) => ({
  mine: openCount(turn, marks),
  others: turn.filter((row) => row.group === 'others').length,
  failing: turn.filter((row) => row.pr_state === 'OPEN' && row.checks === 'failing').length,
  done: turn.filter((row) => row.group === 'done').length,
});

export const waitingRows = (turn: TurnRow[]) =>
  turn
    .filter((row) => row.group === 'others')
    .sort((first, second) => String(second.updated).localeCompare(String(first.updated)));

export const checksTone = (checks: string | undefined) =>
  checks === 'failing' ? 'bad' : checks === 'running' ? 'warn' : checks === 'passing' ? 'ok' : '';
export const statusTone = (status: string) =>
  /qa|review/i.test(status) ? 'info' : /hold/i.test(status) ? 'warn' : '';
export const outcomeTone = (outcome: string | undefined) =>
  (({ open: 'info', done: 'ok', dropped: 'warn' }) as Record<string, string>)[outcome || ''] ||
  'info';

/** How many rows end below the visible bottom of a scroll area by more than the slack, given each row's bottom edge in the same coordinates. */
export const hiddenBelow = (bottoms: number[], viewBottom: number, slack = 1) =>
  bottoms.filter((bottom) => bottom > viewBottom + slack).length;
