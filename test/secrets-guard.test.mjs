import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secretsRequired } from '../connectors/index.mjs';

const jira = (overrides = {}) => ({ type: 'jira', id: 'jira', base: 'https://your-site.atlassian.net', email: 'you@example.com', ...overrides });
const current = [jira()];

test('an unchanged Jira entry needs no token again', () => {
  assert.deepEqual(secretsRequired(current, jira()), []);
});

test('a new endpoint, account or store entry for a stored token needs the token in the same request', () => {
  assert.deepEqual(secretsRequired(current, jira({ base: 'https://other-site.atlassian.net' })), ['token']);
  assert.deepEqual(secretsRequired(current, jira({ email: 'someone@example.com' })), ['token']);
  assert.deepEqual(secretsRequired(current, jira({ token_service: 'other-entry' })), ['token']);
});

test('a second entry reusing the same service, account and endpoint is fine; one reusing the account on another site is not', () => {
  assert.deepEqual(secretsRequired(current, jira({ id: 'jira-2' })), []);
  assert.deepEqual(secretsRequired(current, jira({ id: 'evil', base: 'https://evil.example' })), ['token']);
});

test('a connector without secret fields never asks for one', () => {
  assert.deepEqual(secretsRequired(current, { type: 'github', id: 'github', repo: 'you/app' }), []);
});
