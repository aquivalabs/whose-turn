import type { Snapshot, UpdateStatus } from '@/lib/types.ts';

const update = (change: Partial<UpdateStatus>): UpdateStatus => ({ current: '1.4.0', latest: '1.4.0', available: false, state: 'idle', ...change });

/** The update status behind each face of the chip. */
export const updateChipStorybookMock = {
  none: update({}),
  available: update({ latest: '1.5.0', available: true }),
  installing: update({ latest: '1.5.0', available: true, state: 'installing' }),
  restarting: update({ latest: '1.5.0', available: true, state: 'restarting' }),
  failed: update({ latest: '1.5.0', available: true, state: 'failed', reason: 'npm could not reach the registry' }),
  pluginBehind: update({ plugin: { state: 'behind', copy: '/plugin update whose-turn' } }),
  pluginFailed: update({ plugin: { state: 'failed', copy: '/plugin update whose-turn' } }),
} satisfies Record<string, Snapshot['update']>;
