/**
 * Runtime shim for Bun's bun:bundle (compile-time feature flags + MACRO helper).
 *
 * claude-js uses `import { feature } from 'bun:bundle'` in many modules; Bun's
 * bundler normally inlines these. In the browser we resolve the module via
 * import maps instead.
 *
 * feature(name): defaults false (matches external OSS / "no internal gates").
 * Override per flag: set process.env.V9_FEATURE_<NAME> to "1" or "true".
 *
 * MACRO(fn): rare call form; evaluates fn at runtime. Most code uses the
 * global MACRO.VERSION object initialized in web/node-polyfills.js or cli entry.
 */

function _env() {
  return typeof process !== 'undefined' && process.env ? process.env : {};
}

function _envKeyForFeature(name) {
  const safe = String(name).replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();
  return `V9_FEATURE_${safe}`;
}

export function feature(name) {
  const v = _env()[_envKeyForFeature(name)];
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
  return false;
}

export function MACRO(fn) {
  return typeof fn === 'function' ? fn() : fn;
}

export default { feature, MACRO };
