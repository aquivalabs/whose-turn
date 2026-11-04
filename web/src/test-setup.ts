import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/vue';
import { exits } from './test-motion.ts';
import { config } from '@vue/test-utils';

vi.mock('motion-v', () => import('./test-motion.ts'));
// docs/mechanisms/motion.md § The test stand-in
config.global.stubs = { transition: false, 'transition-group': false };
afterEach(() => {
  cleanup();
  exits.reset();
});
