import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/vue';
import { exits } from './test-motion.ts';
import { config } from '@vue/test-utils';
import { i18n } from './i18n/index.ts';

vi.mock('motion-v', () => import('./test-motion.ts'));
// The canvas boundary: the backdrop paints on a 2D context, which happy-dom does not have. RMA-365.
vi.mock('@/backdrop.ts', () => ({ show: vi.fn(), repaint: vi.fn(), seeded: vi.fn() }));
// docs/mechanisms/motion.md § The test stand-in
config.global.stubs = { transition: false, 'transition-group': false };
config.global.plugins = [i18n];
afterEach(() => {
  cleanup();
  exits.reset();
});
