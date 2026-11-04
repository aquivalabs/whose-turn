// What the window does when /api/state answers with an error.

export const NO_WORKSPACE_MESSAGE = 'No workspace configured. Add one with + in the rail.';

/** A refused state request is retried once without the remembered workspace; with none asked for there is nothing left to try. */
export const retryWithoutWorkspace = (asked: string) => asked !== '';
