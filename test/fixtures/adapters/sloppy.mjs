/** A fixture adapter whose poll breaks the contract: a ticket without a status category, an http link, and a kind it did not declare. */
import { Adapter } from './_whose-turn.mjs';

export default class Sloppy extends Adapter {
  contract = 1;
  id = 'sloppy';
  label = 'Sloppy';
  capabilities = ['tickets'];

  async poll() {
    return {
      me: 'Alex Doe',
      tickets: [{ key: 'S-1', summary: 'Half a ticket', status: 'Open', assignee: 'Alex Doe', updated: '2026-11-02T10:00:00Z', url: 'http://plain.example/S-1' }],
      prs: [],
    };
  }
}
