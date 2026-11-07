/** The trace a row leaves in Handled when its turn passes to someone else: one phrase and the feed event behind it. */
import { eventId } from './rules.mjs';
import { DAY, oneline } from './text.mjs';

const lastName = (text) => String(text).split(' → ').pop().trim();

/** Ticket rows that were on you before a poll and are on someone else after it. */
export const passedRows = (before, after) => {
  const later = new Map(after.map((row) => [row.row_id, row]));
  return before
    .filter((row) => row.group === 'you' && row.row_id === row.key && later.get(row.row_id)?.group === 'others')
    .map((row) => ({ before: row, after: later.get(row.row_id) }));
};

const mergedNow = ({ before, after }) => before.pr_state !== 'MERGED' && after.pr_state === 'MERGED';

const commentBefore = (feed, key, at) => {
  const found = feed.find((item) => item.kind === 'comment' && item.key === key && Date.parse(at) - Date.parse(item.at) < DAY);
  return found ? { id: found.id, text: oneline(found.body || found.text) } : null;
};

/** `{outcome, event, detail}` built from what moved the row, or null when no event explains it. `events` are this poll's ticket events, `feed` is newest first and already shows your name as you. */
export const traceOf = (pair, events, feed) => {
  const own = events.filter((event) => event.key === pair.after.key && event.source === pair.after.source);
  const reassigned = own.find((event) => event.kind === 'reassigned');
  const status = own.find((event) => event.kind === 'status');
  const merge = mergedNow(pair) && feed.find((item) => item.kind === 'merged' && item.key === pair.after.key);
  if (merge) {
    return { outcome: 'Merged', event: merge.id, detail: { summary: 'Pull request merged' } };
  }
  if (reassigned) {
    const names = reassigned.text.split(' → ');
    const name = names.at(-1).trim();
    const base = name ? `Passed to ${name}` : 'Passed on';
    const comment = commentBefore(feed, pair.after.key, reassigned.at);
    const head = status ? `${base} · ${lastName(status.text)}` : base;
    return {
      outcome: comment ? `${head} · ${comment.text}` : head,
      event: eventId(reassigned),
      detail: { what: head, assignee: feed.find((item) => item.id === eventId(reassigned))?.text ?? reassigned.text, ...(status ? { status: status.text } : {}), ...(comment?.id ? { comment: comment.id } : {}) },
    };
  }
  return status ? { outcome: `Moved to ${lastName(status.text)}`, event: eventId(status), detail: { status: status.text } } : null;
};
