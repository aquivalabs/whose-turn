// What a write that did not go through tells the user, next to the control that sent it.
import { reasonOf } from './api.ts';
import { NO_WORKSPACE_MESSAGE } from './load-retry.ts';
import type { ApiError } from './types.ts';

export const UNREACHABLE = 'unreachable';
export const SERVER_DOWN = 'The local server is not answering';
export const UNREACHABLE_TEXT = SERVER_DOWN + '; try again once it is back.';
export const TEXT_KEPT = SERVER_DOWN + '; your text is kept.';

/** What each reason of the server's error registry says to the user; any other reason shows the envelope's own message. */
export const REASON_COPY: Record<string, string> = {
  NO_WORKSPACE: NO_WORKSPACE_MESSAGE,
  NOT_CONFIGURED:
    "The maintainer's tracker is not connected on this machine, so nothing can be sent from here.",
  UPSTREAM_FAILED: 'The tracker did not answer; try again in a minute.',
  RATE_LIMITED: 'The source is rate-limited; the monitor backs off.',
  OPEN_TOO_SOON: 'The app window is already opening; give it a few seconds.',
  INTERNAL: 'The local server failed; see its log.',
};

/** The line for a refused request's error envelope: the copy of its reason, else the prefix and the envelope's message. */
export const errorProblem = (error: ApiError, refused = 'Not saved'): string =>
  REASON_COPY[reasonOf(error)] ||
  refused + ': ' + (error.message || 'the server refused the change.');

/** The line to show for a refused write (its error envelope) or a server that cannot be reached (Error('unreachable')); empty when the write went through. */
export const writeProblem = (
  outcome: unknown,
  { refused = 'Not saved', unreachable = UNREACHABLE_TEXT } = {},
): string => {
  if (outcome instanceof Error) {
    return outcome.message === UNREACHABLE ? unreachable : refused + ': ' + outcome.message;
  }
  if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome)) {
    return '';
  }
  const error = (outcome as { error?: ApiError }).error;
  return error ? errorProblem(error, refused) : '';
};
