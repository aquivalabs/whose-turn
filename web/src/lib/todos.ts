import type { ApiError } from './types.ts';

export const UNREACHABLE = 'unreachable';
export const UNREACHABLE_TEXT = 'The local server is not answering; your text is kept.';

/** The line to show under the to-do field for a refused write (its error envelope) or a network failure; empty when the write went through. */
export const todoProblem = (outcome: { error?: ApiError } | Error | null | undefined): string => {
  if (outcome instanceof Error) {
    return outcome.message === UNREACHABLE ? UNREACHABLE_TEXT : outcome.message;
  }
  if (outcome && !Array.isArray(outcome) && outcome.error) {
    return outcome.error.message || 'The server refused the change.';
  }
  return '';
};
