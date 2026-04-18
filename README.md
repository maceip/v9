# v9 — Node.js in the browser (EdgeJS + N-API bridge)

Run **Node-shaped** apps in Chromium: WebAssembly runtime, `napi-bridge` built-ins, xterm UI, and a conformance suite that stays aligned across **browser JS** and **Wasm/MEMFS**.

**Not** tied to a single vendor CLI — that was early scaffolding. Product direction: general-purpose Node-in-tab (`docs/NODEJS_IN_TAB_ROADMAP.md`).

## Quick start

```bash
make setup                        # one-time: install Emscripten 4.0.23 + npm deps
source ~/emsdk/emsdk_env.sh       # activate Emscripten in your shell
make all                          # fetch → configure → build → test
```

See **[BUILDING.md](BUILDING.md)** for the full from-scratch walkthrough. For CI parity, Docker, Cory/EC2 runbook: **[`docs/BUILD_TOOLCHAIN.md`](docs/BUILD_TOOLCHAIN.md)**. Docker: [`docker/Dockerfile`](docker/Dockerfile) + [`docker/compose.yaml`](docker/compose.yaml). GitHub Actions: **”Wasm runtime rebuild”** for artifacts only.

Once built, start the dev server:

```bash
node scripts/dev-server.mjs
npm install
npm link          # makes the “v9” command available globally
```

### “I have a bundled JS file and want to run it in the browser”

```bash
v9 run ./my-app-bundle.js
```

That's it. v9 starts a local server, pops a Chromium tab with an xterm.js terminal, and runs your bundle inside the EdgeJS WebAssembly runtime with full Node.js APIs (fs, path, http, crypto, streams, child_process, etc.).

### “I have a Node.js project and want to see if v9 can host it”

```bash
cd my-project/     # has a package.json
v9 build
```

v9 reads your `package.json`, finds the entry point, bundles it with esbuild (tree-shaken, minified, Node built-ins resolved at runtime by the Wasm engine), opens a browser, **and** writes the optimized artifact to `.v9-build/` in your project directory.

Need to specify the entry explicitly?

```bash
v9 build --entry src/cli.js
```

### What `build` does under the hood

1. Finds your entry (`main` / `module` / `bin` from package.json, or `--entry`)
2. Bundles with esbuild: `platform: neutral`, `format: esm`, `target: es2022`
3. Marks all Node built-ins as **external** (provided at runtime by the EdgeJS wasm engine + napi-bridge)
4. Tree-shakes and minifies; strips problematic native-only packages
5. Writes `.v9-build/<name>-bundle.js` (your portable artifact)
6. Starts the dev server and opens the browser

---

## Two dev stories

### Embedding devs (using v9 to run apps)

The wasm runtime (`dist/edgejs.js` + `dist/edgejs.wasm`) is **vendored** — it ships with the repo. `npm install && npm link` is all you need.

If the wasm is missing (fresh clone before CI runs, etc.):

```bash
npm run vendor:wasm    # downloads pre-built from latest CI (requires gh CLI)
```

### Core devs (working on v9 itself)

