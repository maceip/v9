#!/usr/bin/env node
/**
 * In-tab Node API contract — runner (suite body in in-tab-api-contract-suite.mjs).
 *
 * Run: node tests/conformance/test-in-tab-api-contract.mjs
 * Run (dual): npm run test:nodejs-in-tab-contract
 */
import { runInTabApiContract } from './in-tab-api-contract-suite.mjs';

await runInTabApiContract();
