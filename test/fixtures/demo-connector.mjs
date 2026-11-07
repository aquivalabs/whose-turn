/** Test fixture, never shipped: registers itself as `demo` on import. Three invented projects with every state the rules know, timestamps relative to now, and a little life on later polls. No network. */
import { toIsoUtc } from '../../lib/text.mjs';
import { CONNECTORS } from '../../connectors/index.mjs';

export const id = 'demo';
export const label = 'Demo';
export const links = () => [{ label: 'Demo tracker', url: 'https://demo.example/' }];
export const fields = [
  { key: 'scenario', label: 'Scenario', hint: 'northwind, atlas or garden', required: true, choices: ['northwind', 'atlas', 'garden'] },
  { key: 'part', label: 'Part', hint: 'tickets (the tracker side), code (PRs and asks), or empty for both' },
];

const HOUR = 3600000;
let base = Date.now();
const ago = (hours) => toIsoUtc(base - hours * HOUR);
const SITE = 'https://demo.example/browse/';
const REPO = 'https://github.com/example/';

const ticket = (key, summary, status, category, assignee, hoursAgo, sinceHours, changedBy) => ({
  key, summary, status, status_category: category, assignee, updated: ago(hoursAgo), url: `${SITE}${key}`,
  status_change: sinceHours === undefined ? null : { since: ago(sinceHours), by: changedBy || assignee },
});
const comment = (id, key, hoursAgo, author, body) => ({ id, key, at: ago(hoursAgo), author, body, url: `${SITE}${key}?focusedCommentId=${id}` });
const pr = (number, key, title, repo, overrides = {}) => ({
  pr: number, key, title, base: 'main', state: 'OPEN', review: '', checks: 'passing', merged_at: '', updated_at: ago(5), url: `${REPO}${repo}/pull/${number}`,
  last_comment_by: '', last_comment_at: '', last_comment_url: '', last_comment: '', unanswered: false, ...overrides,
});
const activity = (hoursAgo, number, key, kind, who, repo, text, body) => ({ at: ago(hoursAgo), pr: `${repo}#${number}`, key, kind, who, url: `${REPO}${repo}/pull/${number}`, text, body: body || text });
const failedRun = (id, repo, workflow, hoursAgo, title) => ({
  id, ref: `${repo}:${workflow}@main`, repo: `example/${repo}`, workflow, branch: 'main', failed: true, mine: true, actor: 'alex', title, url: `${REPO}${repo}/actions/runs/${id}`, at: ago(hoursAgo), streak: id,
});
const runActivity = (run) => ({ at: run.at, pr: run.ref, key: '', title: run.title, kind: 'check failed', who: run.workflow, url: run.url, text: `${run.workflow} on ${run.branch}`, body: '' });
const ask = (noteId, repo, number, title, key, kind, who, hoursAgo, text) => ({ id: `gha:${noteId}`, repo: `example/${repo}`, number, ref: `${repo}#${number}`, title, key, kind, who, at: ago(hoursAgo), url: `${REPO}${repo}/pull/${number}`, text, body: text });

