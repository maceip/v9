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
- `docs/NODEJS_IN_TAB_ROADMAP.md` — architecture + next milestones  
- `.planning/` — minimal release-gate metadata (large historical phase trees removed)

## GitHub Pages (landing + Claude in iframe)

The **`docs/`** tree holds the public landing (glass terminal UI). CI (`.github/workflows/pages.yml`) on **`main`** / **`dev`**:

1. Installs **`@anthropic-ai/claude-code`** and runs **`scripts/bundle-claude-for-pages.mjs`** → `docs/dist/claude-code-cli.js`.
2. Builds **`dist/edgejs.{js,wasm}`** with Emscripten (`make build`).
3. Runs **`scripts/prepare-github-pages.mjs`** — copies current **`web/`** and **`napi-bridge/`** into **`docs/`**, rewrites `/napi-bridge/` import maps to **`../napi-bridge/`** for project-page URLs, and copies wasm into **`docs/dist/`**.

The landing script (`docs/js/v9-app.js`) opens **`…/web/index.html?bundle=<repo>/dist/claude-code-cli.js&autorun=1`** so the same runtime as localhost loads **Claude Code** in the iframe.

Generated paths **`docs/web/`**, **`docs/napi-bridge/`**, **`docs/dist/`** are gitignored; do not commit them. To test assembly locally after a full wasm build:

`node scripts/bundle-claude-for-pages.mjs && node scripts/prepare-github-pages.mjs`

## License / private

`private: true` in `package.json` — adjust for your distribution model.
