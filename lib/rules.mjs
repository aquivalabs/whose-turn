/** The "whose turn" rules and the feed, evaluated once on the server over a workspace's merged sources. Ticket rows and workflow run rows come from the rules table, see docs/mechanisms/rules-table.md. */
import { toIsoUtc, nowIso, daysAgoIso, oneline, escapeRegex, wordsRegex, newestFirst } from './text.mjs';
import { ticketFacts, runFacts, shortDate, statusGroupOrder, chainGroup } from './facts.mjs';
import { WHOSE, firstMatch, fillText, expandTable } from './table.mjs';
import { defaultTable } from './default-table.mjs';


export const compileRules = (rules) => {
  const statusWords = Object.fromEntries(Object.entries(rules.statuses).map(([group, words]) => [group, wordsRegex(words)]));
  const automation = wordsRegex(rules.automation_authors);
  const question = new RegExp(`\\?|\\b(${rules.question_words.map(escapeRegex).join('|')})\\b`, 'i');
  return {
    ...rules,
    table: expandTable(rules.table, defaultTable(rules)),
    statusOrder: statusGroupOrder(rules.statuses),
    statusIs: (group, status) => statusWords[group].test(status || ''),
    isAutomation: (author) => automation.test(author || ''),
    isQuestion: (body) => question.test(body.replace(/https?:\/\/\S+/g, '')),
  };
};

const youOr = (name, myName) => (myName && name === myName ? 'you' : name);

const BLANK_ROW = {
  group: 'you', whose: 'You', done: false, started: false, rank: 3, why: '', hold_url: '', hold_full: '', status_since: '', status_group: '',
  pr: '', pr_url: '', pr_state: '', checks: '', comment: '', comment_url: '', ticket_url: '', url: '',
};

const row = (fields) => {
  const built = { ...BLANK_ROW, ...fields };
  built.url = built.url || built.ticket_url || built.pr_url || built.comment_url;
  return built;
};

const prCells = (pr, withComment) => ({
  pr: `#${pr.pr}`, pr_url: pr.url, pr_state: pr.state, checks: pr.checks,
  comment: withComment && pr.last_comment_by ? `${pr.last_comment_by}: ${pr.last_comment}` : '', comment_url: withComment ? pr.last_comment_url : '',
});

const pickPr = (list = []) => list.reduce((best, pr) => {
  if (!best) {
    return pr;
  }
  if ((pr.state === 'OPEN') !== (best.state === 'OPEN')) {
    return pr.state === 'OPEN' ? pr : best;
  }
  return pr.updated_at > best.updated_at ? pr : best;
}, null);

const groupBy = (list, pick) => {
  const map = new Map();
  for (const item of list) {
    const key = pick(item);
    if (key) {
      (map.get(key) || map.set(key, []).get(key)).push(item);
    }
  }
  return map;
};

const openMentions = (comments, me, rules, cutoff) => {
  const asks = new Map();
  for (const comment of comments.filter((candidate) => candidate.at >= cutoff).sort((a, b) => String(a.at).localeCompare(String(b.at)))) {
    const myName = me[comment.source];
    if (!myName) {
      continue;
    }
    if (comment.author === myName) {
      const open = asks.get(comment.key);
      if (open) {
        asks.set(comment.key, open.filter((ask) => !comment.body.includes(`@${ask.comment.author}`)));
      }
      continue;
    }
    if (rules.isAutomation(comment.author) || !comment.body.includes(`@${myName}`)) {
      continue;
    }
    (asks.get(comment.key) || asks.set(comment.key, []).get(comment.key)).push({ comment, question: rules.isQuestion(comment.body) });
  }
  return asks;
};

const applyThen = (built, then, facts, reason, reviewers) => {
  const { label, group } = WHOSE[then.whose];
  Object.assign(built, {
    group: group || built.group,
    whose: then.whose === 'reviewer' && reviewers.length ? reviewers.join(', ') : label || built.whose,
    started: Boolean(then.started),
    rank: then.rank ?? built.rank,
    next: then.next ? fillText(then.next, facts) : built.next,
    why: fillText(then.why, facts),
    ...(then.hold && reason ? { hold_url: reason.url, hold_full: reason.full } : {}),
  });
};

const decided = (built, facts, rules, reason, reviewers = []) => {
  const matched = firstMatch(rules.table, facts);
  if (matched) {
    applyThen(built, matched.then, facts, reason, reviewers);
  }
  return built;
};