const northwind = (polls) => {
  const me = 'Alex Doe';
  const tickets = [
    ticket('NW-142', 'Rounds: due dates differ between locales', 'Passed', 'indeterminate', me, 1, 1, 'Sam Tester'),
    ticket('NW-151', 'Export to CSV loses the header row on retry', 'In Progress', 'indeterminate', me, 3, 30),
    ticket('NW-137', 'Login page: remember the last used organisation', polls >= 3 ? 'Ready for QA' : 'Code Review', 'indeterminate', polls >= 3 ? 'Sam Tester' : me, polls >= 3 ? 0.1 : 20, polls >= 3 ? 0.1 : 26, polls >= 3 ? me : undefined),
    ticket('NW-171', 'Spike: search index on Postgres', 'In Progress', 'indeterminate', me, 9, 9),
    ticket('NW-129', 'Audit log keeps the deleted user name', 'Ready for QA', 'indeterminate', 'Sam Tester', 30, 29, me),
    ticket('NW-118', 'Nightly report email arrives twice', 'In QA', 'indeterminate', 'Sam Tester', 80, 79, me),
    ticket('NW-104', 'Invoice PDF: wrong currency symbol for CHF', 'On Hold', 'indeterminate', me, 120, 118, 'Pat Owner'),
    ticket('NW-160', 'Import wizard for legacy spreadsheets', 'Backlog', 'new', 'Unassigned', 200),
    ticket('NW-099', 'Dashboard tiles: tooltip on hover', 'Done', 'done', me, 50),
    ticket('NW-088', 'Rate limit on the search endpoint', 'Done', 'done', me, 140),
  ];
  const comments = [
    comment('c1', 'NW-142', 1, 'Sam Tester', 'Have tested this on staging and it is now QA passed. Please also test it in the customer org once merged.'),
    comment('c2', 'NW-151', 4, 'Pat Owner', `@${me} can you confirm the retry keeps the original delimiter? The client asked twice.`),
    comment('c3', 'NW-151', 6, me, '@Pat Owner yes, the delimiter comes from the first attempt; adding a test for it.'),
    comment('c4', 'NW-151', 2, 'Pat Owner', `@${me} and one more: does it cover TSV as well?`),
    comment('c5', 'NW-104', 118, 'Pat Owner', 'On hold: waiting for the vendor to confirm the CHF rounding rule, they promised an answer next week.'),
    comment('c6', 'NW-104', 140, me, 'Reproduced with the sample invoice, fix is a one-liner once we know the rule.'),
    comment('c7', 'NW-118', 70, 'Sam Tester', `@${me} fyi, moved to In QA, will run the nightly job twice tonight.`),
    comment('c8', 'NW-129', 28, 'Automation for Jira', 'Transitioned by rule "Ready for QA when PR approved".'),
    ...(polls >= 3 ? [comment('c9', 'NW-137', 0.1, 'Sam Tester', `@${me} picked it up, first pass looks good, one question: should the choice survive logout?`)] : []),
  ];
  const prs = [
    pr(3978, 'NW-142', 'NW-142 fix week start per locale', 'northwind-web', { base: 'release/2.5', review: 'APPROVED', updated_at: ago(2), last_comment_by: 'Chris Reviewer', last_comment_at: ago(3), last_comment: 'Nice find on the locale changing the week start.', last_comment_url: `${REPO}northwind-web/pull/3978#issuecomment-1` }),
    pr(3991, 'NW-151', 'NW-151 keep the header row on CSV retry', 'northwind-web', { checks: 'failing', updated_at: ago(1) }),
    pr(3985, 'NW-137', 'NW-137 remember the last organisation on login', 'northwind-web', { review: polls >= 3 ? 'APPROVED' : 'CHANGES_REQUESTED', updated_at: ago(polls >= 3 ? 0.2 : 19), last_comment_by: 'Chris Reviewer', last_comment_at: ago(19), last_comment: 'Please do not store the org id in localStorage without a namespace.', last_comment_url: `${REPO}northwind-web/pull/3985#discussion_r1`, unanswered: polls < 3 }),
    pr(3960, 'NW-129', 'NW-129 keep the user name in the audit log', 'northwind-web', { state: 'MERGED', merged_at: ago(31), updated_at: ago(31) }),
    pr(3940, 'NW-099', 'NW-099 dashboard tile tooltips', 'northwind-web', { state: 'MERGED', merged_at: ago(52), updated_at: ago(52) }),
  ];
  const acts = [
    activity(1, 3991, 'NW-151', 'check failed', 'unit-tests', 'northwind-web', ''),
    activity(3, 3978, 'NW-142', 'comment', 'Chris Reviewer', 'northwind-web', 'Nice find on the locale changing the week start.'),
    activity(19, 3985, 'NW-137', 'changes requested', 'Chris Reviewer', 'northwind-web', 'Please do not store the org id in localStorage without a namespace.', 'Please do not store the org id in `localStorage` without a namespace.\n\nTwo tabs with two organisations would overwrite each other. A `nw:` prefix plus the user id is enough.'),
    activity(31, 3960, 'NW-129', 'merged', '', 'northwind-web', ''),
    activity(52, 3940, 'NW-099', 'merged', '', 'northwind-web', ''),
    ...(polls >= 3 ? [activity(0.2, 3985, 'NW-137', 'approved', 'Chris Reviewer', 'northwind-web', 'Namespace added, looks good now.')] : []),
  ];
  const asks = [
    ask('n1', 'northwind-api', 512, 'Paginate the audit endpoint', 'NW-133', 'review requested', 'Chris Reviewer', 7, 'Paginate the audit endpoint'),
    ask('n2', 'northwind-infra', 77, 'Rotate the staging certificates', '', 'mentioned you', 'Pat Owner', 26, `@alex could you check whether the cron on staging still runs after the rotation?`),
  ];
  const runs = [failedRun(9001, 'northwind-web', 'scout-publish', 0.5, 'Merge pull request #3940 from example/nw-099-tooltips')];
  return { me, tickets, comments, prs, activity: [...acts, ...runs.map(runActivity)], asks, runs };
};

