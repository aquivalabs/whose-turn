// Your move and Waiting on others: which rows, in which order. Rendering lives in the islands.
export const isHandled = (row, marks) => { const at = marks.handled[row.row_id]; return Boolean(at) && String(row.activity_at || '') <= at; };

/** Rows on you: in-progress work first, then oldest first; handled rows sink to the bottom unless only they are wanted. */
export const yourRows = (turn, marks, view) => {
  const you = turn.filter((r) => r.group === 'you').sort((a, b) => Number(b.started) - Number(a.started) || String(a.updated).localeCompare(String(b.updated)));
  const open = you.filter((r) => !isHandled(r, marks)).length;
  const rows = view === 'handled' ? you.filter((r) => isHandled(r, marks)) : you.slice().sort((a, b) => Number(isHandled(a, marks)) - Number(isHandled(b, marks)));
  return { rows, open, handled: you.length - open };
};

export const waitingRows = (turn) => turn.filter((r) => r.group === 'others').sort((a, b) => String(b.updated).localeCompare(String(a.updated)));

export const checksTone = (checks) => (checks === 'failing' ? 'bad' : checks === 'running' ? 'warn' : checks === 'passing' ? 'ok' : '');
export const statusTone = (status) => (/qa|review/i.test(status) ? 'info' : /hold/i.test(status) ? 'warn' : '');
