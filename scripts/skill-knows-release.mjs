#!/usr/bin/env node
// Refuses a release unless the BladeForge whose-turn skill covers the version in package.json and the plugin's tools match AGENT_TOOLS. RMA-328, RMA-416.
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { AGENT_TOOLS } from '../lib/diagnostics.mjs';

const run = promisify(execFile);
const HINT = 'merge the skill sync first (RMA-325)';
const SKILL_VERSION_PATH = 'repos/aquivalabs/BladeForge/contents/plugins/whose-turn/monitor-version?ref=main';
const PLUGIN_MCP_PATH = 'repos/aquivalabs/BladeForge/contents/plugins/whose-turn/bin/mcp.mjs?ref=main';

/** The skill's covered version from BladeForge main through gh; a missing file or a failed call throws; the gh runner is injectable. */
export const fetchSkillVersion = async (runGh = run) => {
  const { stdout } = await runGh('gh', ['api', SKILL_VERSION_PATH, '--jq', '.content']);
  return Buffer.from(stdout, 'base64').toString('utf8').trim();
};

/** The tool names the plugin's MCP server declares on BladeForge main, read through gh; the gh runner is injectable. */
export const fetchPluginTools = async (runGh = run) => {
  const { stdout } = await runGh('gh', ['api', PLUGIN_MCP_PATH, '--jq', '.content']);
  return [...Buffer.from(stdout, 'base64').toString('utf8').matchAll(/name: '(whose_turn_[a-z_]+)'/g)].map((match) => match[1]);
};

/** The refusal line, or null when the plugin's tools are exactly `known`; fetch is injectable. */
export const checkToolsMatch = async (known = AGENT_TOOLS, fetchTools = fetchPluginTools) => {
  let tools;
  try {
    tools = await fetchTools();
  } catch (failure) {
    return `The BladeForge whose-turn plugin tools could not be read (${failure.message.split('\n')[0]})`;
  }
  const missing = tools.filter((tool) => !known.includes(tool));
  const gone = known.filter((tool) => !tools.includes(tool));
  if (!missing.length && !gone.length) {
    return null;
  }
  return `AGENT_TOOLS in lib/diagnostics.mjs differs from the plugin's tools: ${[...missing.map((tool) => `missing ${tool}`), ...gone.map((tool) => `not in the plugin ${tool}`)].join(', ')}`;
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
  const refusals = (await Promise.all([checkSkillKnows(version), checkToolsMatch()])).filter(Boolean);
  if (refusals.length) {
    refusals.forEach((refusal) => console.error(refusal));
    process.exit(1);
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
