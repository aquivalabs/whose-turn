import type { TurnRow } from '@/lib/types.ts';
import { demoRow } from '@/stories/fixtures.ts';

const base = demoRow('PROJ-12', {
  summary: 'Item — rising',
  pr: 'your-org/your-repo#42',
  pr_url: 'https://example.com/your-org/your-repo/pull/42',
  pr_state: 'OPEN',
  checks: 'passing',
});

export const prCellStorybookMock: Record<string, TurnRow> = {
  passing: base,
  running: { ...base, checks: 'running' },
  failing: { ...base, checks: 'failing' },
  merged: { ...base, pr_state: 'MERGED', checks: undefined },
  closed: { ...base, pr_state: 'CLOSED', checks: undefined },
  none: { ...base, pr: undefined, pr_url: undefined, pr_state: undefined, checks: undefined },
};
