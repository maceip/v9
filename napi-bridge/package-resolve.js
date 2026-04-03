/**
 * Subset of Node package.json "exports" and "imports" resolution.
 * Supports conditional objects, simple pattern keys (`./a/*` → `./b/*.js`), and the package "imports" field for `#…` specifiers.
 */

/**
 * @param {string} specifier
 * @returns {{ packageName: string, subpath: string } | null}
 */
export function parsePackageSpecifier(specifier) {
  if (!specifier || typeof specifier !== 'string') return null;
  if (specifier.startsWith('@')) {
    const s1 = specifier.indexOf('/');
    if (s1 === -1) return { packageName: specifier, subpath: '.' };
    const s2 = specifier.indexOf('/', s1 + 1);
    if (s2 === -1) return { packageName: specifier, subpath: '.' };
    return { packageName: specifier.slice(0, s2), subpath: `.${specifier.slice(s2)}` };
  }
  const slash = specifier.indexOf('/');
  if (slash === -1) return { packageName: specifier, subpath: '.' };
  return { packageName: specifier.slice(0, slash), subpath: `.${specifier.slice(slash)}` };
}

/**
 * Match string against a pattern with a single `*`.
 * @returns {string | null} captured segment, or '' for trivial match, or null
 */
export function matchSingleStar(pattern, str) {
  const i = pattern.indexOf('*');
  if (i === -1) return pattern === str ? '' : null;
  const pre = pattern.slice(0, i);
  const post = pattern.slice(i + 1);
  if (!str.startsWith(pre)) return null;
  const rest = str.slice(pre.length);
  if (post) {
    if (!rest.endsWith(post)) return null;
    return rest.slice(0, rest.length - post.length);
  }
  return rest;
}

/**
 * Apply single-star substitution in target pattern.
 */
export function applyStarTarget(targetPattern, star) {
  if (typeof targetPattern !== 'string') return null;
  const i = targetPattern.indexOf('*');
  if (i === -1) return targetPattern;
  return targetPattern.slice(0, i) + star + targetPattern.slice(i + 1);
}

/**
 * @param {unknown} target
 * @param {Set<string>} cond
 * @returns {string | null}
 */
export function pickConditionalTarget(target, cond) {
  if (typeof target === 'string') return target;
  if (!target || typeof target !== 'object' || Array.isArray(target)) return null;

  const nodeBranch = target.node;
  if (nodeBranch !== undefined && cond.has('node')) {
    const got = pickConditionalTarget(nodeBranch, cond);
    if (got) return got;
  }

  if (target.development !== undefined && cond.has('development')) {
    const got = pickConditionalTarget(target.development, cond);
    if (got) return got;
  }
  if (target.production !== undefined && cond.has('production')) {
    const got = pickConditionalTarget(target.production, cond);
    if (got) return got;
  }

  const order = cond.has('import')
    ? ['import', 'require', 'default']
    : ['require', 'import', 'default'];
  for (const k of order) {
    if (Object.prototype.hasOwnProperty.call(target, k)) {
      const got = pickConditionalTarget(target[k], cond);
      if (got) return got;
    }
  }
  if (target.default !== undefined) {
    const got = pickConditionalTarget(target.default, cond);
    if (got) return got;
  }
  for (const k of Object.keys(target)) {
    if (k === 'types' || k === 'node' || k === 'development' || k === 'production') continue;
    if (order.includes(k) || k === 'default') continue;
    const got = pickConditionalTarget(target[k], cond);
    if (got) return got;
  }
  return null;
}

/**
 * @param {unknown} exportsField
 * @param {string} subpath '.' or './foo'
 * @param {Set<string>} cond
 * @returns {string | null} relative path from package root
 */
function resolveExportsObject(exportsField, subpath, cond) {
  if (exportsField == null) return null;
  if (typeof exportsField === 'string') {
    return subpath === '.' ? exportsField : null;
  }
  if (typeof exportsField !== 'object' || Array.isArray(exportsField)) return null;

  const keysToTry = subpath === '.'
    ? ['.', './']
    : [subpath.startsWith('.') ? subpath : `./${subpath.replace(/^\/*/, '')}`];

  for (const key of keysToTry) {
    if (!Object.prototype.hasOwnProperty.call(exportsField, key)) continue;
    const picked = pickConditionalTarget(exportsField[key], cond);
    if (picked) return picked;
  }

  for (const key of Object.keys(exportsField)) {
    if (!key.includes('*')) continue;
    for (const trySub of keysToTry) {
      const star = matchSingleStar(key, trySub);
      if (star === null) continue;
      const raw = pickConditionalTarget(exportsField[key], cond);
      if (typeof raw !== 'string') continue;
      const mapped = applyStarTarget(raw, star);
      if (mapped) return mapped;
    }
  }
  return null;
}

/**
 * @param {unknown} exportsField
 * @param {string} subpath '.' or './foo'
 * @param {string[]} conditionsList
 * @returns {string | null} relative path from package root
 */
export function resolvePackageExportsMapping(exportsField, subpath, conditionsList) {
  const cond = new Set(conditionsList);
  return resolveExportsObject(exportsField, subpath, cond);
}

/**
 * @param {Record<string, unknown>} pkgJson
 * @param {string} subpath
 * @param {string[]} conditionsList
 */
export function resolvePackageExportsMappingFromPkg(pkgJson, subpath, conditionsList) {
  if (!pkgJson || pkgJson.exports == null) return null;
  return resolvePackageExportsMapping(pkgJson.exports, subpath, conditionsList);
}

/**
 * Resolve a `#…` specifier using package.json "imports".
 * @param {unknown} importsField
 * @param {string} specifier e.g. `#foo` or `#foo/bar`
 * @param {string[]} conditionsList
 * @returns {string | null} URL or path string (./x, ../x, /x, file:, node:)
 */
export function resolvePackageImportsMapping(importsField, specifier, conditionsList) {
  if (!importsField || typeof importsField !== 'object' || Array.isArray(importsField)) return null;
  const cond = new Set(conditionsList);

  if (Object.prototype.hasOwnProperty.call(importsField, specifier)) {
    const picked = pickConditionalTarget(importsField[specifier], cond);
    if (typeof picked === 'string') return picked;
  }

  for (const key of Object.keys(importsField)) {
    if (!key.includes('*')) continue;
    const star = matchSingleStar(key, specifier);
    if (star === null) continue;
    const raw = pickConditionalTarget(importsField[key], cond);
    if (typeof raw !== 'string') continue;
    const mapped = applyStarTarget(raw, star);
    if (mapped) return mapped;
  }
  return null;
}

/**
 * @param {Record<string, unknown>} pkgJson
 * @param {string} specifier
 * @param {string[]} conditionsList
 */
export function resolvePackageImportsFromPkg(pkgJson, specifier, conditionsList) {
  if (!pkgJson || pkgJson.imports == null) return null;
  return resolvePackageImportsMapping(pkgJson.imports, specifier, conditionsList);
}
