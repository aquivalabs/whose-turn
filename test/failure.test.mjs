import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RateLimited, SetupError, describeFailure, errorClass, failureCode, pickFailure } from '../lib/failure.mjs';
import { linearQuery } from '../lib/linear-api.mjs';
import { resultProblems } from '../lib/contract.mjs';
import { failureToken } from '../lib/diagnostics.mjs';

// Axes 4, 5, 7, 8, 9, 12 n/a: pure functions of an error object and a clock passed in, no state, no IO.

const NOW = Date.parse('2026-11-19T12:00:00Z');
const fetchFailure = (code) => Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('x'), { code }) });

test('the error class comes from the cause errno first, then the own errno, then the name, else other', () => {
  assert.equal(errorClass(fetchFailure('ENOTFOUND')), 'ENOTFOUND');
  assert.equal(errorClass(fetchFailure('CERT_HAS_EXPIRED')), 'CERT_HAS_EXPIRED');
  assert.equal(errorClass(Object.assign(new Error('x'), { code: 'ECONNREFUSED' })), 'ECONNREFUSED');
  assert.equal(errorClass(fetchFailure('ESOMETHING_NEW')), 'TypeError');
  assert.equal(errorClass(Object.assign(new Error('x'), { name: 'TimeoutError' })), 'TimeoutError');
  assert.equal(errorClass(Object.assign(new Error('x'), { name: 'AcmePayrollError' })), 'other');
  assert.equal(errorClass(undefined), 'other');
});

test('a network timeout errno reads as TIMEOUT, a DNS failure stays UNKNOWN with its class, and a setup error keeps its own code', () => {
  assert.equal(failureCode(fetchFailure('UND_ERR_CONNECT_TIMEOUT')), 'TIMEOUT');
  assert.equal(failureCode(fetchFailure('ETIMEDOUT')), 'TIMEOUT');
  assert.equal(failureCode(fetchFailure('ENOTFOUND')), 'UNKNOWN');
  assert.equal(failureCode(new SetupError('NO_TOKEN', 'no key')), 'NO_TOKEN');
  assert.equal(failureCode(new SetupError('NO_FILE', 'gone')), 'NO_FILE');
});

test('a failure is described by closed values and numbers only: no message, no host', () => {
  // Setup
  const limited = new RateLimited('403 from api.acme-corp.example', { status: 403, resource: 'search', resetAt: NOW + 11.5 * 60000 });
  const dns = fetchFailure('ENOTFOUND');
  const http = Object.assign(new Error('HTTP 502 from jira.acme-corp.example for /rest'), { upstreamStatus: 502 });

  // Exercise + Verify
  assert.deepEqual(describeFailure(limited, NOW), { code: 'RATE_LIMITED', error: 'RateLimited', status: 403, limit: 'search', reset_min: 12 });
  assert.deepEqual(describeFailure(dns, NOW), { code: 'UNKNOWN', error: 'ENOTFOUND' });
  assert.deepEqual(describeFailure(http, NOW), { code: 'UPSTREAM_5XX', error: 'Error', status: 502 });
  assert.ok(!JSON.stringify([limited, dns, http].map((error) => describeFailure(error, NOW))).includes('acme'));
});

test('a limit that is not a plain word and a reset already past are dropped or floored', () => {
  const odd = new RateLimited('x', { resource: 'Search Bucket!', resetAt: NOW - 60000 });
  assert.deepEqual(describeFailure(odd, NOW), { code: 'RATE_LIMITED', error: 'RateLimited', reset_min: 0 });
});

test('Linear GraphQL codes become a rate limit or an HTTP status; an unknown code stays an error with no status (RMA-483)', async () => {
  // Setup
  const answering = (errors) => ({ fetchJson: async () => ({ errors }) });

  // Exercise
  const limited = await linearQuery(answering([{ message: 'Rate limit exceeded', extensions: { code: 'RATELIMITED' } }]), 'k', '{ viewer { id } }').catch((error) => error);
  const unauthenticated = await linearQuery(answering([{ message: 'bad key', extensions: { code: 'AUTHENTICATION_ERROR' } }]), 'k', 'q').catch((error) => error);
  const forbidden = await linearQuery(answering([{ message: 'no', extensions: { code: 'FORBIDDEN' } }]), 'k', 'q').catch((error) => error);
  const other = await linearQuery(answering([{ message: 'odd' }]), 'k', 'q').catch((error) => error);

  // Verify
  assert.deepEqual([failureCode(limited), failureCode(unauthenticated), failureCode(forbidden), failureCode(other)], ['RATE_LIMITED', 'UNAUTHENTICATED', 'FORBIDDEN', 'UNKNOWN']);
  assert.equal(limited.upstreamStatus, 429);
});

