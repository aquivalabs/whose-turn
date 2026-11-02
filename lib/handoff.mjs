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
    const { theme, ...about } = workspace;
    return { workspace: about, rules, moves, waiting: turn.filter((row) => row.group === 'others'), todos, errors };
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

const when = (iso) => String(iso || '').replace('T', ' ').replace(/:\d\d(\.\d+)?(Z|[+-]\d\d:?\d\d)?$/, '');

const commentLines = (comments) => comments.map((comment) => `- ${comment.author} (${when(comment.at)}): ${comment.body.replace(/\s+/g, ' ').trim()}`);
const prLines = (prs) => prs.map((pr) => `- PR #${pr.pr} ${pr.title} · ${pr.state.toLowerCase()} into ${pr.base}${pr.checks ? ` · checks ${pr.checks}` : ''}${pr.review ? ` · ${pr.review.toLowerCase().replace('_', ' ')}` : ''} · ${pr.url}`);

const rowText = ({ row, comments, prs, handled }) => [
  `## ${row.key} · ${row.summary}`,
  `Status: ${row.status} · with: ${row.whose}${handled ? ' · marked handled' : ''}`,
  `Next step: ${row.next}${row.why ? `\nWhy: ${row.why}` : ''}`,
  ...(row.ticket_url ? [`Ticket: ${row.ticket_url}`] : []),
  ...(row.comment ? [`Last comment: ${row.comment}${row.comment_url ? ` (${row.comment_url})` : ''}`] : []),
  ...(prs.length ? ['', '### Pull requests', ...prLines(prs)] : []),
  ...(comments.length ? ['', '### Latest comments', ...commentLines(comments)] : []),
];

const feedText = ({ item, comments, prs }) => [
  `## ${item.ref} · ${item.kind}${item.who ? ` by ${item.who}` : ''} · ${when(item.at)}`,
  ...(item.key ? [`Ticket: ${item.key}`] : []),
  `Link: ${item.url}`,
  ...(item.body ? ['', item.body.trim()] : []),
  ...(prs.length ? ['', '### Pull requests', ...prLines(prs)] : []),
  ...(comments.length ? ['', '### Latest comments', ...commentLines(comments)] : []),
];

const workspaceText = ({ workspace, moves, waiting, todos, errors }) => [
  `## Workspace ${workspace.name}`,
  `Sources: ${workspace.connectors.map((connector) => connector.label).join(', ') || 'none'}`,
  '',
  `### Your move (${moves.length})`,
  ...(moves.length ? moves.map((row) => `- ${row.key} · ${row.summary} → ${row.next}${row.why ? ` (${row.why})` : ''}${row.url ? ` ${row.url}` : ''}`) : ['- nothing']),
  '',
  `### Waiting on others (${waiting.length})`,
  ...(waiting.length ? waiting.map((row) => `- ${row.key} · ${row.summary} · ${row.status} with ${row.whose}: ${row.next}`) : ['- nothing']),
  '',
  `### To do (${todos.length})`,
  ...(todos.length ? todos.map((todo) => `- ${todo.text}`) : ['- nothing']),
  ...(Object.keys(errors || {}).length ? ['', `Source errors: ${Object.entries(errors).map(([source, message]) => `${source}: ${message}`).join('; ')}`] : []),
];

/** The hand-off as Markdown a person can paste into any assistant. */
export const renderHandOff = (kind, context) => {
  const lines = kind === 'row' ? rowText(context) : kind === 'feed' ? feedText(context) : workspaceText(context);
  return `${lines.join('\n')}\n`;
};
