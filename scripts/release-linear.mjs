#!/usr/bin/env node
// Moves Ready for release issues to Done; dry run unless --apply. README § Developing, Releasing.
// Flags: --version, --team, --project, --keychain-service, --keychain-account.
// Defaults come from the config's optional release object (team, project, keychain_service, keychain_account). RMA-321.
import { readFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseArgs as nodeParseArgs } from 'node:util';
import { loadConfig } from '../lib/config.mjs';
import { createSecrets } from '../lib/secrets.mjs';

const LINEAR_URL = 'https://api.linear.app/graphql';
export const DEFAULTS = { team: 'RMA', project: 'whose-turn', keychainService: 'linear-api-key-write', keychainAccount: userInfo().username };
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
export const readReady = async (call, { team, project } = DEFAULTS) => {
  const issues = [];
  let doneStateId;
  let after = null;
  for (;;) {
    const data = await call(READ, { team, project, ready: READY, after });
    doneStateId ??= data.teams.nodes[0]?.states.nodes.find((state) => state.type === 'completed' && state.name === DONE)?.id;
    issues.push(...data.issues.nodes);
    if (!data.issues.pageInfo.hasNextPage) {
      break;
    }
    after = data.issues.pageInfo.endCursor;
  }
  if (!doneStateId) {
    throw new Error(`Team ${team} has no completed state named ${DONE}`);
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

const OPTIONS = {
  apply: { type: 'boolean' },
  version: { type: 'string' },
  team: { type: 'string' },
  project: { type: 'string' },
  'keychain-service': { type: 'string' },
  'keychain-account': { type: 'string' },
};

const CONFIG_KEYS = { team: 'team', project: 'project', keychainService: 'keychain_service', keychainAccount: 'keychain_account' };

/** The defaults with the config's optional release object laid over them. */
export const defaultsFrom = (release = {}) => Object.fromEntries(Object.entries(DEFAULTS).map(([key, fallback]) => [key, release[CONFIG_KEYS[key]] ?? fallback]));

/** The flags with the defaults applied; an unknown flag or one without a value throws. */
export const parseArgs = (argv, defaults = DEFAULTS) => {
  const { values } = nodeParseArgs({ args: argv, options: OPTIONS, strict: true });
  const given = { apply: values.apply, version: values.version, team: values.team, project: values.project, keychainService: values['keychain-service'], keychainAccount: values['keychain-account'] };
  return { apply: false, ...defaults, ...Object.fromEntries(Object.entries(given).filter(([, value]) => value !== undefined)) };
};

/** The whole run; the config, the secret lookup, fetch and the output are injectable. */
export const main = async ({
  argv = process.argv.slice(2),
  config = loadConfig(),
  getKey = (service, account) => createSecrets(config.dataDir).get(service, account),
  fetchFn = fetch,
  log = console.log,
} = {}) => {
  const { apply, version: given, ...options } = parseArgs(argv, defaultsFrom(config.release));
  const version = given || JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
  const key = await getKey(options.keychainService, options.keychainAccount);
  if (!key) {
    throw new Error(`No Linear key in the secret store (service ${options.keychainService}, account ${options.keychainAccount})`);
  }
  const call = callWith(fetchFn, key);
  const plan = planRelease({ ...(await readReady(call, options)), version });
  log(`${apply ? 'Applying' : 'Dry run'}: ${plan.moves.length} issue(s) from ${READY} to ${DONE} for ${version}`);
  for (const move of plan.moves) {
    log(`  ${move.identifier}  ${move.title}${move.comment ? `  [comment: ${move.comment}]` : ''}`);
  }
  if (apply) {
    await applyPlan(call, plan);
    log('Done.');
  } else {
    log('Nothing written. Pass --apply to write.');
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((failure) => {
    console.error(failure.message);
    process.exit(1);
  });
}