const atlas = (polls) => {
  const me = 'Alex Doe';
  const tickets = [
    ticket('ATL-77', 'Offline mode: queue edits made without network', 'In Review', 'indeterminate', me, 10, 12),
    ticket('ATL-81', 'Crash on rotating the map while loading', 'Testing', 'indeterminate', 'Jo Qa', 40, 36, me),
    ticket('ATL-64', 'Dark theme for the trip summary', 'Blocked', 'indeterminate', me, 90, 88, 'Dana Lead'),
    ticket('ATL-85', 'Accessibility labels on the bottom bar', 'Todo', 'indeterminate', me, 5),
    ticket('ATL-59', 'Share a trip as a link', 'Done', 'done', me, 100),
    ticket('ATL-90', 'Replace the deprecated map SDK', 'Backlog', 'new', 'Dana Lead', 300),
  ];
  const comments = [
    comment('a1', 'ATL-64', 88, 'Dana Lead', 'Blocked until design delivers the dark palette, see the Figma thread.'),
    comment('a2', 'ATL-77', 9, 'Dana Lead', `@${me} please add a screenshot of the queue indicator to the PR description`),
    comment('a3', 'ATL-81', 35, 'Jo Qa', 'Testing on the three devices now.'),
    ...(polls >= 4 ? [comment('a4', 'ATL-81', 0.1, 'Jo Qa', `@${me} reproduced once more on the small device, log attached, can you have a look?`)] : []),
  ];
  const prs = [
    pr(214, 'ATL-77', 'ATL-77 offline edit queue', 'atlas-mobile', { base: 'develop', updated_at: ago(9), last_comment_by: 'Dana Lead', last_comment_at: ago(9), last_comment: 'please add a screenshot of the queue indicator', last_comment_url: `${REPO}atlas-mobile/pull/214#issuecomment-3`, unanswered: true }),
    pr(209, 'ATL-81', 'ATL-81 guard the map rotation during load', 'atlas-mobile', { base: 'develop', state: 'MERGED', merged_at: ago(41), updated_at: ago(41) }),
    pr(198, 'ATL-59', 'ATL-59 share trip link', 'atlas-mobile', { base: 'develop', state: 'MERGED', merged_at: ago(101), updated_at: ago(101) }),
  ];
  const acts = [
    activity(9, 214, 'ATL-77', 'comment', 'Dana Lead', 'atlas-mobile', 'please add a screenshot of the queue indicator'),
    activity(41, 209, 'ATL-81', 'merged', '', 'atlas-mobile', ''),
    activity(101, 198, 'ATL-59', 'merged', '', 'atlas-mobile', ''),
  ];
  return { me, tickets, comments, prs, activity: acts, asks: [] };
};

const garden = () => {
  const me = 'alex';
  const prs = [
    pr(12, '', 'Water schedule: skip rainy days', 'garden-bot', { updated_at: ago(2), checks: 'running' }),
    pr(11, '', 'Soil sensor calibration', 'garden-bot', { state: 'MERGED', merged_at: ago(30), updated_at: ago(30) }),
    pr(9, '', 'Add the greenhouse zone', 'garden-bot', { state: 'MERGED', merged_at: ago(120), updated_at: ago(120) }),
  ];
  const acts = [
    activity(2, 12, '', 'comment', 'you', 'garden-bot', 'Rebased on the sensor change.'),
    activity(30, 11, '', 'merged', '', 'garden-bot', ''),
    activity(120, 9, '', 'merged', '', 'garden-bot', ''),
  ];
  return { me, tickets: [], comments: [], prs, activity: acts, asks: [ask('g1', 'garden-bot', 13, 'Frost warning notifications', '', 'review requested', 'Sam Friend', 4, 'Frost warning notifications')] };
};

const SCENARIOS = { northwind, atlas, garden };

export const poll = async ({ settings, cache }) => {
  const scenario = SCENARIOS[settings.scenario];
  if (!scenario) {
    throw new Error(`Unknown demo scenario "${settings.scenario}"; use northwind, atlas or garden`);
  }
  cache.polls = (cache.polls || 0) + 1;
  cache.base = cache.base || Date.now();
  base = cache.base;
  const scenarioData = scenario(cache.polls);
  const titles = new Map(scenarioData.prs.map((entry) => [entry.url, entry.title]));
  const data = { runs: [], ...scenarioData, activity: scenarioData.activity.map((item) => ({ ...item, title: item.title || titles.get(item.url) || '' })) };
  if (settings.part === 'tickets') {
    return { me: data.me, tickets: data.tickets, comments: data.comments, ticket_base: SITE, errors: {} };
  }
  if (settings.part === 'code') {
    return { me: data.me, prs: data.prs, activity: data.activity, asks: data.asks, runs: data.runs, errors: {} };
  }
  return { ...data, ticket_base: SITE, errors: {} };
};

CONNECTORS.demo = { id, label, links, fields, poll };
