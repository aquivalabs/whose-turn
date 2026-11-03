/** Error envelope (google.rpc.Status) and the reason registry for the local API. */

const REASONS = {
  NOT_FOUND: { code: 404, status: 'NOT_FOUND', message: 'No such path.' },
  NO_SUCH_WORKSPACE: { code: 404, status: 'NOT_FOUND', message: 'No such workspace.' },
  NO_SUCH_TODO: { code: 404, status: 'NOT_FOUND', message: 'No such to-do.' },
  UNKNOWN_ACTION: { code: 400, status: 'INVALID_ARGUMENT', message: 'Unknown action.' },
  INVALID_BODY: { code: 400, status: 'INVALID_ARGUMENT', message: 'The request body is not valid JSON.' },
  INVALID_ARGUMENT: { code: 400, status: 'INVALID_ARGUMENT', message: 'A required value is missing or has the wrong shape.' },
  INVALID_CONFIG: { code: 400, status: 'INVALID_ARGUMENT', message: 'The workspace list has problems; nothing was saved.' },
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
  }

  toEnvelope() {
    const details = [{ '@type': 'ErrorInfo', reason: this.reason, domain: 'whose-turn', metadata: this.metadata }];
    if (this.violations.length) {
      details.push({ '@type': 'BadRequest', field_violations: this.violations.map((description) => ({ field: 'workspaces', description })) });
    }
    return { error: { code: this.code, status: this.status, message: this.message, details } };
  }
}
