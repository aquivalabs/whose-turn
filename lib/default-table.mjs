/** The plugin's default rules table, built from a workspace's rule texts; a workspace table replaces it or places it with the "default" marker. See docs/mechanisms/rules-table.md. */

export const defaultTable = (rules) => [
  {
    when: { 'run.failed': true, 'run.mine': true },
    then: { whose: 'you', next: 'Look at the failed run of {run.workflow} on {run.branch}', why: 'The latest {run.workflow} run on {run.branch} failed after your push.', rank: 0 },
  },
  { when: { 'run.failed': true }, then: { whose: 'hidden' } },
  {
    when: { 'ticket.status': 'backlog', 'ticket.done': false, 'pr.open': false },
    then: rules.backlog_rows === 'list' ? { whose: 'them', next: '{ticket.status_name}' } : { whose: 'hidden' },
  },
  {
    when: { 'pr.open': true, 'pr.checks': 'failing' },
    then: { whose: 'you', next: 'Look at the failing checks', why: 'PR #{pr.number} has failing checks.', rank: 0 },
  },
  {
    when: { 'pr.open': true, 'pr.review': 'changes_requested' },
    then: { whose: 'you', next: 'Address the requested changes', why: 'A reviewer requested changes on PR #{pr.number}.', rank: 1 },
  },
  {
    when: { 'pr.open': true, 'pr.unanswered': true },
    then: { whose: 'you', next: 'Read and answer the new comment', why: '{pr.commenter} commented on PR #{pr.number} after your last reply there.' },
  },
  {
    when: { 'ticket.status': 'passed' },
    then: { whose: 'you', next: rules.passed_next, why: 'Ticket status is {ticket.status_name}: QA passed, the PR can go in.' },
  },
  {
    when: { 'ticket.done': true, 'pr.open': true },
    then: { whose: 'you', next: 'Ticket is Done but the PR is open: merge it', why: 'The ticket is {ticket.status_name} while PR #{pr.number} is still open.' },
  },
  {
    when: { 'ticket.done': false, 'pr.merged': true, 'ticket.assignee': 'me' },
    then: { whose: 'you', next: rules.merged_next, why: 'PR #{pr.number} is merged but the ticket is still {ticket.status_name} and on you.' },
  },
  {
    when: { 'ticket.status': 'code_review', 'pr.open': true, 'pr.review': 'approved', 'pr.base': { prefix: rules.release_branch_prefix } },
    then: { whose: 'you', next: rules.approved_release_next, why: 'PR #{pr.number} into {pr.base} is approved; the ticket is still in {ticket.status_name}.' },
  },
  {
    when: { 'ticket.status': 'code_review', 'pr.open': true, 'pr.review': 'approved' },
    then: { whose: 'you', next: rules.approved_next, why: 'PR #{pr.number} into {pr.base} is approved; the ticket is still in {ticket.status_name}.' },
  },
  { when: { 'ticket.status': 'code_review' }, then: { whose: 'reviewer', next: 'Code review' } },
  { when: { 'ticket.status': 'qa' }, then: { whose: 'them', next: 'QA' } },
  { when: { 'ticket.status': 'on_hold', 'ticket.hold_reason': { present: true } }, then: { whose: 'them', next: 'On hold: {ticket.hold_reason}', hold: true } },
  { when: { 'ticket.status': 'on_hold' }, then: { whose: 'them', next: 'On hold' } },
  {
    when: { 'ticket.done': false, 'ticket.assignee': 'me', 'ticket.started': true },
    then: { whose: 'you', next: 'Continue the work', why: 'Assigned to you and in progress, status {ticket.status_name}, no PR step pending.', rank: 2, started: true },
  },
  {
    when: { 'ticket.done': false, 'ticket.assignee': 'me' },
    then: { whose: 'you', next: 'Pick it up', why: 'Assigned to you, status {ticket.status_name}, no PR step pending.' },
  },
  { when: {}, then: { whose: 'them', next: 'Not yours now' } },
];
