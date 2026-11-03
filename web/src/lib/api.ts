// The local server's API: JSON in, JSON out; a workspace write always names its workspace (RMA-115).
import type { ApiError, ApiErrorDetail } from './types.ts';

/** Resolves with the reply (a refusal is its error envelope); rejects with Error('unreachable') when the server cannot be reached. */
export const getJson = <T>(url: string): Promise<T> =>
  fetch(url).then(
    (response) => response.json() as Promise<T>,
    () => Promise.reject(new Error('unreachable')),
  );
/** Resolves with the reply (a refusal is its error envelope); rejects with Error('unreachable') when the server cannot be reached. */
export const post = <T>(url: string, body?: object): Promise<T> =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  }).then(
    (response) => response.json() as Promise<T>,
    () => Promise.reject(new Error('unreachable')),
  );

const detailOf = <T extends ApiErrorDetail['@type']>(
  error: ApiError,
  type: T,
): Extract<ApiErrorDetail, { '@type': T }> | undefined =>
  (error.details || []).find(
    (detail): detail is Extract<ApiErrorDetail, { '@type': T }> => detail['@type'] === type,
  );

/** The field problems of a google.rpc.Status error envelope, or its one message. */
export const problemsOf = (error: ApiError): string[] => {
  const violations = detailOf(error, 'BadRequest');
  if (violations && violations.field_violations) {
    return violations.field_violations.map((violation) => violation.description);
  }
  const detail = detailOf(error, 'ErrorInfo')?.metadata?.detail;
  return [detail ? String(detail) : error.message];
};

/** The app-specific reason of a google.rpc.Status error envelope, or an empty string. */
export const reasonOf = (error: ApiError): string => detailOf(error, 'ErrorInfo')?.reason || '';

/** The hand-off text of a row, a thread, a feed item or a workspace, for the clipboard. */
export const handOffText = (query: Record<string, string>): Promise<string> =>
  fetch('/api/handoff?' + new URLSearchParams(query)).then((response) =>
    response.ok ? response.text() : Promise.reject(new Error(String(response.status))),
  );

/** Data from the sources is untrusted: only https links are followed. */
export const safeUrl = (url: unknown): string =>
  typeof url === 'string' && /^https:\/\//.test(url) ? url : '';
