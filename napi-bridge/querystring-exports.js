// ESM wrapper for node:querystring

export function parse(str, sep = '&', eq = '=') {
  const result = Object.create(null);
  if (!str || typeof str !== 'string') return result;
  for (const pair of str.split(sep)) {
    const idx = pair.indexOf(eq);
    const key = idx >= 0 ? decodeURIComponent(pair.slice(0, idx)) : decodeURIComponent(pair);
    const val = idx >= 0 ? decodeURIComponent(pair.slice(idx + 1)) : '';
    if (key in result) {
      if (Array.isArray(result[key])) result[key].push(val);
      else result[key] = [result[key], val];
    } else {
      result[key] = val;
    }
  }
  return result;
}

export function stringify(obj, sep = '&', eq = '=') {
  if (!obj || typeof obj !== 'object') return '';
  return Object.entries(obj).map(([k, v]) => {
    if (Array.isArray(v)) return v.map(i => encodeURIComponent(k) + eq + encodeURIComponent(i)).join(sep);
    return encodeURIComponent(k) + eq + encodeURIComponent(v);
  }).join(sep);
}

export const encode = stringify;
export const decode = parse;
export function escape(str) { return encodeURIComponent(str); }
export function unescape(str) { return decodeURIComponent(str); }

const _module = { parse, stringify, encode, decode, escape, unescape };
export default _module;
