import type { FieldSpec } from '@/lib/types.ts';

export const fieldRowStorybookMock = {
  text: { key: 'name', label: 'Name', placeholder: 'Item — rising', hint: 'Shown on the tab' },
  required: { key: 'site', label: 'Site', required: true, placeholder: 'your-org.example.com' },
  number: { key: 'limit', label: 'Limit', min: 1, max: 50, hint: 'How many rows to keep' },
  list: { key: 'labels', label: 'Labels', list: true, placeholder: 'alpha, beta', hint: 'Comma separated' },
  choice: { key: 'mode', label: 'Mode', choices: ['mine', 'team', 'all'], hint: 'Whose items to follow' },
  colour: { key: 'tint', label: 'Tint', colour: true },
  boolean: { key: 'drafts', label: 'Drafts', boolean: true, default: false, hint: 'Include draft items' },
  secret: { key: 'token', label: 'Token', secret: true, hint: 'Stored in the keychain' },
} satisfies Record<string, FieldSpec>;

export const fieldRowValues = {
  text: 'Demo',
  required: '',
  number: '10',
  list: ['alpha', 'beta'],
  choice: 'team',
  colour: '#3366cc',
  boolean: undefined,
  secret: undefined,
} as const;
