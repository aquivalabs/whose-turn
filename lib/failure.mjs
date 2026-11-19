/** What a failed poll or part was, read from the error object only, never from its message: a closed code, the HTTP status, a closed error class, and for a rate limit which limit and when it resets. RMA-483, docs/mechanisms/connector-contract.md § Failures. */
import { MINUTE } from './text.mjs';

/** Every failure code a source or a part can end with. */
export const FAILURE_CODES = ['UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'RATE_LIMITED', 'TIMEOUT', 'UPSTREAM_5XX', 'PARSE_FAILED', 'NO_TOKEN', 'NO_FILE', 'PARTIAL', 'UNKNOWN_TYPE', 'UNKNOWN'];

/** The error classes a failure may name: Node and undici errno codes, then error names; anything else is `other`. */
export const ERROR_CLASSES = [
  'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'EHOSTUNREACH', 'ENETUNREACH',
  'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'ERR_TLS_CERT_ALTNAME_INVALID',
  'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT',
  'TimeoutError', 'AbortError', 'SyntaxError', 'TypeError', 'ContractError', 'RateLimited', 'SetupError', 'Error',
];

const BY_STATUS = { 401: 'UNAUTHENTICATED', 403: 'FORBIDDEN', 404: 'NOT_FOUND' };
const BY_NAME = { TimeoutError: 'TIMEOUT', AbortError: 'TIMEOUT', SyntaxError: 'PARSE_FAILED', ContractError: 'PARSE_FAILED' };
const TIMEOUT_CLASSES = ['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT'];
const LIMIT = /^[a-z][a-z_]{0,23}$/;

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
  constructor(code, message) {
    super(message);
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
  return BY_NAME[error?.name] || (TIMEOUT_CLASSES.includes(errorClass(error)) ? 'TIMEOUT' : 'UNKNOWN');
};

/** One failure as a part or a source reports it: `{code, error, status?, limit?, reset_min?}`, every value closed or a number. */
export const describeFailure = (error, now = Date.now()) => {
  const status = error?.upstreamStatus;
  const limit = error instanceof RateLimited && LIMIT.test(error.resource || '') ? error.resource : undefined;
  const resetAt = error instanceof RateLimited ? error.resetAt : undefined;
  return {
    code: failureCode(error),
    error: errorClass(error),
    ...(Number.isInteger(status) && status >= 100 && status <= 599 ? { status } : {}),
    ...(limit ? { limit } : {}),
    ...(Number.isFinite(resetAt) ? { reset_min: Math.max(0, Math.ceil((resetAt - now) / MINUTE)) } : {}),
  };
};
