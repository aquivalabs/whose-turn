import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSkillKnows, checkToolsMatch, fetchPluginTools, fetchSkillVersion } from '../scripts/skill-knows-release.mjs';

test('a skill covering the released version passes', async () => {
  assert.equal(await checkSkillKnows('1.0.0-alpha.10', async () => '1.0.0-alpha.10'), null);
});

test('a skill covering another version refuses and names both', async () => {
  const refusal = await checkSkillKnows('1.0.0-alpha.10', async () => '1.0.0-alpha.9');
  assert.equal(refusal, 'The BladeForge whose-turn skill covers 1.0.0-alpha.9, not 1.0.0-alpha.10: merge the skill sync first (RMA-325)');
});

test('an empty version file refuses', async () => {
  assert.match(await checkSkillKnows('1.0.0', async () => ''), /covers nothing, not 1\.0\.0/);
});

test('a missing file refuses', async () => {
  const refusal = await checkSkillKnows('1.0.0', async () => {
    throw new Error('gh: Not Found (HTTP 404)');
  });
  assert.match(refusal, /could not be read \(gh: Not Found \(HTTP 404\)\).*merge the skill sync first/);
});

test('a failed fetch refuses', async () => {
  const refusal = await checkSkillKnows('1.0.0', async () => {
    throw new Error('connection refused');
  });
  assert.match(refusal, /could not be read \(connection refused\)/);
});

test('the gh answer is base64-decoded and trimmed', async () => {
  const calls = [];
  const runGh = async (command, args) => {
    calls.push([command, args]);
    return { stdout: Buffer.from('1.0.0-alpha.10\n').toString('base64') + '\n' };
  };
  assert.equal(await fetchSkillVersion(runGh), '1.0.0-alpha.10');
  assert.equal(calls[0][0], 'gh');
  assert.match(calls[0][1].join(' '), /plugins\/whose-turn\/monitor-version\?ref=main/);
});

test('a gh failure refuses the release', async () => {
  const runGh = async () => {
    throw new Error('gh: Not Found (HTTP 404)\nmore');
  };
  const refusal = await checkSkillKnows('1.0.0', () => fetchSkillVersion(runGh));
  assert.match(refusal, /could not be read \(gh: Not Found \(HTTP 404\)\)/);
});

test('plugin tools that match the known list pass, in any order (RMA-416)', async () => {
  assert.equal(await checkToolsMatch(['whose_turn_a', 'whose_turn_b'], async () => ['whose_turn_b', 'whose_turn_a']), null);
});

test('a plugin tool the list lacks and a listed tool the plugin dropped both refuse, by name', async () => {
  const refusal = await checkToolsMatch(['whose_turn_a', 'whose_turn_old'], async () => ['whose_turn_a', 'whose_turn_new']);
  assert.equal(refusal, "AGENT_TOOLS in lib/diagnostics.mjs differs from the plugin's tools: missing whose_turn_new, not in the plugin whose_turn_old");
});

test('plugin tools that cannot be read refuse', async () => {
  assert.match(await checkToolsMatch(['whose_turn_a'], async () => { throw new Error('gh: Not Found (HTTP 404)'); }), /plugin tools could not be read \(gh: Not Found/);
});

test('the plugin tool names are read from the name fields of its MCP source on BladeForge main', async () => {
  const source = "const tools = [\n  { name: 'whose_turn_summary', run: () => 1 },\n  { name: 'whose_turn_quit' },\n];\nconst other = { name: 'not_a_tool' };";
  const calls = [];
  const runGh = async (command, args) => {
    calls.push(args.join(' '));
    return { stdout: Buffer.from(source).toString('base64') };
  };
  assert.deepEqual(await fetchPluginTools(runGh), ['whose_turn_summary', 'whose_turn_quit']);
  assert.match(calls[0], /plugins\/whose-turn\/bin\/mcp\.mjs\?ref=main/);
});
