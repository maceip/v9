/**
 * Emscripten may emit `#!/usr/bin/env node` at the top of MODULARIZE glue so the
 * file is directly executable. That first line is *not* valid inside a
 * `new Function("...")` body (hashbang is only allowed at the start of a Script),
 * so any loader that embeds glue source in Function() must strip it first.
 */
export function stripLeadingHashbang(source) {
  if (typeof source !== 'string' || !source.startsWith('#!')) return source;
  const nl = source.indexOf('\n');
  return nl === -1 ? '' : source.slice(nl + 1);
}
