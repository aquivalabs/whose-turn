import type { Snapshot } from '@/lib/types.ts';

/** A workspace with no sources yet. */
export const firstRunStorybookMock = {
  default: { workspace: { id: 'demo', name: 'Demo', connectors: [], links: [], key_pattern: '\\bPROJ-\\d+\\b', theme: null } },
} satisfies Record<string, Partial<Snapshot>>;
