// Auto-generated ESM wrapper for node:url
import { getNodeApiModule, subscribeNodeApiModule } from '../node-api-surface.js';

let _defaultExport = getNodeApiModule('url');
function _syncNodeApiModuleBindings() {
  const mod = getNodeApiModule('url');
  _defaultExport = mod;
  URL = mod.URL;
  URLPattern = mod.URLPattern;
  URLSearchParams = mod.URLSearchParams;
  Url = mod.Url;
  domainToASCII = mod.domainToASCII;
  domainToUnicode = mod.domainToUnicode;
  fileURLToPath = mod.fileURLToPath;
  fileURLToPathBuffer = mod.fileURLToPathBuffer;
  format = mod.format;
  parse = mod.parse;
  pathToFileURL = mod.pathToFileURL;
  resolve = mod.resolve;
  resolveObject = mod.resolveObject;
  urlToHttpOptions = mod.urlToHttpOptions;
}
export let URL;
export let URLPattern;
export let URLSearchParams;
export let Url;
export let domainToASCII;
export let domainToUnicode;
export let fileURLToPath;
export let fileURLToPathBuffer;
export let format;
export let parse;
export let pathToFileURL;
export let resolve;
export let resolveObject;
export let urlToHttpOptions;
export { _defaultExport as default };
_syncNodeApiModuleBindings();
subscribeNodeApiModule('url', _syncNodeApiModuleBindings);