test('a poll result may carry failures of closed values; free text in one is a contract problem (RMA-483)', () => {
  assert.deepEqual(resultProblems({ failures: { pulls: { code: 'RATE_LIMITED', error: 'RateLimited', status: 403, limit: 'search', reset_min: 3 } } }, ['prs']), []);
  assert.equal(resultProblems({ failures: { pulls: { code: 'RATE_LIMITED', error: 'RateLimited', message: 'acme' } } }, ['prs']).length, 1);
  assert.equal(resultProblems({ failures: { pulls: { code: 'Whatever', error: 'other' } } }, ['prs']).length, 1);
  assert.equal(resultProblems({ failures: { pulls: { code: 'TIMEOUT', error: 'AcmeError' } } }, ['prs']).length, 1);
  assert.equal(resultProblems({ failures: 'pulls failed' }, ['prs']).length, 1);
});

test('a failure token names the part only from the connector closed list and keeps every value closed (RMA-483)', () => {
  assert.equal(failureToken('github', 'PARTIAL', { part: 'pulls', code: 'RATE_LIMITED', error: 'RateLimited', status: 403, limit: 'search', reset_min: 12 }), 'github:PARTIAL:pulls:RATE_LIMITED:403:search:reset12m');
  assert.equal(failureToken('jira', 'UNKNOWN', { code: 'UNKNOWN', error: 'ENOTFOUND' }), 'jira:UNKNOWN:ENOTFOUND');
  assert.equal(failureToken('module', 'PARTIAL', { part: 'acme_payroll', code: 'TIMEOUT', error: 'TimeoutError' }), 'other:PARTIAL:other:TIMEOUT:TimeoutError');
  assert.equal(failureToken('github', 'PARTIAL', { part: 'contract', code: 'PARSE_FAILED', error: 'ContractError' }), 'github:PARTIAL:contract:PARSE_FAILED:ContractError');
  assert.equal(failureToken('linear', 'NO_TOKEN', { code: 'NO_TOKEN', error: 'SetupError' }), 'linear:NO_TOKEN');
  assert.equal(failureToken('github', 'UNAUTHENTICATED'), 'github:UNAUTHENTICATED');
  assert.match(failureToken('github', 'PARTIAL', { part: 'pulls', code: 'RATE_LIMITED', error: 'RateLimited', status: 403, limit: 'a_very_long_limit_name_xx', reset_min: 99999 }), /^[A-Za-z0-9_.:+-]{1,64}$/);
});

test('a missing token or file fails the source with NO_TOKEN or NO_FILE, not UNKNOWN (RMA-483)', async () => {
  // Setup
  const { default: jira } = await import('../connectors/jira.mjs');
  const { default: linear } = await import('../connectors/linear.mjs');
  const { default: file } = await import('../connectors/file.mjs');
  const noSecret = { get: async () => '' };

  // Exercise
  const failures = await Promise.all([
    jira.poll({ settings: { base: 'https://tracker.example', email: 'pat@example.com' }, http: {}, secrets: noSecret, cache: {}, historyDays: 14 }).catch((error) => error),
    linear.poll({ settings: { workspace: 'acme' }, http: {}, secrets: noSecret, cache: {}, sinceIso: '2026-11-01T00:00:00Z' }).catch((error) => error),
    file.poll({ settings: { path: '/nonexistent/whose-turn-test/tasks.md' }, cache: {}, keyOf: () => null }).catch((error) => error),
  ]);

  // Verify
  assert.deepEqual(failures.map(failureCode), ['NO_TOKEN', 'NO_TOKEN', 'NO_FILE']);
});

test('a partial failure is reported by its most telling part, the same whatever order the parts came in', () => {
  // Setup
  const timeout = { code: 'TIMEOUT', error: 'TimeoutError' };
  const limited = { code: 'RATE_LIMITED', error: 'RateLimited' };
  const odd = { code: 'UNKNOWN', error: 'other' };

  // Exercise + Verify
  assert.deepEqual(pickFailure({ runs: timeout, pulls: limited }), ['pulls', limited]);
  assert.deepEqual(pickFailure({ pulls: limited, runs: timeout }), ['pulls', limited]);
  assert.deepEqual(pickFailure({ runs: odd, pulls: odd }), ['pulls', odd]);
  assert.deepEqual(pickFailure({ notifications: odd, contract: { code: 'PARSE_FAILED', error: 'ContractError' } }), ['contract', { code: 'PARSE_FAILED', error: 'ContractError' }]);
  assert.deepEqual(pickFailure({}), []);
});
