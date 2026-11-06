// What a write that did not go through tells the user, next to the control that sent it.
import { reasonOf } from './api.ts';
import type { ApiError } from './types.ts';
import { text } from '../i18n/index.ts';

const UNREACHABLE = 'unreachable';
export const NO_WORKSPACE_MESSAGE = text('core.problems.noWorkspace');
export const SERVER_DOWN = text('core.problems.serverDown');
export const UNREACHABLE_TEXT = text('core.problems.unreachable');
export const TEXT_KEPT = text('core.problems.textKept');
const NOT_SAVED = text('core.problems.notSaved');

/** What each reason of the server's error registry says to the user; any other reason shows the envelope's own message. */
const REASON_COPY: Record<string, string> = {
  NO_WORKSPACE: NO_WORKSPACE_MESSAGE,
  UPSTREAM_FAILED: text('core.problems.upstreamFailed'),
  RATE_LIMITED: text('core.problems.rateLimited'),
  OPEN_TOO_SOON: text('core.problems.openTooSoon'),
  UPDATE_IN_PROGRESS: text('core.problems.updateInProgress'),
  UPDATE_UNAVAILABLE: text('core.problems.updateUnavailable'),
  INTERNAL: text('core.problems.internal'),
};

/** The line for a refused request's error envelope: the copy of its reason, else the prefix and the envelope's message. */
export const errorProblem = (error: ApiError, refused = NOT_SAVED): string =>
  REASON_COPY[reasonOf(error)] ||
  text('core.problems.refused', { prefix: refused, message: error.message || text('core.problems.serverRefused') });

/** The line to show for a refused write (its error envelope) or a server that cannot be reached (Error('unreachable')); empty when the write went through. */
export const writeProblem = (
  outcome: unknown,
  { refused = NOT_SAVED, unreachable = UNREACHABLE_TEXT } = {},
): string => {
  if (outcome instanceof Error) {
    return outcome.message === UNREACHABLE ? unreachable : text('core.problems.refused', { prefix: refused, message: outcome.message });
  }
  if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome)) {
    return '';
  }
  const error = (outcome as { error?: ApiError }).error;
  return error ? errorProblem(error, refused) : '';
};
