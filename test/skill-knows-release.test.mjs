import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSkillKnows, fetchSkillVersion } from '../scripts/skill-knows-release.mjs';

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