Build the wasm runtime from source. Requires [Emscripten](https://emscripten.org/) 3.1.64+.

```bash
source “$EMSDK/emsdk_env.sh”
npm run build          # wraps: make fetch && make configure && make build
```

After building, commit the wasm for embedding devs:

```bash
git add dist/edgejs.js dist/edgejs.wasm
```

See [`docs/BUILD_TOOLCHAIN.md`](docs/BUILD_TOOLCHAIN.md) for the full Emscripten setup. **Docker:** [`docker/Dockerfile`](docker/Dockerfile) + [`docker/compose.yaml`](docker/compose.yaml) reproduce the toolchain.

---

### Advanced: dev server only

```bash
node scripts/dev-server.mjs
# Opens http://localhost:8080/ — pass ?bundle=/dist/your-file.js&autorun=1
```

**Rebuilding the Wasm toolchain / running tests on Cory (EC2)** — same as CI: build (or CI artifacts), set **`CHROME_BIN`**, `npm ci`, then **`npm run test:nodejs-in-tab-contract`** and **`make test-integration`**. Full runbook: [`docs/BUILD_TOOLCHAIN.md`](docs/BUILD_TOOLCHAIN.md). **Docker:** [`docker/Dockerfile`](docker/Dockerfile) + [`docker/compose.yaml`](docker/compose.yaml) reproduce the toolchain on engineer machines; optional **`npm run fetch:wasm-assets`** when artifacts live on **S3**. GitHub Actions: **”Wasm runtime rebuild”** for artifacts only.

A browser demo bundle on the same stack.

```bash
# 1. Bundle the demo app:
npm run bundle:image-to-ascii-demo
# 2. Run it:
v9 run dist/image-to-ascii-demo.js
```

**Contributors:** If you edit `tests/conformance/in-tab-api-contract-suite.mjs`, refresh the Wasm copy: `npm run build:in-tab-api-contract:wasm`, then `npm run test:nodejs-in-tab-contract`.

## Validation

```bash
# Core smoke tests
npm test

# Dual gate — same API contract in real Chromium + Wasm MEMFS (CI-quality)
npm run test:nodejs-in-tab-contract
```

## Build artifacts (what lives in `dist/`)

| Artifact | How produced | Role |
|----------|------------|------|
| `edgejs.wasm`, `edgejs.js` | **Vendored** (or `npm run build` / `npm run vendor:wasm`) | Wasm runtime — the product. Details in `docs/BUILD_TOOLCHAIN.md` |
| `build/edge` | `npm run build` | CommonJS loader stub (core devs only) |
| `<name>-bundle.js` | `v9 build` | Your app bundled for the browser |
| `image-to-ascii-demo.js` | `npm run bundle:image-to-ascii-demo` | Reference app bundle for the landing-page demo |
| `in-tab-api-contract-wasm-*.cjs` | `npm run build:in-tab-api-contract:wasm` | Contract suite bundled for MEMFS |

`dist/edgejs.{js,wasm}` are tracked in git. Other `dist/` contents are gitignored.

## npm scripts (high level)

- **Tests:** `test`, `test:nodejs-in-tab-contract`, `test:in-tab-api-contract`, `test:browser`, `test:wasm`, `test:release-gate`
- **Contract builds:** `build:in-tab-api-contract`, `build:in-tab-api-contract:wasm`
- **Release gate:** `release-gate` (policy JSON under `.planning/...`)

Legacy names `test:claude-contract:*` still point at the same commands during migration.

## Repo layout (short)

- `napi-bridge/` — browser mappings for Node built-ins  
- `web/` — terminal page, import map, polyfills  
- `tests/conformance/in-tab-api-contract-suite.mjs` — behavioral contract  
- `docs/CONTRACT_HOSTS.md` — **browser vs Node bridge vs Wasm**: what “in-tab” actually refers to  
- `docs/NODEJS_IN_TAB_ROADMAP.md` — architecture + next milestones  
- `.planning/` — minimal release-gate metadata (large historical phase trees removed)

## GitHub Pages (landing + image-to-ascii demo)

The **`docs/`** tree holds the public landing (glass terminal UI). CI (`.github/workflows/pages.yml`) runs on **`push` to `main`** (and **`workflow_dispatch`** so you can run it from another branch without double-deploy races).

1. **`npm ci`** — installs the bundler/runtime dependencies used by the landing page demo build.
2. **`make fetch`**, **`make configure`**, **`make build`** — produces **`dist/edgejs.{js,wasm}`**.
3. **`scripts/prepare-github-pages.mjs`** — copies **`web/`** → **`docs/web/`**, **`napi-bridge/`** → **`docs/napi-bridge/`**, copies wasm into **`docs/dist/`**, rewrites **every** `*.html` import map from **`/napi-bridge/`** to **`../napi-bridge/`** (required for project Pages under **`/<repo>/`**), and writes **`docs/.nojekyll`** so GitHub serves static files as-is.
4. **`scripts/bundle-image-to-ascii-demo.mjs`** — esbuilds the browser-safe image-to-ascii demo entry and writes **`docs/dist/image-to-ascii-demo.js`** next to **`edgejs.*`**.

The landing script (`docs/js/v9-app.js`) opens **`…/web/index.html?bundle=<repo-prefix>dist/image-to-ascii-demo.js&autorun=1`** so the iframe runtime matches localhost, with **`bundle=`** as an absolute path from the site root (see `siteRootPrefix()` in `docs/js/v9-app.js`).

**Limitation:** `github.io` static hosting does **not** let you set **`Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy`** headers. The local dev server (`v9 run` / `v9 build`) sends those for **`SharedArrayBuffer`** / full Wasm threading semantics; on Pages, behavior may differ. For a public demo with the same headers, front the site with a host that injects those headers (e.g. Cloudflare **`_headers`**) or keep the canonical wasm validation on CI + local dev.

Generated trees **`docs/web/`**, **`docs/napi-bridge/`**, **`docs/dist/`**, and **`docs/.nojekyll`** are produced by the steps above (under **`docs/`** only what’s needed for deploy); **`docs/web/`** etc. remain gitignored per **`.gitignore`**. Local dry-run after a wasm build:

`node scripts/prepare-github-pages.mjs && node scripts/bundle-image-to-ascii-demo.mjs`

**Deploy failing in ~3s with environment errors:** GitHub’s **`github-pages`** [environment](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment) can restrict which branches may deploy. In the repo: **Settings → Environments → `github-pages` → Deployment branches**, allow **`main`** (or all branches if you use **`workflow_dispatch`** from other refs).

**“Canceling since a higher priority waiting request for pages exists”:** Usually two overlapping **`deploy-pages`** runs (e.g. **`main` + `dev` push** together, or **`cancel-in-progress: true`** killing an in-flight deploy). This repo triggers automatic deploy only on **`main`** and sets **`cancel-in-progress: false`** so runs queue instead of preempting.

## License / private

`private: true` in `package.json` — adjust for your distribution model.
