export const markdownViewStorybookMock = {
  sources: {
    default: [
      '#### Item — rising',
      '',
      'Asked **dana** to look at `PROJ-12`, see [the thread](https://example.com/thread).',
      '',
      '- first point',
      '- second point',
      '',
      '> A quoted remark.',
      '',
      '```',
      'const sample = 1;',
      '```',
    ].join('\n'),
    unsafeLink: 'A [bad link](javascript:alert(1)) and <b>raw html</b> stay text.',
    empty: '',
  },
};
