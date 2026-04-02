#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  isNodeHost,
  getHttpTransportMode,
  getRawSocketTransportMode,
} from '../napi-bridge/transport-policy.mjs';

console.log('=== transport-policy (Node host) ===\n');

assert.equal(isNodeHost(), true, 'real Node test process has no document');
assert.equal(getHttpTransportMode(), 'node-native', 'default Node mode');
assert.equal(getRawSocketTransportMode(), 'none', 'no wisp env in this test');

console.log('PASS: transport-policy smoke (Node)');
