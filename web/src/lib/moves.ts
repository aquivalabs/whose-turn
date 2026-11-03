// Your move and Waiting on others: which rows, in which order. Rendering lives in the islands.
import type { TurnRow } from './types.ts';

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

/** Rows on you, each with the handled flag the server set: by the server's rank (lowest first), then oldest first; the open view lists only open rows and the handled view only handled ones. */
export const yourRows = (turn: TurnRow[], view: string) => {
  const you: YourRow[] = turn
    .filter((row) => row.group === 'you')
    .map((row) => ({ row, handled: Boolean(row.handled) }))
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

export const waitingRows = (turn: TurnRow[]) =>
  turn
    .filter((row) => row.group === 'others')
    .sort((first, second) => String(second.updated).localeCompare(String(first.updated)));

export const checksTone = (checks: string | undefined) =>
  checks === 'failing' ? 'bad' : checks === 'running' ? 'warn' : checks === 'passing' ? 'ok' : '';
/** The pill tone of each status group the server sends as status_group; other groups have none. */
const STATUS_TONES: Record<string, string> = { code_review: 'info', qa: 'info', on_hold: 'warn' };
export const statusTone = (group: string | undefined) => STATUS_TONES[group || ''] || '';
export const outcomeTone = (outcome: string | undefined) =>
  (({ open: 'info', done: 'ok', dropped: 'warn' }) as Record<string, string>)[outcome || ''] ||
  'info';

/** How many rows end below the visible bottom of a scroll area by more than the slack, given each row's bottom edge in the same coordinates. */
export const hiddenBelow = (bottoms: number[], viewBottom: number, slack = 1) =>
  bottoms.filter((bottom) => bottom > viewBottom + slack).length;
