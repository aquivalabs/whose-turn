import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeIssue } from '../lib/compose.mjs';

const cliAnswer = (issue) => async () => JSON.stringify({ result: `Here you go:\n${JSON.stringify(issue)}` });

test('the assistant answer becomes title, kind and body; the prompt carries the remark and the context', async () => {
  let prompt = '';
  const run = async (text) => { prompt = text; return cliAnswer({ title: 'Chevron wraps on narrow feed', kind: 'bug', body: 'On a narrow feed the expand chevron drops to its own line.' })(); };
  const issue = await composeIssue('the arrow in the feed drops to a new line when the window is narrow', { about: '## Workspace Demo', run });
  assert.equal(issue.kind, 'bug');
  assert.equal(issue.composed_by, 'claude claude-haiku-5-5');
  const bare = await composeIssue('plain', { run: async () => JSON.stringify({ title: 'Plain', kind: 'idea', body: '' }), composer: { command: 'codex', args: ['exec'] } });
  assert.equal(bare.composed_by, 'codex');
  assert.equal(issue.title, 'Chevron wraps on narrow feed');
  assert.match(prompt, /the arrow in the feed/);
  assert.match(prompt, /## Workspace Demo/);
});

test('a failing or malformed CLI falls back to the first line as the title and a keyword kind', async () => {
  const broken = await composeIssue('the button is broken after a refresh\nsecond line', { run: async () => 'not json' });
  assert.deepEqual(broken, { title: 'the button is broken after a refresh', kind: 'bug', body: 'second line', composed_by: 'fallback' });
  const missing = await composeIssue('I want a dark theme behind a button', { run: async () => { throw new Error('ENOENT'); } });
  assert.equal(missing.kind, 'improvement');
  await assert.rejects(composeIssue('   '), /at least one line/);
});

test('the configured bug words of another language count, as stems, next to the English defaults', async () => {
  const fail = async () => { throw new Error('ENOENT'); };
  const configured = await composeIssue('der Knopf ist kaputtgegangen', { run: fail, bugWords: ['kaputt'] });
  assert.equal(configured.kind, 'bug');
  const unconfigured = await composeIssue('der Knopf ist kaputtgegangen', { run: fail });
  assert.equal(unconfigured.kind, 'improvement');
  const inside = await composeIssue('a debugger session', { run: fail });
  assert.equal(inside.kind, 'improvement');
});
