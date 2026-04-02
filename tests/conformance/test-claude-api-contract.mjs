/**
 * Claude-style API contract — runner only (suite body in claude-contract-suite.mjs).
 *
 * Run (source):  node tests/conformance/test-claude-api-contract.mjs
 * Run (bundle): node dist/claude-api-contract.js  (after bun scripts/build-claude-contract.mjs)
 * Run (dual):    npm run test:nodejs-in-tab-contract  (browser host + Wasm MEMFS, one gate)
 *
 * CONFORMANCE_TARGET=bridge|node   CLAUDE_CONTRACT_OFFLINE=1 skips outbound HTTPS (reported as SKIP)
 */

import { runClaudeApiContract } from './claude-contract-suite.mjs';

await runClaudeApiContract();