const ticketRow = (ticket, pr, context) => {
  const { facts, reason } = ticketFacts(ticket, pr, context);
  const open = facts['pr.open'];
  const done = facts['ticket.done'];
  const built = row({
    key: ticket.key, row_id: ticket.key, source: ticket.source, summary: ticket.summary, status: ticket.status, whose: youOr(ticket.assignee, context.myName), next: 'Not yours now',
    group: done ? 'done' : 'others', done, ticket_url: ticket.url, updated: ticket.updated, status_since: ticket.status_change ? ticket.status_change.since : '',
    status_group: chainGroup(facts['ticket.status']),
    activity_at: [toIsoUtc(ticket.updated), pr ? pr.updated_at : ''].filter(Boolean).sort().pop(),
    ...(pr ? prCells(pr, open) : {}),
  });
  return decided(built, facts, context.rules, reason, pr?.reviewers || []);
};

/** A failing workflow run on the default branch, decided by the table; keyed by repository, workflow and branch, and by its streak so a new breakage after a fix is a new move. */
const runRow = (run, rules, myName) => decided(row({
  key: run.ref, row_id: `run:${run.source}:${run.ref}:${run.streak}`, source: run.source, summary: run.title || run.workflow, status: 'Run failed', whose: youOr(run.actor, myName), next: 'Not yours now',
  group: 'others', updated: run.at, activity_at: run.at, url: run.url,
}), runFacts(run), rules, null);

const orphanPrRow = (key, pr, ticketUrl) => row({
  key, row_id: key, source: pr.source, summary: pr.title, status: 'Not in your ticket list', next: 'Check the ticket for this open PR',
  why: `PR #${pr.pr} is open, but its ticket is not among your tickets.`, ticket_url: ticketUrl(key), updated: pr.updated_at, activity_at: pr.updated_at,
  ...prCells(pr, true),
});

const askRow = (ask, ticketUrl) => {
  const review = ask.kind === 'review requested';
  return row({
    key: ask.key || ask.ref, row_id: ask.id, source: ask.source, summary: ask.title, status: review ? 'Review requested' : 'Mentioned',
    next: review ? `Review ${ask.key ? 'PR ' + ask.ref : 'this PR'}` : `Answer ${ask.who} on ${ask.key ? ask.ref : 'this PR'}`,
    why: review ? `${ask.who} asked you to review ${ask.ref} and you are still in its reviewer list.` : `${ask.who} @-mentioned you on ${ask.ref}; you have not commented there since.`,
    ticket_url: ask.key ? ticketUrl(ask.key) : '', pr: ask.ref, pr_url: ask.url, comment: review ? '' : `${ask.who}: ${ask.text}`, comment_url: ask.url,
    updated: ask.at, activity_at: ask.at, url: ask.url,
  });
};

const mentionRow = (ticketRowValue, { comment, question }) => row({
  key: ticketRowValue.key, row_id: `${ticketRowValue.key}:${comment.id}`, source: comment.source, summary: ticketRowValue.summary, status: ticketRowValue.status, status_group: ticketRowValue.status_group,
  next: question ? `Answer ${comment.author} in the ticket` : `Read ${comment.author}’s comment in the ticket`,
  why: `${comment.author}${question ? ' asked you a question' : ' mentioned you'} on ${shortDate(comment.at)}; you have not @-mentioned them in a reply since.`,
  ticket_url: ticketRowValue.ticket_url, comment: `${comment.author}: ${oneline(comment.body, 160)}`, comment_url: comment.url,
  updated: comment.at, activity_at: comment.at, url: comment.url,
});

export const turnRows = ({ tickets = [], prs = [], comments = [], asks = [], runs = [] }, { me = {}, rules, historyDays = 14, ticketUrl = () => '' }) => {
  const prsByKey = groupBy(prs, (pr) => pr.key);
  const commentsByKey = groupBy(comments, (comment) => comment.key);
  const ticketKeys = new Set(tickets.map((ticket) => ticket.key));
  const mentions = openMentions(comments, me, rules, daysAgoIso(historyDays));
  const rows = tickets.map((ticket) => ticketRow(ticket, pickPr(prsByKey.get(ticket.key)), {
    myName: me[ticket.source], rules, comments: commentsByKey.get(ticket.key) || [], mentions: mentions.get(ticket.key) || [],
  }));
  for (const [key, list] of prsByKey) {
    const pr = pickPr(list);
    if (!ticketKeys.has(key) && pr.state === 'OPEN') {
      rows.push(orphanPrRow(key, pr, ticketUrl));
    }
  }
  for (const ask of asks) {
    rows.push(askRow(ask, ticketUrl));
  }
  for (const run of runs) {
    rows.push(runRow(run, rules, me[run.source]));
  }
  for (const ticketRowValue of rows.slice()) {
    if (!ticketRowValue.done) {
      for (const mention of mentions.get(ticketRowValue.key) || []) {
        rows.push(mentionRow(ticketRowValue, mention));
      }
    }
  }
  return rows;
};

