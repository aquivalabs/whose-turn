export const whatsNewSheetStorybookMock = {
  default: {
    current: '1.2.0',
    versions: [
      { version: 'Unreleased', date: '', sections: [{ kind: 'Added', items: ['A sample item that is not released yet.'] }] },
      {
        version: '1.2.0',
        date: '2026-11-04',
        sections: [
          { kind: 'Important', items: ['A default changed: check the **sample** setting.'] },
          { kind: 'Added', items: ['A new panel for sample rows.', 'A shortcut for `search`.'] },
          { kind: 'Fixed', items: ['A sample row no longer wraps badly.'] },
        ],
      },
      { version: '1.1.0', date: '2026-11-01', sections: [{ kind: 'Changed', items: ['Sample rows sort by age.'] }] },
      { version: '1.0.0', date: '2026-10-30', sections: [{ kind: 'Added', items: ['The first sample release.'] }] },
    ],
  },
  empty: { current: '1.0.0', versions: [] },
  unavailable: {
    error: { code: 404, status: 'NOT_FOUND', message: 'The changelog is not available.', details: [] },
  },
};
