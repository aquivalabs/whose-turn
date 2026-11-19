const day = 24 * 60 * 60 * 1000;
const at = (daysAgo: number) => new Date(Date.now() - daysAgo * day).toISOString();

export const feedbackSheetStorybookMock = {
  preview: {
    preview: { environment: { os: 'sample-os', version: '1.2.0' }, diagnostics: { channel: 'window', 'rows.your_move': '1-5' } },
    preview_token: 'preview-1',
  },
  reports: [
    { id: 'PROJ-31', title: 'The chevron wraps on a narrow window', state: 'In progress', outcome: 'open', filed_at: at(3), changed_at: at(1), answers: [] },
    { id: 'PROJ-27', title: 'Add a button for the sample list', state: 'Done', outcome: 'done', filed_at: at(9), changed_at: at(5), answers: [] },
    { id: 'PROJ-20', title: 'Sample wish that was declined', state: 'Canceled', outcome: 'canceled', filed_at: at(20), changed_at: at(12), answers: [] },
  ],
  sent: { issue: { identifier: 'PROJ-32', title: 'The sample remark' } },
};
