/** JSON over HTTPS with an ETag cache; a 304 is served from the cache and a rate limit throws RateLimited with its status, limit and reset. */
import { RateLimited } from './failure.mjs';
import { SECOND } from './text.mjs';

/** When a rate limit resets, from GitHub's `x-ratelimit-reset` (epoch seconds) or a `retry-after` in seconds; undefined when neither is there. */
const resetAtOf = (headers, now = Date.now()) => {
  const reset = Number(headers.get('x-ratelimit-reset'));
  if (reset > 0) {
    return reset * SECOND;
  }
  const retry = Number(headers.get('retry-after'));
  return retry > 0 ? now + retry * SECOND : undefined;
};

export const createHttpClient = () => {
  const etags = new Map();

  /** @param {string} url @param {{ headers?: object, method?: string, body?: string, useEtag?: boolean, keepBody?: boolean }} [options] */
  const fetchJson = async (url, { headers = {}, method = 'GET', body, useEtag = true, keepBody = false } = {}) => {
    const cacheable = useEtag && method === 'GET';
    const cached = cacheable ? etags.get(url) : undefined;
    const requestHeaders = { ...headers };
    if (cached) {
      requestHeaders['If-None-Match'] = cached.etag;
    }
    if (body !== undefined) {
      requestHeaders['Content-Type'] = 'application/json';
    }
    const response = await fetch(url, { method, headers: requestHeaders, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    if (response.status === 304 && cached) {
      return cached.payload;
    }
    const text = await response.text();
    if (response.status === 429 || (response.status === 403 && /rate limit/i.test(text))) {
      throw new RateLimited(`${response.status} from ${new URL(url).host}`, { status: response.status, resource: response.headers.get('x-ratelimit-resource') || undefined, resetAt: resetAtOf(response.headers) });
    }
    if (!response.ok) {
      throw Object.assign(new Error(`HTTP ${response.status} from ${new URL(url).host}${method === 'GET' ? ` for ${new URL(url).pathname}` : ''}`), { upstreamStatus: response.status, ...(keepBody ? { upstreamBody: text.slice(0, 2000) } : {}) });
    }
    const payload = text ? JSON.parse(text) : null;
    const etag = response.headers.get('etag');
    if (etag && cacheable) {
      etags.set(url, { etag, payload });
    }
    return payload;
  };

  return { fetchJson };
};
