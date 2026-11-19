import type { Snapshot } from '@/lib/types.ts';

/** The snapshot slices of the bell switch. */
export const notificationsToggleStorybookMock = {
  on: { notifications: { desktop: true } },
  off: { notifications: { desktop: false } },
} satisfies Record<string, Partial<Snapshot>>;
