/** A fixture adapter under connector contract 1: a board with two cards and one comment, read from settings instead of a network. */
export const contract = 1;
export const id = 'board';
export const label = 'Board';
export const capabilities = ['tickets', 'comments'];
export const fields = [{ key: 'board', label: 'Board', required: true }];

/** @type {import('../../../types/connector.js').Adapter['poll']} */
export const poll = async ({ settings, secret }) => {
  const token = await secret();
  /** @type {(key: string, summary: string, status: string, category: import('../../../types/connector.js').Ticket['status_category']) => import('../../../types/connector.js').Ticket} */
  const card = (key, summary, status, category) => ({
    key, summary, status, status_category: category, assignee: 'Alex Doe', updated: '2026-11-02T10:00:00Z', url: `https://board.example/${settings.board}/${key}`,
  });
  return {
    me: 'Alex Doe',
    tickets: [card('BRD-1', 'Draft the onboarding email', 'Doing', 'indeterminate'), card('BRD-2', 'Pick the venue', 'Done', 'done')],
    comments: [{ id: 'k1', key: 'BRD-1', at: '2026-11-02T11:00:00Z', author: 'Sam Lead', body: '@Alex Doe can you share the draft today?', url: 'https://board.example/c/k1' }],
    errors: token ? {} : { auth: 'no token' },
  };
};
