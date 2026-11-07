/** A fixture adapter that breaks the contract: no contract number, a bad id, an unknown capability, no poll of its own. */
import { Adapter } from './_whose-turn.mjs';

export default class Broken extends Adapter {
  id = 'Broken';
  label = 'Broken';
  capabilities = ['tickets', 'emails'];
}
