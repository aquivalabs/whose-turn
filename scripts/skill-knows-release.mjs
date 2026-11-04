#!/usr/bin/env node
// Refuses a release unless the BladeForge whose-turn skill covers the version in package.json. RMA-328.
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const HINT = 'merge the skill sync first (RMA-325)';
const SKILL_VERSION_PATH = 'repos/aquivalabs/BladeForge/contents/plugins/whose-turn/monitor-version?ref=main';

/** The skill's covered version from BladeForge main through gh; a missing file or a failed call throws; the gh runner is injectable. */
export const fetchSkillVersion = async (runGh = run) => {
  const { stdout } = await runGh('gh', ['api', SKILL_VERSION_PATH, '--jq', '.content']);
  return Buffer.from(stdout, 'base64').toString('utf8').trim();
};

/** The refusal line, or null when the skill covers the version; fetch is injectable. */
export const checkSkillKnows = async (version, fetchVersion = fetchSkillVersion) => {
  let covered;
  try {
    covered = await fetchVersion();
  } catch (failure) {
    return `The BladeForge whose-turn skill version could not be read (${failure.message.split('\n')[0]}): ${HINT}`;
  }
  return covered === version ? null : `The BladeForge whose-turn skill covers ${covered || 'nothing'}, not ${version}: ${HINT}`;
};

const main = async () => {
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const refusal = await checkSkillKnows(version);
  if (refusal) {
    console.error(refusal);
    process.exit(1);
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
