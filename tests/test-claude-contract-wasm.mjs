/**
 * @deprecated Use `node tests/test-node-in-tab-contract.mjs` (runs browser + Wasm together).
 */
import { runWasmMemfsContractPhase } from './helpers/contract-phase-wasm.mjs';

const r = await runWasmMemfsContractPhase({ runBuild: true });
console.log(`\n=== Results: ${r.ok ? 'PASS' : 'FAIL'} (${r.name}) ===`);
process.exit(r.ok ? 0 : 1);
