/**
 * crypto — ESM re-exports for browser import { createHash } from "node:crypto".
 *
 * Thin wrapper around cryptoBridge from browser-builtins.js.
 */
import { cryptoBridge } from './browser-builtins.js';

export const { createHash, createHmac, randomBytes, randomUUID } = cryptoBridge;

export function createPrivateKey(key) {
  throw new Error('crypto.createPrivateKey() is not available in browser — use Web Crypto API');
}

export function createPublicKey(key) {
  throw new Error('crypto.createPublicKey() is not available in browser — use Web Crypto API');
}

export function getHashes() { return ['sha1', 'sha256', 'sha384', 'sha512']; }
export function getCiphers() { return []; }
export const constants = {};

const crypto = {
  ...cryptoBridge, createPrivateKey, createPublicKey,
  getHashes, getCiphers, constants,
};
export default crypto;
