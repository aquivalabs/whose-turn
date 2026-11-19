import type { FeedItem, Snapshot } from '@/lib/types.ts';

const workspace: Snapshot['workspace'] = {
  id: 'demo',
  name: 'Demo',
  connectors: [{ id: 'github', type: 'github', label: 'GitHub' }],
  links: [],
  key_pattern: '\\bPROJ-\\d+\\b',
  theme: null,
};

const base: FeedItem = {
  id: 'c1',
  ref: 'PROJ-12',
  kind: 'comment',
  who: 'dana',
  at: '2026-11-02T10:00:00Z',
  source: 'github',
  url: 'https://example.com/your-org/your-repo/pull/12',
};

/** The comment each state opens, and the workspace that names its source. */
export const commentModalStorybookMock = {
  workspace,
  items: {
    formatted: {
      ...base,
      body: '## Retry\n\nCould you take another look at the **retry**?\n\n- backoff is now capped\n- the test covers a `503`\n\n> Sorry for the churn.',
    },
    plain: { ...base, body: '', text: 'Moved the date to Friday.' },
    'no link': { ...base, url: undefined, body: 'A comment from a source without a page of its own.' },
  } satisfies Record<string, FeedItem>,
};
