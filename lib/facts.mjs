/** The closed fact dictionary the rules table reads: one flat object per ticket, computed from the normalized connector output. See docs/mechanisms/rules-table.md. */
import { DAY, oneline, newestFirst } from './text.mjs';

export const shortDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const CATEGORY_GROUPS = { new: 'todo', indeterminate: 'in_progress', done: 'done' };
const CHAIN_GROUPS = ['backlog', 'passed', 'code_review', 'qa', 'on_hold'];

/** Every fact a table row may test or quote: its type, the closed values when there are any, and where it comes from. */
export const FACTS = {
  connector: { type: 'string', from: 'the connector entry id the ticket came from' },
  'ticket.key': { type: 'string', from: 'tracker connectors (jira, linear)' },
  'ticket.status': { type: 'string', values: 'status groups', from: 'the ticket status matched against rules.statuses; else todo, in_progress or done from the status category' },
  'ticket.status_name': { type: 'string', from: 'the status as the tracker names it' },
  'ticket.assignee': { type: 'string', from: '"me" when the ticket is on you, else the assignee name' },
  'ticket.done': { type: 'boolean', from: 'the status category is done' },
  'ticket.started': { type: 'boolean', from: 'the status category is in progress' },
  'ticket.hold_reason': { type: 'string', from: 'the comment that explains an on_hold status; missing when none does' },
  'pr.open': { type: 'boolean', from: 'github: the ticket has an open PR; false when it has none' },
  'pr.merged': { type: 'boolean', from: 'github: the ticket PR is merged; false when it has none' },
  'pr.number': { type: 'number', from: 'github' },
  'pr.checks': { type: 'string', values: ['passing', 'failing', 'running', 'none'], from: 'github' },
  'pr.review': { type: 'string', values: ['approved', 'changes_requested', 'none'], from: 'github' },
  'pr.base': { type: 'string', from: 'github: the branch the PR goes into' },
  'pr.unanswered': { type: 'boolean', from: 'github: a human commented after your last comment and it is not an approval' },
  'pr.commenter': { type: 'string', from: 'github: the author of that last comment' },
  'comment.mentions_me': { type: 'boolean', from: 'tracker comments: an unanswered @-mention of you on the ticket' },
  'comment.is_question': { type: 'boolean', from: 'the newest unanswered mention reads as a question' },
  'comment.author': { type: 'string', from: 'the author of the newest unanswered mention' },
  unanswered_count: { type: 'number', from: 'how many @-mentions of you on the ticket are unanswered' },
  'run.failed': { type: 'boolean', from: 'github: the latest completed run of a workflow on the default branch failed; missing on tickets' },
  'run.workflow': { type: 'string', from: 'github: the name of that workflow' },
  'run.branch': { type: 'string', from: 'github: the branch it ran on, the default branch' },
  'run.mine': { type: 'boolean', from: 'github: you pushed the commit or started the run' },
};

/** The order status words are tried in: the chain's groups first, then any extra group in rules.statuses. */
export const statusGroupOrder = (statuses) => [...new Set([...CHAIN_GROUPS.filter((group) => group in statuses), ...Object.keys(statuses)])];

/** Every value ticket.status can take: the configured groups, then the category fallbacks. */
export const statusGroups = (statuses) => [...new Set([...statusGroupOrder(statuses), ...Object.values(CATEGORY_GROUPS)])];

/** The chain group a row carries as status_group for the window's pill tone: one of the chain's groups, else ''. */
export const chainGroup = (group) => (CHAIN_GROUPS.includes(group) ? group : '');

const statusGroupOf = (ticket, rules) => rules.statusOrder.find((group) => rules.statusIs(group, ticket.status)) || CATEGORY_GROUPS[ticket.status_category] || null;

const firstSentence = (body) => {
  const line = body.split('\n').map((candidate) => candidate.trim()).find((candidate) => candidate && !/^\[image\]$/.test(candidate)) || '';
  const stripped = line.replace(/^@[\w .'-]+?\s+[—–-]\s+/, '').replace(/^.*?on hold\s*[:—–-]\s*/i, '').trim() || line;
  return oneline(stripped.split(/(?<=[.!?])\s/)[0].replace(/\*\*|`/g, ''), 140);
};

export const holdReason = (ticketComments, ticket) => {
  const change = ticket.status_change;
  let chosen = null;
  if (change && change.since) {
    const holdTime = new Date(change.since).getTime();
    const byMover = ticketComments.filter((comment) => comment.author === change.by).sort((a, b) => Math.abs(new Date(a.at).getTime() - holdTime) - Math.abs(new Date(b.at).getTime() - holdTime))[0];
    if (byMover && Math.abs(new Date(byMover.at).getTime() - holdTime) < 2 * DAY) {
      chosen = byMover;
    }
    if (!chosen) {
      chosen = newestFirst(ticketComments.filter((comment) => new Date(comment.at).getTime() <= holdTime + 10 * 60000))[0] || null;
    }
  }
  if (!chosen) {
    chosen = newestFirst(ticketComments.filter((comment) => /on hold/i.test(comment.body)))[0] || null;
  }
  if (!chosen) {
    return null;
  }
  return { text: firstSentence(chosen.body), full: `${chosen.author} · ${shortDate(chosen.at)}\n\n${chosen.body.trim().slice(0, 1500)}`, url: chosen.url };
};

const prFacts = (pr) => {
  if (!pr) {
    return { 'pr.open': false, 'pr.merged': false };
  }
  return {
    'pr.open': pr.state === 'OPEN',
    'pr.merged': pr.state === 'MERGED',
    'pr.number': pr.pr,
    'pr.checks': pr.checks || null,
    'pr.review': pr.review ? pr.review.toLowerCase() : 'none',
    'pr.base': pr.base || null,
    'pr.unanswered': Boolean(pr.unanswered),
    'pr.commenter': pr.last_comment_by || null,
  };
};

const commentFacts = (mentions) => {
  const newest = mentions[mentions.length - 1];
  return {
    'comment.mentions_me': Boolean(newest),
    'comment.is_question': newest ? newest.question : null,
    'comment.author': newest ? newest.comment.author : null,
    unanswered_count: mentions.length,
  };
};

/** The facts of one failing workflow run (RMA-152); the ticket and PR facts are missing, so ticket rows never match it. */
export const runFacts = (run) => ({
  connector: run.source || null,
  'run.failed': Boolean(run.failed),
  'run.workflow': run.workflow,
  'run.branch': run.branch,
  'run.mine': Boolean(run.mine),
});

/** The facts of one ticket with its chosen PR, its comments and its open mentions of you (oldest first); the hold reason is returned whole for the row's link and tooltip. */
export const ticketFacts = (ticket, pr, { myName, rules, comments = [], mentions = [] }) => {
  const group = statusGroupOf(ticket, rules);
  const reason = group === 'on_hold' ? holdReason(comments, ticket) : null;
  const facts = {
    connector: ticket.source || null,
    'ticket.key': ticket.key,
    'ticket.status': group,
    'ticket.status_name': ticket.status,
    'ticket.assignee': myName && ticket.assignee === myName ? 'me' : ticket.assignee || null,
    'ticket.done': ticket.status_category === 'done',
    'ticket.started': ticket.status_category === 'indeterminate',
    'ticket.hold_reason': reason ? reason.text : null,
    ...prFacts(pr),
    ...commentFacts(mentions),
  };
  return { facts, reason };
};