/** The feed id of a ticket event the monitor itself recorded. */
export const eventId = (event) => `event:${event.key}:${event.at}:${event.kind}`;

const feedItem = (fields) => ({ who: '', text: '', body: '', key: '', title: '', ...fields });

export const feedRows = ({ activity = [], events = [], tickets = [], comments = [], asks = [], notes = [] }, { me = {}, rules, historyDays = 14 }) => {
  const cutoff = daysAgoIso(historyDays);
  const recentComments = comments.filter((comment) => comment.at >= cutoff);
  const rows = [
    ...asks.map((ask) => feedItem({ id: ask.id, at: ask.at, source: ask.source, ref: ask.ref, key: ask.key, title: ask.title, kind: ask.kind, who: youOr(ask.who, me[ask.source]), text: ask.text, body: ask.body, url: ask.url })),
    ...activity.map((item) => feedItem({ id: `act:${item.url}:${item.at}`, at: item.at, source: item.source, ref: item.pr, key: item.key, title: item.title, kind: item.kind, who: youOr(item.who, me[item.source]), text: item.text, body: item.body || item.text, url: item.url })),
    ...recentComments.map((comment) => {
      const fromMe = Boolean(me[comment.source]) && comment.author === me[comment.source];
      return feedItem({
        id: `comment:${comment.source}:${comment.id}`, at: comment.at, source: comment.source, ref: comment.key, key: comment.key, kind: 'comment', who: youOr(comment.author, me[comment.source]),
        mention: !fromMe && !rules.isAutomation(comment.author) && Boolean(me[comment.source]) && comment.body.includes(`@${me[comment.source]}`),
        text: oneline(comment.body), body: comment.body, url: comment.url,
      });
    }),
    ...events.map((event) => feedItem({ id: eventId(event), at: event.at, source: event.source, ref: event.key, key: event.key, kind: event.kind, text: event.kind === 'reassigned' ? event.text.split(' → ').map((name) => youOr(name.trim(), me[event.source])).join(' → ') : event.text, url: event.url })),
    ...notes.map((note) => feedItem({ id: note.id, at: note.at, source: note.source, ref: note.key, key: note.key, kind: 'note', who: 'you', text: note.text, body: note.text, url: note.url })),
  ];
  const timesByKey = groupBy([...events, ...recentComments], (item) => item.key);
  for (const ticket of tickets) {
    const explained = (timesByKey.get(ticket.key) || []).some((item) => Math.abs(new Date(item.at).getTime() - new Date(ticket.updated).getTime()) < 5 * 60000);
    if (!explained) {
      rows.push(feedItem({ id: `ticket:${ticket.source}:${ticket.key}:${ticket.updated}`, at: toIsoUtc(ticket.updated), source: ticket.source, ref: ticket.key, key: ticket.key, kind: 'touched', text: `now ${ticket.status}, with ${youOr(ticket.assignee, me[ticket.source])}`, url: ticket.url }));
    }
  }
  return newestFirst(rows);
};

export const isHandled = (candidate, marks) => {
  const handledAt = marks.handled[candidate.row_id];
  return Boolean(handledAt) && String(candidate.activity_at || '') <= handledAt;
};

export const myMoves = (rows, marks) => rows.filter((candidate) => candidate.group === 'you' && !isHandled(candidate, marks));

/** The rows as the window gets them: each with its handled flag from the marks. */
export const withHandled = (rows, marks) => rows.map((candidate) => ({ ...candidate, handled: isHandled(candidate, marks) }));

/** The four header tiles: your open moves, waiting on others, open PRs with failing checks, done. */
export const turnCounts = (rows, marks) => ({
  mine: myMoves(rows, marks).length,
  others: rows.filter((candidate) => candidate.group === 'others').length,
  failing: rows.filter((candidate) => candidate.pr_state === 'OPEN' && candidate.checks === 'failing').length,
  done: rows.filter((candidate) => candidate.group === 'done').length,
});

export const ticketEvents = (before, after) => {
  const previous = new Map(before.map((ticket) => [`${ticket.source}:${ticket.key}`, ticket]));
  const out = [];
  for (const ticket of after) {
    const old = previous.get(`${ticket.source}:${ticket.key}`);
    if (!old) {
      continue;
    }
    if (old.status !== ticket.status) {
      out.push({ at: nowIso(), source: ticket.source, key: ticket.key, kind: 'status', text: `${old.status} → ${ticket.status}`, url: ticket.url });
    }
    if (old.assignee !== ticket.assignee) {
      out.push({ at: nowIso(), source: ticket.source, key: ticket.key, kind: 'reassigned', text: `${old.assignee} → ${ticket.assignee}`, url: ticket.url });
    }
  }
  return out;
};


