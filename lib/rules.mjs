/** The "whose turn" rules and the feed, evaluated once on the server over a workspace's merged sources. See README "Rules". */
import { DAY, toIsoUtc, nowIso, daysAgoIso, oneline, escapeRegex, wordsRegex, newestFirst } from './text.mjs';

const shortDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export const compileRules = (rules) => {
  const statusWords = Object.fromEntries(Object.entries(rules.statuses).map(([group, words]) => [group, wordsRegex(words)]));
  const automation = wordsRegex(rules.automation_authors);
  const question = new RegExp(`\\?|\\b(${rules.question_words.map(escapeRegex).join('|')})\\b`, 'i');
  return {
    ...rules,
    statusIs: (group, status) => statusWords[group].test(status || ''),
    isAutomation: (author) => automation.test(author || ''),
    isQuestion: (body) => question.test(body.replace(/https?:\/\/\S+/g, '')),
  };
};

const BLANK_ROW = {
  group: 'you', whose: 'You', done: false, started: false, rank: 3, why: '', hold_url: '', hold_full: '', status_since: '',
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
    const byMover = ticketComments.filter((comment) => comment.author === change.by).sort((a, b) => Math.abs(new Date(a.at) - holdTime) - Math.abs(new Date(b.at) - holdTime))[0];
    if (byMover && Math.abs(new Date(byMover.at) - holdTime) < 2 * DAY) {
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

const ticketRow = (ticket, pr, ticketComments, myName, rules) => {
  const open = Boolean(pr && pr.state === 'OPEN');
  const done = ticket.status_category === 'done';
  const status = ticket.status;
  const onMe = Boolean(myName) && ticket.assignee === myName;
  const built = row({
    key: ticket.key, row_id: ticket.key, source: ticket.source, summary: ticket.summary, status, whose: ticket.assignee, next: 'Not yours now',
    group: done ? 'done' : 'others', done, ticket_url: ticket.url, updated: ticket.updated, status_since: ticket.status_change ? ticket.status_change.since : '',
    activity_at: [toIsoUtc(ticket.updated), pr ? pr.updated_at : ''].filter(Boolean).sort().pop(),
    ...(pr ? prCells(pr, open) : {}),
  });
  const mine = (next, why, rank = 3) => Object.assign(built, { whose: 'You', next, group: 'you', why, rank });
  if (!done && rules.statusIs('backlog', status) && !open) {
    if (rules.backlog_rows === 'list') {
      built.next = status;
    } else {
      built.group = 'gone';
    }
  } else if (open && pr.checks === 'failing') {
    mine('Look at the failing checks', `PR #${pr.pr} has failing checks.`, 0);
  } else if (open && pr.review === 'CHANGES_REQUESTED') {
    mine('Address the requested changes', `A reviewer requested changes on PR #${pr.pr}.`, 1);
  } else if (open && pr.unanswered) {
    mine('Read and answer the new comment', `${pr.last_comment_by} commented on PR #${pr.pr} after your last reply there.`);
  } else if (rules.statusIs('passed', status)) {
    mine(rules.passed_next, `Ticket status is ${status}: QA passed, the PR can go in.`);
  } else if (done && open) {
    mine('Ticket is Done but the PR is open: merge it', `The ticket is ${status} while PR #${pr.pr} is still open.`);
  } else if (!done && pr && pr.state === 'MERGED' && onMe) {
    mine(rules.merged_next, `PR #${pr.pr} is merged but the ticket is still ${status} and on you.`);
  } else if (rules.statusIs('code_review', status) && open && pr.review === 'APPROVED') {
    const release = pr.base.startsWith(rules.release_branch_prefix);
    mine(release ? rules.approved_release_next : rules.approved_next, `PR #${pr.pr} into ${pr.base} is approved; the ticket is still in ${status}.`);
  } else if (rules.statusIs('code_review', status)) {
    Object.assign(built, { whose: 'Reviewer', next: 'Code review' });
  } else if (rules.statusIs('qa', status)) {
    built.next = 'QA';
  } else if (rules.statusIs('on_hold', status)) {
    const reason = holdReason(ticketComments, ticket);
    Object.assign(built, { next: reason ? `On hold: ${reason.text}` : 'On hold', hold_url: reason ? reason.url : '', hold_full: reason ? reason.full : '' });
  } else if (!done && onMe) {
    const started = ticket.status_category === 'indeterminate';
    mine(started ? 'Continue the work' : 'Pick it up', `Assigned to you${started ? ' and in progress' : ''}, status ${status}, no PR step pending.`, started ? 2 : 3);
    built.started = started;
  }
  return built;
};

const orphanPrRow = (key, pr, ticketUrl) => row({
  key, row_id: key, source: pr.source, summary: pr.title, status: 'Not in your ticket list', next: 'Check the ticket for this open PR',
  why: `PR #${pr.pr} is open, but its ticket is not among your tickets.`, ticket_url: ticketUrl(key), updated: pr.updated_at, activity_at: pr.updated_at,
  ...prCells(pr, true),
});

const askRow = (ask, ticketUrl) => {
  const review = ask.kind === 'review requested';
  return row({
    key: ask.key || ask.ref, row_id: ask.id, source: ask.source, summary: ask.title, status: review ? 'Review requested' : 'Mentioned',
    next: review ? `Review PR ${ask.ref}` : `Answer ${ask.who} on ${ask.ref}`,
    why: review ? `${ask.who} asked you to review ${ask.ref} and you are still in its reviewer list.` : `${ask.who} @-mentioned you on ${ask.ref}; you have not commented there since.`,
    ticket_url: ask.key ? ticketUrl(ask.key) : '', pr: ask.ref, pr_url: ask.url, comment: review ? '' : `${ask.who}: ${ask.text}`, comment_url: ask.url,
    updated: ask.at, activity_at: ask.at, url: ask.url,
  });
};

const mentionRow = (ticketRowValue, { comment, question }) => row({
  key: ticketRowValue.key, row_id: `${ticketRowValue.key}:${comment.id}`, source: comment.source, summary: ticketRowValue.summary, status: ticketRowValue.status,
  next: question ? `Answer ${comment.author} in the ticket` : `Read ${comment.author}’s comment in the ticket`,
  why: `${comment.author}${question ? ' asked you a question' : ' mentioned you'} on ${shortDate(comment.at)}; you have not @-mentioned them in a reply since.`,
  ticket_url: ticketRowValue.ticket_url, comment: `${comment.author}: ${oneline(comment.body, 160)}`, comment_url: comment.url,
  updated: comment.at, activity_at: comment.at, url: comment.url,
});

export const turnRows = ({ tickets = [], prs = [], comments = [], asks = [] }, { me = {}, rules, historyDays = 14, ticketUrl = () => '' }) => {
  const prsByKey = groupBy(prs, (pr) => pr.key);
  const commentsByKey = groupBy(comments, (comment) => comment.key);
  const ticketKeys = new Set(tickets.map((ticket) => ticket.key));
  const mentions = openMentions(comments, me, rules, daysAgoIso(historyDays));
  const rows = tickets.map((ticket) => ticketRow(ticket, pickPr(prsByKey.get(ticket.key)), commentsByKey.get(ticket.key) || [], me[ticket.source], rules));
  for (const [key, list] of prsByKey) {
    const pr = pickPr(list);
    if (!ticketKeys.has(key) && pr.state === 'OPEN') {
      rows.push(orphanPrRow(key, pr, ticketUrl));
    }
  }
  for (const ask of asks) {
    rows.push(askRow(ask, ticketUrl));
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

const feedItem = (fields) => ({ who: '', text: '', body: '', key: '', ...fields });

export const feedRows = ({ activity = [], events = [], tickets = [], comments = [], asks = [] }, { me = {}, rules, historyDays = 14 }) => {
  const cutoff = daysAgoIso(historyDays);
  const recentComments = comments.filter((comment) => comment.at >= cutoff);
  const rows = [
    ...asks.map((ask) => feedItem({ id: ask.id, at: ask.at, source: ask.source, ref: ask.ref, key: ask.key, kind: ask.kind, who: ask.who, text: ask.text, body: ask.body, url: ask.url })),
    ...activity.map((item) => feedItem({ id: `act:${item.url}:${item.at}`, at: item.at, source: item.source, ref: item.pr, key: item.key, kind: item.kind, who: item.who, text: item.text, body: item.body || item.text, url: item.url })),
    ...recentComments.map((comment) => {
      const fromMe = Boolean(me[comment.source]) && comment.author === me[comment.source];
      return feedItem({
        id: `comment:${comment.source}:${comment.id}`, at: comment.at, source: comment.source, ref: comment.key, key: comment.key, kind: 'comment', who: fromMe ? 'you' : comment.author,
        mention: !fromMe && !rules.isAutomation(comment.author) && Boolean(me[comment.source]) && comment.body.includes(`@${me[comment.source]}`),
        text: oneline(comment.body), body: comment.body, url: comment.url,
      });
    }),
    ...events.map((event) => feedItem({ id: `event:${event.key}:${event.at}:${event.kind}`, at: event.at, source: event.source, ref: event.key, key: event.key, kind: event.kind, text: event.text, url: event.url })),
  ];
  const timesByKey = groupBy([...events, ...recentComments], (item) => item.key);
  for (const ticket of tickets) {
    const explained = (timesByKey.get(ticket.key) || []).some((item) => Math.abs(new Date(item.at) - new Date(ticket.updated)) < 5 * 60000);
    if (!explained) {
      rows.push(feedItem({ id: `ticket:${ticket.source}:${ticket.key}:${ticket.updated}`, at: toIsoUtc(ticket.updated), source: ticket.source, ref: ticket.key, key: ticket.key, kind: 'updated', text: `${ticket.status} · ${ticket.assignee}`, url: ticket.url }));
    }
  }
  return newestFirst(rows);
};

export const isHandled = (candidate, marks) => {
  const handledAt = marks.handled[candidate.row_id];
  return Boolean(handledAt) && String(candidate.activity_at || '') <= handledAt;
};

export const myMoves = (rows, marks) => rows.filter((candidate) => candidate.group === 'you' && !isHandled(candidate, marks));

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


