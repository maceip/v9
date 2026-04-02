/**
 * Subset of Node package.json "exports" resolution (no patterns, no * subpaths).
 * Used by MEMFS require(); conditions mirror a typical Node + CommonJS load.
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
    if (k === 'types') continue;
    const got = pickConditionalTarget(target[k], cond);
    if (got) return got;
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
  if (exportsField == null) return null;
  const cond = new Set(conditionsList);
  if (typeof exportsField === 'string') {
    return subpath === '.' ? exportsField : null;
  }
  if (typeof exportsField !== 'object' || Array.isArray(exportsField)) return null;

  const keysToTry = subpath === '.' ? ['.', './'] : [subpath.startsWith('.') ? subpath : `./${subpath.replace(/^\/*/, '')}`];

  for (const key of keysToTry) {
    if (!Object.prototype.hasOwnProperty.call(exportsField, key)) continue;
    const picked = pickConditionalTarget(exportsField[key], cond);
    if (picked) return picked;
  }
  return null;
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
