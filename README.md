# v9 — Node.js in the browser (EdgeJS + N-API bridge)

Run **Node-shaped** apps in Chromium: WebAssembly runtime, `napi-bridge` built-ins, xterm UI, and a conformance suite that stays aligned across **browser JS** and **Wasm/MEMFS**.

**Not** tied to a single vendor CLI — that was early scaffolding. Product direction: general-purpose Node-in-tab (`docs/NODEJS_IN_TAB_ROADMAP.md`).

## Quick start

```bash
npm install
# Build EdgeJS wasm/js (Emscripten 3.1.64 + make) — see docs/BUILD_TOOLCHAIN.md
# npm run build

# Dev server (static + optional API proxy):
node scripts/dev-server.mjs
```

### Claude Code CLI in the tab (same runtime as Pages)

This path is a **reference-app** stress case on the same stack as any other `?bundle=` entry ([`docs/NODEJS_IN_TAB_ROADMAP.md`](docs/NODEJS_IN_TAB_ROADMAP.md)). It assumes **EdgeJS artifacts exist** (`dist/edgejs.js`, `dist/edgejs.wasm`) from [`docs/BUILD_TOOLCHAIN.md`](docs/BUILD_TOOLCHAIN.md) — same prerequisite as un-commenting `npm run build` in Quick start (or using CI / S3 artifacts).

1. Put an API key where the terminal expects it, e.g. in DevTools: `sessionStorage.setItem('anthropic_api_key', 'sk-ant-…')` then reload.
2. Build the vendor bundle (requires `@anthropic-ai/claude-code` in devDependencies):

   ```bash
   npm run bundle:claude-code
   ```

3. With **both** file server **:8080** and CORS proxy **:8081** running (`node scripts/dev-server.mjs`), open:

   `http://localhost:8080/web/index.html?bundle=/dist/claude-code-cli.js&autorun=1`

   Outbound calls to `api.anthropic.com` / `platform.claude.com` are rewritten to `localhost:8081` by `web/node-polyfills.js`; keep the dev server running so that proxy stays up.

**Contributors:** If you edit `tests/conformance/in-tab-api-contract-suite.mjs`, refresh the Wasm copy of the suite before the unified gate: `npm run build:in-tab-api-contract:wasm`, then `npm run test:nodejs-in-tab-contract` ([`docs/NODEJS_IN_TAB_ROADMAP.md`](docs/NODEJS_IN_TAB_ROADMAP.md) — one spec, browser + Wasm).

**Rebuilding the Wasm toolchain / running tests on Cory (EC2)** — same as CI: build (or CI artifacts), set **`CHROME_BIN`**, `npm ci`, then **`npm run test:nodejs-in-tab-contract`** and **`make test-integration`**. Full runbook: [`docs/BUILD_TOOLCHAIN.md`](docs/BUILD_TOOLCHAIN.md). **Docker:** [`docker/Dockerfile`](docker/Dockerfile) + [`docker/compose.yaml`](docker/compose.yaml) reproduce the toolchain on engineer machines; optional **`npm run fetch:wasm-assets`** when artifacts live on **S3**. GitHub Actions: **“Wasm runtime rebuild”** for artifacts only.

Open the URL printed by the dev server (default terminal UI):

`http://localhost:8080/web/index.html?bundle=/dist/app-bundle.js`

`bundle=` should point at a **pre-bundled** ESM/CJS app you place under `dist/` (or serve elsewhere). There is no magic npm-on-MEMFS yet; see the roadmap.

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
| `edgejs.wasm`, `edgejs.js`, `build/edge` | `npm run build` (wraps `make fetch configure build`) | Wasm runtime + loader stub; details in `docs/BUILD_TOOLCHAIN.md` |
| `in-tab-api-contract-wasm-*.cjs` | `npm run build:in-tab-api-contract:wasm` | Contract suite bundled for MEMFS (`esbuild`) |
| `in-tab-api-contract.js` | `npm run build:in-tab-api-contract` (**Bun**) | Contract suite as ESM bundle (optional) |
| `app-bundle.js` | Your esbuild/webpack step | Example default for `?bundle=` |
| `anthropic-sdk-bundle.js` | `scripts/bundle-sdk.sh` (optional) | Overrides `@anthropic-ai/sdk` in the tab |

`.gitignore` excludes `dist/`; reproduce artifacts with the commands above.

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

## GitHub Pages (landing + Claude in iframe)

The **`docs/`** tree holds the public landing (glass terminal UI). CI (`.github/workflows/pages.yml`) runs on **`push` to `main`** (and **`workflow_dispatch`** so you can run it from another branch without double-deploy races).

1. **`npm ci`** — includes **`@anthropic-ai/claude-code`** (devDependency), used only as input to the pre-bundle step below.
2. **`make fetch`**, **`make configure`**, **`make build`** — produces **`dist/edgejs.{js,wasm}`**.
3. **`scripts/prepare-github-pages.mjs`** — copies **`web/`** → **`docs/web/`**, **`napi-bridge/`** → **`docs/napi-bridge/`**, copies wasm into **`docs/dist/`**, rewrites **every** `*.html` import map from **`/napi-bridge/`** to **`../napi-bridge/`** (required for project Pages under **`/<repo>/`**), and writes **`docs/.nojekyll`** so GitHub serves static files as-is.
4. **`scripts/bundle-claude-for-pages.mjs`** — esbuilds the vendor CLI with Node built-ins left **external** (resolved via the same import map). Output: **`docs/dist/claude-code-cli.js`** next to **`edgejs.*`**.

The landing script (`docs/js/v9-app.js`) opens **`…/web/index.html?bundle=<repo-prefix>dist/claude-code-cli.js&autorun=1`** so the iframe runtime matches localhost, with **`bundle=`** as an absolute path from the site root (see `siteRootPrefix()` in `docs/js/v9-app.js`).

**Limitation:** `github.io` static hosting does **not** let you set **`Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy`** headers. The **`node scripts/dev-server.mjs`** path sends those for **`SharedArrayBuffer`** / full Wasm threading semantics; on Pages, behavior may differ from local dev. For a public demo with the same headers as the dev server, front the site with a host that injects those headers (e.g. Cloudflare **`_headers`**) or keep the canonical wasm validation on CI + local dev.

Generated trees **`docs/web/`**, **`docs/napi-bridge/`**, **`docs/dist/`**, and **`docs/.nojekyll`** are produced by the steps above (under **`docs/`** only what’s needed for deploy); **`docs/web/`** etc. remain gitignored per **`.gitignore`**. Local dry-run after a wasm build:

`node scripts/prepare-github-pages.mjs && node scripts/bundle-claude-for-pages.mjs`

**Deploy failing in ~3s with environment errors:** GitHub’s **`github-pages`** [environment](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment) can restrict which branches may deploy. In the repo: **Settings → Environments → `github-pages` → Deployment branches**, allow **`main`** (or all branches if you use **`workflow_dispatch`** from other refs).

**“Canceling since a higher priority waiting request for pages exists”:** Usually two overlapping **`deploy-pages`** runs (e.g. **`main` + `dev` push** together, or **`cancel-in-progress: true`** killing an in-flight deploy). This repo triggers automatic deploy only on **`main`** and sets **`cancel-in-progress: false`** so runs queue instead of preempting.

## License / private

`private: true` in `package.json` — adjust for your distribution model.
