import { afterEach, expect, test } from 'vitest';
import { render } from '@testing-library/vue';
import { snapshot } from '@/store.ts';
import Waiting from '@/features/waiting/Waiting.vue';
import Feed from '@/features/feed/Feed.vue';
import WorkspaceHeader from './WorkspaceHeader.vue';

const failAll = () => {
  snapshot.workspace.connectors = [{ id: 'jira', type: 'jira', label: 'Jira' }];
  snapshot.health = { ok: false, stale: false, fresh_at: '', failing: [{ source: 'jira', polls: 3 }], alerts: [] };
};

afterEach(() => {
  snapshot.workspace.connectors = [];
  snapshot.health = { ok: true, stale: false, fresh_at: '', failing: [], alerts: [] };
});

test('with every source failing the tiles show a dash and Waiting on others and What changed say no data', () => {
  failAll();
  snapshot.counts = { mine: 0, others: 0, failing: 0, done: 0 };
  const header = render(WorkspaceHeader);
  const values = [...header.container.querySelectorAll('.workspace-header__tile-value')].map((node) => node.textContent);
  expect(values.slice(0, 2)).toEqual(['—', '—']);
  expect(render(Waiting).container.textContent).toContain('No data: jira is failing');
  expect(render(Feed).container.textContent).toContain('No data: jira is failing');
});
