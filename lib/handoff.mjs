/** Builds the context an agent receives for one hand-off: a row, a feed item or a whole workspace, with the comments and PRs of its ticket, bodies capped. */
import { newestFirst, oneline } from './text.mjs';

const BODY_LIMIT = 1500;

const capped = (list, field) => list.map((item) => ({ ...item, [field]: String(item[field] || '').slice(0, BODY_LIMIT) }));

const ticketContext = (data, key) => (key ? {
  comments: capped(newestFirst(data.comments.filter((comment) => comment.key === key)).slice(0, 5), 'body'),
  prs: data.prs.filter((pr) => pr.key === key).map(({ pr, title, state, base, review, checks, url, last_comment_by, last_comment }) => ({ pr, title, state, base, review, checks, url, last_comment_by, last_comment })),
} : { comments: [], prs: [] });

export const buildHandOff = (kind, ref, { data, turn, feed, workspace, rules, moves, todos, errors, handled }) => {
  if (kind === 'row') {
    const row = turn.find((candidate) => candidate.row_id === ref);
    return row ? { row, handled: handled(row), ...ticketContext(data, row.key) } : null;
  }
  if (kind === 'feed') {
    const item = feed.find((candidate) => candidate.id === ref);
    return item ? { item: { ...item, body: String(item.body || '').slice(0, BODY_LIMIT) }, ...ticketContext(data, item.key) } : null;
  }
  if (kind === 'workspace') {
    return { workspace, rules, moves, waiting: turn.filter((row) => row.group === 'others'), todos, errors };
  }
  return null;
};

/** A few words that identify the item even after the live row is gone. */
export const snapshotOf = (kind, ref, { turn, feed, workspace }) => {
  if (kind === 'row') {
    const row = turn.find((candidate) => candidate.row_id === ref);
    return row ? { key: row.key, summary: oneline(row.summary, 120), next: row.next } : null;
  }
  if (kind === 'feed') {
    const item = feed.find((candidate) => candidate.id === ref);
    return item ? { ref: item.ref, kind: item.kind, text: oneline(item.text, 120) } : null;
  }
  return kind === 'workspace' ? { name: workspace.name } : null;
};
