/** Starts the monitor on the demo connector in a scratch data directory, for the browser layout check (RMA-362). */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { scratchDir } from './scratch.mjs';
import './demo-connector.mjs';

const dataDir = scratchDir('wt-e2e-');
const workspaces = ['northwind', 'atlas'].map((scenario) => ({ id: scenario, name: scenario, connectors: [{ type: 'demo', scenario }] }));
writeFileSync(join(dataDir, 'config.json'), JSON.stringify({ workspaces }));
process.env.WHOSE_TURN_DATA = dataDir;
process.env.WHOSE_TURN_PORT ||= '8799';
await import('../../server.mjs');
