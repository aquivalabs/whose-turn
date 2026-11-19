import type { ConnectorSummary, FeedItem } from '@/lib/types.ts';
import { hoursAgo } from '@/stories/fixtures.ts';

const base = { ref: 'PROJ-12', who: 'dana', url: 'https://example.com/your-org/your-repo/pull/12', source: 'github' };

/** One item per kind of row the feed shows. */
export const feedItemStorybookMock = {
  source: { id: 'github', type: 'github', label: 'GitHub' } satisfies ConnectorSummary,
  items: {
    comment: { ...base, id: 'i1', kind: 'comment', at: hoursAgo(0.3), text: 'Could you take another look at the retry?', body: 'Could you take another look at the retry?\nThe backoff is capped now.' },
    'mention': { ...base, id: 'i2', kind: 'comment', at: hoursAgo(1), mention: true, text: 'dana asked you', body: 'Can you confirm the date, lee?' },
    status: { ...base, id: 'i3', kind: 'status', at: hoursAgo(3), text: 'In Progress → Code Review' },
    'failed check': { ...base, id: 'i4', kind: 'check', who: 'ci', at: hoursAgo(8), text: 'build failed' },
  } satisfies Record<string, FeedItem>,
};
