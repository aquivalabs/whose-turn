/** A fixture adapter whose poll breaks the contract: a ticket without a status category, an http link, and a kind it did not declare. */
export const contract = 1;
export const id = 'sloppy';
export const label = 'Sloppy';
export const capabilities = ['tickets'];
export const fields = [];

export const poll = async () => ({
  me: 'Alex Doe',
  tickets: [{ key: 'S-1', summary: 'Half a ticket', status: 'Open', assignee: 'Alex Doe', updated: '2026-11-02T10:00:00Z', url: 'http://plain.example/S-1' }],
  prs: [],
});
