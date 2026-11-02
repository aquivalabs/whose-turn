// The local server's API: JSON in, JSON out; a workspace write always names its workspace (RMA-115).
export const getJson = (url) => fetch(url).then((r) => r.json());
export const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then((r) => r.json());

/** The field problems of a google.rpc.Status error envelope, or its one message. */
export const problemsOf = (error) => {
  const violations = (error.details || []).find((d) => d['@type'] === 'BadRequest');
  const info = (error.details || []).find((d) => d['@type'] === 'ErrorInfo');
  return violations ? violations.field_violations.map((v) => v.description) : [info && info.metadata && info.metadata.detail ? info.metadata.detail : error.message];
};

/** The hand-off text of a row, a thread, a feed item or a workspace, for the clipboard. */
export const handOffText = (query) => fetch('/api/handoff?' + new URLSearchParams(query)).then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))));

/** Data from the sources is untrusted: only https links are followed. */
export const safeUrl = (u) => (typeof u === 'string' && /^https:\/\//.test(u) ? u : '');
