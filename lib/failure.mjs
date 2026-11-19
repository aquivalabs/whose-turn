/** What a failed poll or part was, read from the error object only, never from its message: a closed code, the HTTP status, a closed error class, and for a rate limit which limit and when it resets. ADR 0017, docs/mechanisms/connector-contract.md § Failures. */
import { MINUTE, intInRange, isObject } from './text.mjs';

/** Every failure code a source or a part can end with. */
export const FAILURE_CODES = ['UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'RATE_LIMITED', 'TIMEOUT', 'UPSTREAM_5XX', 'PARSE_FAILED', 'NO_TOKEN', 'NO_FILE', 'PARTIAL', 'UNKNOWN_TYPE', 'UNKNOWN'];

/** The code each error class means, where it means one; an errno is read from the cause first. */
const CODE_BY_CLASS = {
  ETIMEDOUT: 'TIMEOUT', UND_ERR_CONNECT_TIMEOUT: 'TIMEOUT', UND_ERR_HEADERS_TIMEOUT: 'TIMEOUT', UND_ERR_BODY_TIMEOUT: 'TIMEOUT', TimeoutError: 'TIMEOUT', AbortError: 'TIMEOUT',
  SyntaxError: 'PARSE_FAILED', ContractError: 'PARSE_FAILED',
};

/** Classes that say nothing beyond the code, so a report leaves them out. */
export const GENERIC_CLASSES = ['Error', 'RateLimited', 'SetupError'];

/** The error classes a failure may name: Node and undici errno codes, then error names; anything else is `other`. */
export const ERROR_CLASSES = [
  'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'EHOSTUNREACH', 'ENETUNREACH',
  'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'ERR_TLS_CERT_ALTNAME_INVALID',
  'UND_ERR_SOCKET', 'TypeError', ...Object.keys(CODE_BY_CLASS), ...GENERIC_CLASSES,
];

const BY_STATUS = { 401: 'UNAUTHENTICATED', 403: 'FORBIDDEN', 404: 'NOT_FOUND' };
const LIMIT = /^[a-z][a-z_]{0,23}$/;
const MAX_RESET_MIN = 9999;
const FAILURE_KEYS = ['code', 'error', 'status', 'limit', 'reset_min'];
/** The order a partial failure's parts are reported in: the one that also backs the source off first. */
const PART_ORDER = ['RATE_LIMITED', 'UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'UPSTREAM_5XX', 'TIMEOUT', 'PARSE_FAILED', 'UNKNOWN'];

/** A rate limit: the upstream status, which limit it was (GitHub's `x-ratelimit-resource`) and when it resets, when the response said. */
export class RateLimited extends Error {
  constructor(message, { status, resource, resetAt } = /** @type {{ status?: number, resource?: string, resetAt?: number }} */ ({})) {
    super(message);
    this.name = 'RateLimited';
    this.upstreamStatus = status;
    this.resource = resource;
    this.resetAt = resetAt;
  }
}

/** A source that cannot start: no token in the secret store, `gh` not logged in, a file that is not there. Its code is `NO_TOKEN` or `NO_FILE`. */
export class SetupError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = 'SetupError';
    this.failure = code;
  }
}

/** The closed class of an error: its cause's errno, its own errno, else its name, else `other`. */
export const errorClass = (error) => [error?.cause?.code, error?.code, error?.name].find((candidate) => ERROR_CLASSES.includes(candidate)) || 'other';

/** The closed code for a failed poll, from the error's class and upstream status only. */
export const failureCode = (error) => {
  if (error instanceof RateLimited) {
    return 'RATE_LIMITED';
  }
  if (error instanceof SetupError) {
    return error.failure;
  }
  const status = error?.upstreamStatus;
  if (BY_STATUS[status]) {
    return BY_STATUS[status];
  }
  if (status >= 500) {
    return 'UPSTREAM_5XX';
  }
  return CODE_BY_CLASS[errorClass(error)] || 'UNKNOWN';
};

/** One failure as a part or a source reports it: `{code, error, status?, limit?, reset_min?}`, every value closed or a number. */
export const describeFailure = (error, now = Date.now()) => {
  const status = error?.upstreamStatus;
  const limit = LIMIT.test(error?.resource || '') ? error.resource : undefined;
  return {
    code: failureCode(error),
    error: errorClass(error),
    ...(intInRange(status, 100, 599) ? { status } : {}),
    ...(limit ? { limit } : {}),
    ...(Number.isFinite(error?.resetAt) ? { reset_min: Math.min(MAX_RESET_MIN, Math.max(0, Math.ceil((error.resetAt - now) / MINUTE))) } : {}),
  };
};

/** True when `failure` is what `describeFailure` builds: closed values and numbers only. */
export const isFailure = (failure) =>
  isObject(failure) &&
  Object.keys(failure).every((key) => FAILURE_KEYS.includes(key)) &&
  FAILURE_CODES.includes(failure.code) &&
  (ERROR_CLASSES.includes(failure.error) || failure.error === 'other') &&
  (failure.status === undefined || intInRange(failure.status, 100, 599)) &&
  (failure.limit === undefined || LIMIT.test(failure.limit)) &&
  (failure.reset_min === undefined || intInRange(failure.reset_min, 0, MAX_RESET_MIN));

/** The line a failure shows in the window: the class or `rate limited`, then the message. */
export const errorLine = (error) => `${error instanceof RateLimited ? 'rate limited' : error?.name}: ${error?.message}`;

/** Records a failed part of a poll result in both its message map and its failure map. */
export const partFailed = (result, part, error) => {
  result.errors[part] = errorLine(error);
  result.failures[part] = describeFailure(error);
};

/** The part a partial failure is reported by, as `[part, failure]`: the most telling code first, then the part name, so it does not depend on order. */
export const pickFailure = (failures) =>
  Object.entries(failures).sort(([leftPart, left], [rightPart, right]) =>
    (PART_ORDER.indexOf(left.code) + 1 || PART_ORDER.length + 1) - (PART_ORDER.indexOf(right.code) + 1 || PART_ORDER.length + 1) || leftPart.localeCompare(rightPart),
  )[0] || [];
