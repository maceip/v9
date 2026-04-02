# v9 — Node.js in the browser (EdgeJS + N-API bridge)

Run **Node-shaped** apps in Chromium: WebAssembly runtime, `napi-bridge` built-ins, xterm UI, and a conformance suite that stays aligned across **browser JS** and **Wasm/MEMFS**.

**Not** tied to a single vendor CLI — that was early scaffolding. Product direction: general-purpose Node-in-tab (`docs/NODEJS_IN_TAB_ROADMAP.md`).

## Quick start

```bash
npm install
# Build EdgeJS wasm/js (toolchain-dependent):
# npm run build   # or make / build-emscripten per Makefile

# Dev server (static + optional API proxy):
node scripts/dev-server.mjs
```

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
| `edgejs.wasm`, `edgejs.js` | `npm run build` / `make` | Wasm runtime loaded by the bridge |
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

## License / private

`private: true` in `package.json` — adjust for your distribution model.
