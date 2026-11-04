// Your move and Waiting on others: which rows, in which order. Rendering lives in the islands.
import type { HandledInfo, TurnRow } from './types.ts';

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

/** The rows of Your move with their handled flag, ordered by rank then age.
 * Rules: docs/mechanisms/your-move.md. */
export const yourRows = (turn: TurnRow[], view: string, info: Record<string, HandledInfo> = {}, keep = '') => {
  const you: YourRow[] = turn
    .filter((row) => row.group === 'you' || (row.handled && info[row.row_id]?.auto))
    .map((row) => ({ row, handled: row.group !== 'you' || Boolean(row.handled) }))
    .sort(
      (first, second) =>
        first.row.rank - second.row.rank ||
        String(first.row.updated).localeCompare(String(second.row.updated)),
    );
  const open = you.filter((item) => !item.handled).length;
  const wantHandled = view === 'handled';
  const rows = you.filter((item) => item.handled === wantHandled || item.row.row_id === keep);
  return { rows, open, handled: you.length - open };
};

const doneAt = (row: TurnRow) => String(row.status_since || row.updated);
/** Done tickets, most recently done first, at most 15. */
export const recentlyDone = (turn: TurnRow[]) =>
  turn
    .filter((row) => row.group === 'done')
    .sort((first, second) => doneAt(second).localeCompare(doneAt(first)))
    .slice(0, 15);

export const waitingRows = (turn: TurnRow[]) =>
  turn
    .filter((row) => row.group === 'others')
    .sort((first, second) => String(second.updated).localeCompare(String(first.updated)));

/** Whether a row is a PR with no ticket. */
export const isPrOnly = (row: TurnRow) => !row.ticket_url && Boolean(row.pr) && row.pr === row.key;

/** Whether any row has a PR of its own to show, so an empty PR column can be left out. */
export const hasPrColumn = (rows: TurnRow[]) => rows.some((row) => row.pr && !isPrOnly(row));

export const checksTone = (checks: string | undefined) =>
  checks === 'failing' ? 'bad' : checks === 'running' ? 'warn' : checks === 'passing' ? 'ok' : '';
const STATUS_TONES: Record<string, string> = { code_review: 'info', qa: 'info', on_hold: 'hold' };
export const statusTone = (group: string | undefined) => STATUS_TONES[group || ''] || '';
export const outcomeTone = (outcome: string | undefined) =>
  (({ open: 'info', done: 'ok', dropped: 'warn' }) as Record<string, string>)[outcome || ''] ||
  'info';

/** How many rows end below the visible bottom of a scroll area by more than the slack. */
export const hiddenBelow = (bottoms: number[], viewBottom: number, slack = 1) =>
  bottoms.filter((bottom) => bottom > viewBottom + slack).length;
