// Auto-generated ESM wrapper for node:string_decoder
// Source: scripts/generate-esm-wrappers.mjs
// Reference: 1 exports from Node.js string_decoder

import * as _mod from './string-decoder.js';
const _impl = _mod.default || _mod;

function _notImplemented(name) {
  return class { constructor(...a) { /* string_decoder stub */ } };
}

export const StringDecoder = typeof _impl.StringDecoder !== 'undefined' ? _impl.StringDecoder : _notImplemented('string_decoder.StringDecoder');

const _module = { StringDecoder };
export default _module;
