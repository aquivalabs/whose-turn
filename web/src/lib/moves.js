// Your move and Waiting on others: which rows, in which order. Rendering lives in the islands.
export const isHandled = (row, marks) => { const at = marks.handled[row.row_id]; return Boolean(at) && String(row.activity_at || '') <= at; };

/** Rows on you: in-progress work first, then oldest first; handled rows sink to the bottom unless only they are wanted. */
export const openCount = (turn, marks) => turn.filter((r) => r.group === 'you' && !isHandled(r, marks)).length;

/** Rows on you, each with its handled flag: in-progress work first, then oldest first; handled rows sink to the bottom unless only they are wanted. */
export const yourRows = (turn, marks, view) => {
  const you = turn.filter((r) => r.group === 'you').map((row) => ({ row, handled: isHandled(row, marks) }))
    .sort((a, b) => Number(b.row.started) - Number(a.row.started) || String(a.row.updated).localeCompare(String(b.row.updated)));
  const open = you.filter((item) => !item.handled).length;
  const rows = view === 'handled' ? you.filter((item) => item.handled) : you.slice().sort((a, b) => Number(a.handled) - Number(b.handled));
  return { rows, open, handled: you.length - open };
};

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
