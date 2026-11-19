/** The one Linear GraphQL client, used by the Linear connector. */

import { RateLimited } from './failure.mjs';

const API = 'https://api.linear.app/graphql';
/** Linear's GraphQL error codes that mean an HTTP status; RMA-483. */
const STATUS_BY_CODE = { AUTHENTICATION_ERROR: 401, FORBIDDEN: 403 };

/** The `data` of one Linear GraphQL call with a personal API key; a GraphQL error throws, as RateLimited or with the status its code means. */
export const linearQuery = async (http, key, query, variables) => {
  const result = await http.fetchJson(API, { method: 'POST', body: { query, variables }, useEtag: false, headers: { Authorization: key, 'Content-Type': 'application/json' } });
  if (result.errors?.length) {
    const code = result.errors.map((error) => error.extensions?.code).find(Boolean);
    const message = result.errors.map((error) => error.message).join('; ');
    if (code === 'RATELIMITED') {
      throw new RateLimited(`Linear: ${message}`, { status: 429 });
    }
    throw Object.assign(new Error(message), STATUS_BY_CODE[code] ? { upstreamStatus: STATUS_BY_CODE[code] } : {});
  }
  return result.data;
};
