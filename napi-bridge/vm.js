/**
 * Minimal vm stub for browser runtime.
 * Node's vm module creates V8 contexts — not possible in browsers.
 * Provides basic runInThisContext/Script for code that only needs eval-like behavior.
 */

class Script {
  constructor(code, options = {}) {
    this._code = code;
    this._filename = options.filename || '<vm>';
  }
  runInThisContext(options) {
    return new Function(this._code)();
  }
  runInNewContext(sandbox, options) {
    return new Function(this._code).call(sandbox);
  }
}

function createContext(sandbox) {
  return sandbox || {};
}

function runInThisContext(code, options) {
  return new Script(code, options).runInThisContext(options);
}

function runInNewContext(code, sandbox, options) {
  return new Script(code, options).runInNewContext(sandbox, options);
}

function isContext() { return false; }
function compileFunction(code, params = [], options = {}) {
  return new Function(...params, code);
}

export { Script, createContext, runInThisContext, runInNewContext, isContext, compileFunction };
export default { Script, createContext, runInThisContext, runInNewContext, isContext, compileFunction };
