import type { Snapshot } from '@/lib/types.ts';
import { demoWorkspace } from '@/stories/fixtures.ts';

/** A workspace with no sources yet. */
export const firstRunStorybookMock = {
  default: { workspace: demoWorkspace({ connectors: [] }) },
} satisfies Record<string, Partial<Snapshot>>;
