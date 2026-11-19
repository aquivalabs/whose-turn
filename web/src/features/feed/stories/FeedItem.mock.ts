import type { ConnectorSummary, FeedItem } from '@/lib/types.ts';

const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();

const base = { ref: 'PROJ-12', who: 'dana', url: 'https://example.com/your-org/your-repo/pull/12', source: 'github' };

/** One item per kind of row the feed shows. */
export const feedItemStorybookMock = {
  source: { id: 'github', type: 'github', label: 'GitHub' } satisfies ConnectorSummary,
  items: {
    comment: { ...base, id: 'i1', kind: 'comment', at: at(0.3), text: 'Could you take another look at the retry?', body: 'Could you take another look at the retry?\nThe backoff is capped now.' },
    'mention': { ...base, id: 'i2', kind: 'comment', at: at(1), mention: true, text: 'dana asked you', body: 'Can you confirm the date, lee?' },
    status: { ...base, id: 'i3', kind: 'status', at: at(3), text: 'In Progress → Code Review' },
    'failed check': { ...base, id: 'i4', kind: 'check', who: 'ci', at: at(8), text: 'build failed' },
  } satisfies Record<string, FeedItem>,
};
