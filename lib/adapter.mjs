/** The base class every source adapter extends, built-in or the user's own; see docs/mechanisms/connector-contract.md. */

/**
 * A source of tickets, comments, PRs, activity, asks or runs under the connector contract.
 * A subclass sets `contract`, `id`, `label`, `capabilities` and `fields`, and implements `poll(context)`.
 */
export class Adapter {
  /** @type {Array<{ key: string, label: string, hint?: string, required?: boolean, secret?: object, list?: boolean, boolean?: boolean, default?: boolean }>} */
  fields = [];
  /** @type {string[]} */
  persistedCache = [];
  badge = '';
  tone = '';
  experimental = false;
  reportable = true;

  /**
   * The quick links a workspace header shows for one connector entry; none unless the adapter says.
   * @param {Record<string, unknown>} _settings
   * @returns {Array<{ label: string, url: string }>}
   */
  // eslint-disable-next-line no-unused-vars
  links(_settings) {
    return [];
  }

  /**
   * One poll of the source; every adapter implements it, so the base only refuses.
   * @param {import('../types/connector.js').PollContext} _context
   * @returns {Promise<import('../types/connector.js').PollResult>}
   */
  // eslint-disable-next-line no-unused-vars
  async poll(_context) {
    throw new Error(`${this.constructor.name} does not implement poll(context)`);
  }
}
