/**
 * Bun bundle entry for in-tab-api-contract-suite (parity with bundled CLI builds).
 * Output: dist/in-tab-api-contract.js via scripts/build-in-tab-api-contract.mjs
 */
import { runInTabApiContract } from './in-tab-api-contract-suite.mjs';

await runInTabApiContract();
