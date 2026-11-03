// The local server's API: JSON in, JSON out; a workspace write always names its workspace (RMA-115).
import type { ApiError } from './types.ts';

export const getJson = <T>(url: string): Promise<T> =>
  fetch(url).then((response) => response.json() as Promise<T>);
export const post = <T>(url: string, body?: object): Promise<T> =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  }).then((response) => response.json() as Promise<T>);

/** The field problems of a google.rpc.Status error envelope, or its one message. */
export const problemsOf = (error: ApiError): string[] => {
  const violations = (error.details || []).find((detail) => detail['@type'] === 'BadRequest');
  const info = (error.details || []).find((detail) => detail['@type'] === 'ErrorInfo');
  if (violations && violations.field_violations) {
    return violations.field_violations.map((violation) => violation.description);
  }
  return [info && info.metadata && info.metadata.detail ? info.metadata.detail : error.message];
};

/** The hand-off text of a row, a thread, a feed item or a workspace, for the clipboard. */
export const handOffText = (query: Record<string, string>): Promise<string> =>
  fetch('/api/handoff?' + new URLSearchParams(query)).then((response) =>
    response.ok ? response.text() : Promise.reject(new Error(String(response.status))),
  );

/** Data from the sources is untrusted: only https links are followed. */
export const safeUrl = (url: unknown): string =>
  typeof url === 'string' && /^https:\/\//.test(url) ? url : '';
