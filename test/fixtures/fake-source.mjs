/** A test source under connector contract 1: an Adapter that may return any kind, with the members the test gives. */
import { Adapter } from '../../lib/adapter.mjs';
import { KINDS } from '../../lib/contract.mjs';

export const fakeSource = (members) => Object.assign(new (class Fake extends Adapter {
  contract = 1;
  id = 'fake';
  label = 'Fake';
  capabilities = [...KINDS];
})(), members);
