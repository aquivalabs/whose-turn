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

/** The starting value of each field kind; a kind that starts empty has none. */
export const fieldRowValues: Partial<Record<keyof typeof fieldRowStorybookMock, string | readonly string[]>> = {
  text: 'Demo',
  required: '',
  number: '10',
  list: ['alpha', 'beta'] as const,
  choice: 'team',
  colour: '#3366cc',
};
