/**
 * Stable host/bootstrap helper: run a MEMFS entry with Node-like argv/cwd/env.
 *
 * @param {object} runtime - return value of initEdgeJS()
 * @param {object} opts
 * @param {string} opts.entry - MEMFS script path
 * @param {string} [opts.cwd='/workspace']
 * @param {string} [opts.argv0='node']
 * @param {string[]} [opts.argv] - extra args after entry (not including argv0 or entry)
 * @param {Record<string, string>} [opts.env]
 * @returns {Promise<{status: number, stdout: string[], stderr: string[]}>}
 */
export function runNodeEntry(runtime, opts = {}) {
  if (!runtime || typeof runtime.runNodeEntry !== 'function') {
    throw new TypeError('runNodeEntry: runtime.runNodeEntry is missing');
  }
  return runtime.runNodeEntry(opts);
}
