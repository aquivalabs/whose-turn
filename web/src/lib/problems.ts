// What a write that did not go through tells the user, next to the control that sent it.
import type { ApiError } from './types.ts';

export const UNREACHABLE = 'unreachable';
export const SERVER_DOWN = 'The local server is not answering';
export const UNREACHABLE_TEXT = SERVER_DOWN + '; try again once it is back.';
export const TEXT_KEPT = SERVER_DOWN + '; your text is kept.';

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
  return error ? refused + ': ' + (error.message || 'the server refused the change.') : '';
};
