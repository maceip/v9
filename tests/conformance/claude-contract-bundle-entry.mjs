/**
 * Bun bundle entry — importing this file pulls in the full contract suite.
 * Built by scripts/build-claude-contract.mjs (mirrors claude-code-main Bun.build).
 */
import { runClaudeApiContract } from './claude-contract-suite.mjs';

await runClaudeApiContract();
