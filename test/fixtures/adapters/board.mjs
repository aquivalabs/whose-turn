/** A fixture adapter under connector contract 1: a board with two cards and one comment, read from settings instead of a network. */
import { Adapter } from './_whose-turn.mjs';

/** @typedef {import('../../../types/connector.js').Ticket} Ticket */

export default class Board extends Adapter {
  contract = 1;
  id = 'board';
  label = 'Board';
  capabilities = ['tickets', 'comments'];
  fields = [{ key: 'board', label: 'Board', required: true }];

  /** @param {import('../../../types/connector.js').PollContext} context */
  async poll({ settings, secret }) {
    const token = await secret();
    /** @type {(key: string, summary: string, status: string, category: Ticket['status_category']) => Ticket} */
    const card = (key, summary, status, category) => ({
      key, summary, status, status_category: category, assignee: 'Alex Doe', updated: '2026-11-02T10:00:00Z', url: `https://board.example/${settings.board}/${key}`,
    });
    return {
      me: 'Alex Doe',
      tickets: [card('BRD-1', 'Draft the onboarding email', 'Doing', 'indeterminate'), card('BRD-2', 'Pick the venue', 'Done', 'done')],
      comments: [{ id: 'k1', key: 'BRD-1', at: '2026-11-02T11:00:00Z', author: 'Sam Lead', body: '@Alex Doe can you share the draft today?', url: 'https://board.example/c/k1' }],
      errors: token ? {} : { auth: 'no token' },
    };
  }
}
