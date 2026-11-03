/** The one token cache of the connectors: a token read once and kept for ten minutes. */

const TOKEN_TTL = 10 * 60 * 1000;

/** The token `read` resolves to, kept in `cache.token` for ten minutes; an empty token is read again next time. */
export const cachedToken = async (cache, read) => {
  if (!cache.token || Date.now() - cache.tokenAt > TOKEN_TTL) {
    cache.token = await read();
    cache.tokenAt = Date.now();
  }
  return cache.token;
};
