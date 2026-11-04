#!/usr/bin/env node
// The release step on Linear: every whose-turn issue in "Ready for release" moves to Done, and each user report among them gets "Shipped in <version>."
// Dry-run by default; `--apply` writes. `--version <x>` overrides the version in package.json. RMA-321.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const LINEAR_URL = 'https://api.linear.app/graphql';
const TEAM = 'RMA';
const PROJECT = 'whose-turn';
const READY = 'Ready for release';
const DONE = 'Done';
const REPORT_LABEL = 'User report';

const READ = `
query Ready($team: String!, $project: String!, $ready: String!, $after: String) {
  teams(filter: { key: { eq: $team } }) { nodes { states { nodes { id name type } } } }
  issues(first: 100, after: $after, filter: {
    team: { key: { eq: $team } }, project: { name: { eqIgnoreCase: $project } }, state: { name: { eq: $ready } }
  }) {
    pageInfo { hasNextPage endCursor }
    nodes { id identifier title labels { nodes { name } } }
  }
}`;
const MOVE = 'mutation Move($id: String!, $state: String!) { issueUpdate(id: $id, input: { stateId: $state }) { success } }';
const COMMENT = 'mutation Comment($id: String!, $body: String!) { commentCreate(input: { issueId: $id, body: $body }) { success } }';

/** One GraphQL call; a failure names the step and never carries the key. */
const callWith = (fetchFn, key) => async (query, variables) => {
  const response = await fetchFn(LINEAR_URL, {
    method: 'POST',
    headers: { authorization: key, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const payload = await response.json();
  if (!response.ok || payload.errors?.length || !payload.data) {
    throw new Error(`Linear refused the request (HTTP ${response.status})`);
  }
  return payload.data;
};

/** The writes a release makes: pure, from the issues in Ready for release and the id of the Done state. */
export const planRelease = ({ issues, doneStateId, version }) => ({
  version,
  moves: issues.map((issue) => ({
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    stateId: doneStateId,
    comment: issue.labels.nodes.some((label) => label.name === REPORT_LABEL) ? `Shipped in ${version}.` : null,
  })),
});

/** Reads the team's Done state and every whose-turn issue in Ready for release, across pages. */
export const readReady = async (call) => {
  const issues = [];
  let doneStateId;
  let after = null;
  for (;;) {
    const data = await call(READ, { team: TEAM, project: PROJECT, ready: READY, after });
    doneStateId ??= data.teams.nodes[0]?.states.nodes.find((state) => state.type === 'completed' && state.name === DONE)?.id;
    issues.push(...data.issues.nodes);
    if (!data.issues.pageInfo.hasNextPage) {
      break;
    }
    after = data.issues.pageInfo.endCursor;
  }
  if (!doneStateId) {
    throw new Error(`Team ${TEAM} has no completed state named ${DONE}`);
  }
  return { issues, doneStateId };
};

/** Comment first, then move: a failed comment leaves the issue in Ready for release, so a rerun retries it. */
export const applyPlan = async (call, plan) => {
  for (const move of plan.moves) {
    if (move.comment) {
      await call(COMMENT, { id: move.id, body: move.comment });
    }
    await call(MOVE, { id: move.id, state: move.stateId });
  }
};

export const parseArgs = (argv) => {
  const version = argv.includes('--version') ? argv[argv.indexOf('--version') + 1] : undefined;
  return { apply: argv.includes('--apply'), version };
};

const main = async () => {
  const { apply, version: given } = parseArgs(process.argv.slice(2));
  const version = given || JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
  const key = execFileSync('security', ['find-generic-password', '-s', 'linear-api-key-write', '-w'], { encoding: 'utf8' }).trim();
  const call = callWith(fetch, key);
  const plan = planRelease({ ...(await readReady(call)), version });
  console.log(`${apply ? 'Applying' : 'Dry run'}: ${plan.moves.length} issue(s) from ${READY} to ${DONE} for ${version}`);
  for (const move of plan.moves) {
    console.log(`  ${move.identifier}  ${move.title}${move.comment ? `  [comment: ${move.comment}]` : ''}`);
  }
  if (apply) {
    await applyPlan(call, plan);
    console.log('Done.');
  } else {
    console.log('Nothing written. Pass --apply to write.');
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((failure) => {
    console.error(failure.message);
    process.exit(1);
  });
}
