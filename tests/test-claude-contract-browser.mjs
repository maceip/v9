/**
 * @deprecated Use `node tests/test-node-in-tab-contract.mjs` (runs browser + Wasm together).
 */
import { runBrowserHostContractPhase } from './helpers/contract-phase-browser.mjs';

const r = await runBrowserHostContractPhase();
console.log(`\n=== Results: ${r.ok ? 'PASS' : 'FAIL'} (${r.name}) ===`);
process.exit(r.ok ? 0 : 1);
