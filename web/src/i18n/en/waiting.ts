// docs/mechanisms/i18n.md
export default {
  title: 'Waiting on others',
  tip: 'Tickets you touched in the last 30 days where someone else holds the next step: a reviewer, QA, or a new owner.',
  note: {
    backlog: 'Your backlog',
    others: 'Someone else holds the next step',
  },
  empty: 'Nothing is waiting on someone else.',
  noData:
    'No data: {names} is failing. Check the workspace settings. | No data: {names} are failing. Check the workspace settings.',
  col: {
    ticket: 'Ticket',
    status: 'Status',
    with: 'With',
    waitingFor: 'Waiting for',
    pr: 'PR',
    copyForAi: 'Copy for AI',
  },
  row: {
    you: 'you',
    approvedBy: ' approved by ',
    changesBy: ' changes requested by ',
    since: '{status} since {when}',
    for: 'for {age}',
    fullReason: 'Full reason',
    full: 'full',
  },
};
