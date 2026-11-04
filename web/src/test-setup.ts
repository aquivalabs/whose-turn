import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/vue';

vi.mock('motion-v', () => import('./test-motion.ts'));
afterEach(cleanup);
