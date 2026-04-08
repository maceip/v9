/**
 * Bundle MEMFS sources with esbuild for the JS bridge execution path.
 * - CJS bundle: static ESM without top-level await (executable via new Function).
 * - ESM data URL: top-level await (esbuild cannot emit CJS with TLA).
 */

/**
 * @param {object} opts
 * @param {string} opts.absPath
 * @param {string} opts.source
 * @param {string} opts.importMetaUrlLiteral JSON string literal for import.meta.url
 * @param {(p: string, enc: string) => string} opts.readFileSync
 * @param {(spec: string, fromDir: string) => { type: 'file', path: string } | null} opts.resolveModule
 * @param {'cjs' | 'esm'} opts.format
 */
async function bundleMemfsScript(opts) {
  const esbuild = await import('esbuild');
  const { absPath, source, importMetaUrlLiteral, readFileSync, resolveModule, format } = opts;

  const plugin = {
    name: 'memfs-bundle',
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === 'entry-point') {
          return { path: absPath, namespace: 'memfs' };
        }
        if (args.namespace !== 'memfs') return undefined;
        const fromDir = args.importer.includes('/')
          ? args.importer.substring(0, args.importer.lastIndexOf('/')) || '/'
          : '/';
        if (typeof args.path === 'string' && args.path.startsWith('node:')) {
          return { path: args.path, external: true };
        }
        const resolved = resolveModule(args.path, fromDir);
        if (resolved?.type === 'builtin') {
          return { path: args.path, external: true };
        }
        if (!resolved || resolved.type !== 'file') {
          return { errors: [{ text: `Cannot resolve "${args.path}" from ${fromDir}` }] };
        }
        return { path: resolved.path, namespace: 'memfs' };
      });
      build.onLoad({ filter: /.*/, namespace: 'memfs' }, (args) => {
        let text;
        try {
          text = args.path === absPath ? source : readFileSync(args.path, 'utf8');
        } catch (e) {
          return { errors: [{ text: String(e.message || e) }] };
        }
        if (text.startsWith('#!')) text = text.substring(text.indexOf('\n') + 1);
        const resolveDir = args.path.includes('/')
          ? args.path.substring(0, args.path.lastIndexOf('/')) || '/'
          : '/';
        return { contents: text, loader: 'js', resolveDir };
      });
    },
  };

  const result = await esbuild.build({
    plugins: [plugin],
    entryPoints: [absPath],
    bundle: true,
    format,
    platform: 'neutral',
    target: 'es2022',
    write: false,
    define: { 'import.meta.url': importMetaUrlLiteral },
    logLevel: 'silent',
  });
  const out = result.outputFiles[0]?.text;
  if (!out) throw new Error('esbuild bundle produced no output');
  return out.replace(/\bimport\s*\(/g, 'globalThis.__memfsDynamicImport(');
}

export async function bundleMemfsScriptToCjs(opts) {
  return bundleMemfsScript({ ...opts, format: 'cjs' });
}

/**
 * @returns {Promise<string>} data: URL suitable for dynamic import()
 */
export async function bundleMemfsScriptToEsmDataUrl(opts) {
  const code = await bundleMemfsScript({ ...opts, format: 'esm' });
  return `data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`;
}
