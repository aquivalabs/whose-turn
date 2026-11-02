/** Fixture builders for the rules tests: one invented team, neutral names. */
export const ticket = (overrides = {}) => ({
  source: 'jira', key: 'PROJ-1', summary: 'Add the export button', status: 'In Progress', status_category: 'indeterminate', assignee: 'Alex Doe',
  updated: '2026-11-01T10:00:00.000+0000', url: 'https://your-site.atlassian.net/browse/PROJ-1', status_change: null, ...overrides,
});

export const pr = (overrides = {}) => ({
  source: 'github', pr: 7, key: 'PROJ-1', title: 'PROJ-1 export button', base: 'main', state: 'OPEN', review: '', checks: 'passing', merged_at: '',
  updated_at: '2026-11-01T11:00:00Z', url: 'https://github.com/your-org/your-repo/pull/7',
  last_comment_by: '', last_comment_at: '', last_comment_url: '', last_comment: '', unanswered: false, ...overrides,
});

export const comment = (overrides = {}) => ({
  source: 'jira', id: 'c1', key: 'PROJ-1', at: '2026-11-01T12:00:00Z', author: 'Sam Reviewer', body: '@Alex Doe can you confirm the rounding?', url: 'https://your-site.atlassian.net/browse/PROJ-1?focusedCommentId=c1', ...overrides,
});

export const ask = (overrides = {}) => ({
  source: 'github', id: 'gha:1', repo: 'your-org/other-repo', number: 12, ref: 'other-repo#12', title: 'Fix the login page', key: '', kind: 'review requested', who: 'Sam Reviewer',
  at: '2026-11-01T13:00:00Z', url: 'https://github.com/your-org/other-repo/pull/12', text: 'Fix the login page', body: '', ...overrides,
});
