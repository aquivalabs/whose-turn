import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/vue';
import { exits } from './test-motion.ts';
import { config } from '@vue/test-utils';

vi.mock('motion-v', () => import('./test-motion.ts'));
// The stand-in AnimatePresence is built on Vue's own transitions, which must not be stubbed away.
config.global.stubs = { transition: false, 'transition-group': false };
afterEach(() => {
  cleanup();
  exits.reset();
});
