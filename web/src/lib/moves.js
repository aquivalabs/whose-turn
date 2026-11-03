// Your move and Waiting on others: which rows, in which order. Rendering lives in the islands.
export const isHandled = (row, marks) => { const at = marks.handled[row.row_id]; return Boolean(at) && String(row.activity_at || '') <= at; };

/** How many rows on you are still open. */
export const openCount = (turn, marks) => turn.filter((r) => r.group === 'you' && !isHandled(r, marks)).length;

/** Rows on you, each with its handled flag: by the server's rank (lowest first), then oldest first; handled rows sink to the bottom unless only they are wanted. */
export const yourRows = (turn, marks, view) => {
  const you = turn.filter((r) => r.group === 'you').map((row) => ({ row, handled: isHandled(row, marks) }))
    .sort((a, b) => a.row.rank - b.row.rank || String(a.row.updated).localeCompare(String(b.row.updated)));
  const open = you.filter((item) => !item.handled).length;
  const rows = view === 'handled' ? you.filter((item) => item.handled) : you.slice().sort((a, b) => Number(a.handled) - Number(b.handled));
  return { rows, open, handled: you.length - open };
};

/** Tickets that recently left your move: done ones, most recently done first, at most 15. */
const doneAt = (row) => String(row.status_since || row.updated);
export const recentlyDone = (turn) => turn.filter((r) => r.group === 'done').sort((a, b) => doneAt(b).localeCompare(doneAt(a))).slice(0, 15);

/** The four tiles of the workspace header. */
export const turnCounts = (turn, marks) => ({
  mine: openCount(turn, marks),
  others: turn.filter((r) => r.group === 'others').length,
  failing: turn.filter((r) => r.pr_state === 'OPEN' && r.checks === 'failing').length,
  done: turn.filter((r) => r.group === 'done').length,
});

export const waitingRows = (turn) => turn.filter((r) => r.group === 'others').sort((a, b) => String(b.updated).localeCompare(String(a.updated)));

export const checksTone = (checks) => (checks === 'failing' ? 'bad' : checks === 'running' ? 'warn' : checks === 'passing' ? 'ok' : '');
export const statusTone = (status) => (/qa|review/i.test(status) ? 'info' : /hold/i.test(status) ? 'warn' : '');
export const outcomeTone = (outcome) => ({ open: 'info', done: 'ok', dropped: 'warn' }[outcome] || 'info');
