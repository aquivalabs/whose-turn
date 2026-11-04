/** Error envelope (google.rpc.Status) and the reason registry for the local API. */

const REASONS = {
  NOT_FOUND: { code: 404, status: 'NOT_FOUND', message: 'No such path.' },
  NO_SUCH_WORKSPACE: { code: 404, status: 'NOT_FOUND', message: 'No such workspace.' },
  NO_SUCH_TODO: { code: 404, status: 'NOT_FOUND', message: 'No such to-do.' },
  METHOD_NOT_ALLOWED: { code: 405, status: 'UNIMPLEMENTED', message: 'This path answers GET and POST only.' },
  UNKNOWN_ACTION: { code: 400, status: 'INVALID_ARGUMENT', message: 'Unknown action.' },
  INVALID_BODY: { code: 400, status: 'INVALID_ARGUMENT', message: 'The request body is not valid JSON.' },
  INVALID_ARGUMENT: { code: 400, status: 'INVALID_ARGUMENT', message: 'A required value is missing or has the wrong shape.' },
  INVALID_CONFIG: { code: 400, status: 'INVALID_ARGUMENT', message: 'The workspace list has problems; nothing was saved.' },
  NO_WORKSPACE: { code: 412, status: 'FAILED_PRECONDITION', message: 'No workspace is configured; open Settings to add one.' },
  NOT_CONFIGURED: { code: 412, status: 'FAILED_PRECONDITION', message: 'Feedback is not configured: set feedback.workspace, feedback.team and feedback.project in the config.' },
  UPSTREAM_FAILED: { code: 502, status: 'UNAVAILABLE', message: 'The tracker did not answer; try again in a minute.' },
  RATE_LIMITED: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'The source is rate-limited; try again later.' },
  OPEN_TOO_SOON: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'The window was just opened; wait a few seconds before opening it again.' },
  UPDATE_IN_PROGRESS: { code: 409, status: 'ABORTED', message: 'An update is already installing; the server restarts when it is done.' },
  UPDATE_UNAVAILABLE: { code: 412, status: 'FAILED_PRECONDITION', message: 'There is no update to apply: the server runs from a checkout or already runs the latest version.' },
  CHANGELOG_UNAVAILABLE: { code: 404, status: 'NOT_FOUND', message: 'This install has no readable CHANGELOG.md.' },
  FORBIDDEN_ORIGIN: { code: 403, status: 'PERMISSION_DENIED', message: 'Only the local window may call this API.' },
  INTERNAL: { code: 500, status: 'INTERNAL', message: 'The local server failed on this request; the details are in its log.' },
};

export class ApiError extends Error {
  constructor(reason, metadata = {}, violations = []) {
    const entry = REASONS[reason];
    super(entry.message);
    this.reason = reason;
    this.code = entry.code;
    this.status = entry.status;
    this.metadata = metadata;
    this.violations = violations;
    this.debug = '';
  }

  toEnvelope() {
    const details = /** @type {object[]} */ ([{ '@type': 'ErrorInfo', reason: this.reason, domain: 'whose-turn', metadata: this.metadata }]);
    if (this.violations.length) {
      details.push({ '@type': 'BadRequest', field_violations: this.violations.map((violation) => (typeof violation === 'string' ? { field: 'workspaces', description: violation } : violation)) });
    }
    if (this.debug && process.env.WHOSE_TURN_DEBUG === '1') {
      details.push({ '@type': 'DebugInfo', detail: this.debug });
    }
    return { error: { code: this.code, status: this.status, message: this.message, details } };
  }
}

/** The envelope of any failure: an ApiError as it is, anything else as INTERNAL with the raw text only under DebugInfo. */
export const toApiError = (error) => {
  if (error instanceof ApiError) {
    return error;
  }
  const internal = new ApiError('INTERNAL');
  internal.debug = String((error && error.message) || error);
  return internal;
};
