# Feature Research

**Domain:** Browser-native Node.js runtime for AI CLI tools (Claude Code)
**Researched:** 2026-03-18
**Confidence:** MEDIUM -- Claude Code's internal module usage is inferred from tool descriptions and public documentation rather than source inspection; competitive landscape is well-documented.

## Feature Landscape

### Table Stakes (Users Expect These)

Without these features, EdgeJS cannot run Claude Code at all. These are non-negotiable.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **fs module (read/write/stat/readdir)** | Every Claude Code tool (Read, Write, Edit, Glob, LS) depends on filesystem operations. This is the single most exercised Node.js API. | HIGH | Must support sync and async variants. OPFS backend for persistence across sessions. Emscripten MEMFS for in-session speed, with OPFS sync for durability. |
| **child_process (spawn/exec)** | Claude Code's Bash tool spawns a persistent bash session via `child_process.spawn()`. Grep tool invokes ripgrep as a subprocess. Without this, no command execution. | HIGH | Emulate via Web Workers running additional Wasm instances. Need stdin/stdout/stderr pipes, exit codes, signal handling (SIGTERM for KillShell). |
| **HTTPS client (fetch proxy)** | Claude Code makes API calls to `api.anthropic.com` for every conversation turn. Also powers WebFetch tool. Without HTTPS, no AI interaction at all. | MEDIUM | Route through browser `fetch()` at the N-API layer. Intercept Node.js `http`/`https`/`net` module calls. Must support streaming responses (SSE for Anthropic API). |
| **Streams (Readable/Writable/Transform/Duplex)** | Node.js streams underpin file I/O, HTTP responses, child_process pipes, and stdio. Claude Code uses streaming for real-time API responses. | HIGH | Core infrastructure that other features depend on. Must implement backpressure, pipe(), and event-based flow. |
| **crypto module (hashing, HMAC)** | Anthropic SDK uses crypto for request signing/verification. Claude Code may hash file contents for change detection. | MEDIUM | Delegate to Web Crypto API for SHA-256/384/512, HMAC. Fall back to Wasm OpenSSL only for algorithms Web Crypto lacks (e.g., MD5 for legacy npm checksums). |
| **path module** | Used by every file operation tool. Pure computation, no I/O. | LOW | Already implemented as browser builtin. Must handle POSIX paths (Claude Code assumes Unix-like paths). |
| **Buffer** | Binary data handling throughout Node.js. Required by streams, fs, crypto, HTTP. | LOW | Already scaffolded as browser builtin wrapping Uint8Array. Must match Node.js Buffer API surface (alloc, from, toString with encodings). |
| **process object** | `process.env` (API keys), `process.cwd()`, `process.platform`, `process.exit()`, `process.stdin/stdout/stderr`. Claude Code reads env vars for ANTHROPIC_API_KEY. | MEDIUM | Minimal process emulation already scaffolded. Must support env injection via `initEdgeJS(options.env)`, stdio streams connected to terminal UI. |
| **EventEmitter** | Foundation of Node.js event system. Used by streams, child_process, http, net. | MEDIUM | Pure JS implementation. Can use existing npm polyfill or implement from scratch. Required before streams work. |
| **url module** | URL parsing for API endpoints. | LOW | Already implemented via native `URL` class bridge. |
| **util module (promisify, inspect, format)** | Widely used internally by Node.js modules and user code. | LOW | Pure JS, can polyfill progressively. |
| **Terminal UI (xterm.js integration)** | Claude Code is a terminal application. Without a terminal, there is no user interface. | MEDIUM | xterm.js is mature and well-tested. Connect to process.stdin/stdout. Must support ANSI escape codes, cursor movement, color (Claude Code uses ink for terminal UI). |
| **Module resolution (require/import)** | Claude Code and its dependencies use `require()` and dynamic `import()`. Must resolve node_modules, built-in modules, and relative paths. | HIGH | EdgeJS provides module system. Browser builtins override layer intercepts built-in module requests. Must handle the full Anthropic SDK dependency tree. |

### Differentiators (Competitive Advantage)

Features that distinguish EdgeJS from WebContainers, BrowserPod, and Nodebox.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Native JS engine performance (N-API split)** | WebContainers and BrowserPod compile entire runtimes to Wasm. EdgeJS runs user JS on the browser's native JIT engine at full speed. For LLM-heavy workloads (JSON parsing, string manipulation), this is a significant advantage. | Already architected | This is the core architectural bet. No competitor does this. |
| **Persistent filesystem via OPFS** | WebContainers uses ephemeral in-memory FS. Nodebox is ephemeral. EdgeJS can persist project files across browser sessions via OPFS. Users can close the tab, reopen, and resume where they left off. | MEDIUM | OPFS is 3-4x faster than IndexedDB. Synchronous access only in Web Workers (which aligns with our architecture). Storage quota varies: 300MB-several GB depending on browser/device. |
| **Streaming API response support** | Claude Code requires SSE/streaming from the Anthropic API for real-time token display. Most browser Node.js runtimes struggle with streaming HTTP. EdgeJS can leverage browser-native `fetch()` with `ReadableStream` directly. | MEDIUM | The fetch proxy approach naturally supports streaming. Transform browser ReadableStream into Node.js Readable stream at the N-API boundary. |
| **Embeddable SDK** | WebContainers is a paid SaaS ($thousands/year for commercial). BrowserPod has commercial licensing. EdgeJS can be an embeddable, self-hostable SDK that developers integrate into their own apps. | MEDIUM | `initEdgeJS(options)` API already designed. Key differentiator: no vendor lock-in, no per-seat pricing, no attribution requirements. |
| **JSPI for async I/O (Asyncify fallback)** | JSPI (Chrome 137+, Firefox 139+, Safari planned) enables true suspension of Wasm execution during async operations. More efficient than Asyncify's stack rewriting. EdgeJS supports both. | Already implemented | JSPI is standardized (W3C phase 4). Asyncify fallback ensures Safari compatibility until JSPI ships there. BrowserPod uses CheerpOS which has its own async mechanism. |
| **Sub-100MB total footprint** | BrowserPod ships full Node.js compiled to Wasm. WebContainers has multi-MB initial load. EdgeJS targets 10-15MB gzipped because it only compiles the C++ layer, not V8. | HIGH (optimization) | Smaller binary = faster cold start. Critical for embeddable use case. Requires aggressive dead code elimination and lazy module loading. |
| **Cross-browser without COOP/COEP** | WebContainers requires Cross-Origin-Isolation headers (SharedArrayBuffer). This breaks many embedding scenarios. EdgeJS with JSPI+Asyncify can work without SharedArrayBuffer for core functionality. | MEDIUM | Without SharedArrayBuffer: no Web Worker threading for child_process. Must design child_process to degrade gracefully. COOP/COEP headers still recommended for full feature set. |

### Anti-Features (Deliberately NOT Building)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Full V8 compilation to Wasm** | "Why not compile the whole thing?" | V8 to Wasm would be 50-80MB, run at a fraction of native speed, and duplicate the browser's existing JS engine. This is exactly what the N-API split avoids. | N-API bridge delegates JS execution to browser's native engine. |
| **Raw TCP socket support** | Node.js `net` module, database drivers | Browsers cannot open raw TCP sockets. Attempting to emulate this leads to fragile WebSocket tunnels requiring server infrastructure. | Route HTTP/HTTPS through browser fetch. For databases, support HTTP-based APIs (Supabase, PlanetScale, Turso). Document that raw TCP is out of scope. |
| **Native addon (N-API binary) loading** | npm packages with C++ addons (e.g., better-sqlite3, sharp) | Cannot run native binaries in the browser. Attempting to compile arbitrary C++ addons to Wasm is unbounded complexity. | Support Wasm-compiled alternatives where they exist (sql.js instead of better-sqlite3). Document known incompatibilities. |
| **Full npm install with postinstall scripts** | "Just npm install and go" | Postinstall scripts often compile native binaries, access system resources, or run in privileged contexts. This is a security and compatibility nightmare in browser. | Bundle dependencies at build time. Provide a curated set of pre-bundled packages for Claude Code's dependency tree. Progressive: allow npm install for pure-JS packages only. |
| **worker_threads module** | Some Node.js libraries use worker_threads | Requires SharedArrayBuffer with COOP/COEP headers. Conflicts with easy embedding. Complex to implement with limited benefit for the Claude Code use case. | Use Web Workers for child_process emulation. Claude Code doesn't use worker_threads directly. |
| **Offline mode** | "Work without internet" | Claude Code requires API calls to api.anthropic.com for every turn. The runtime is useless without network. | Not applicable. Document that network is required. |
| **Server-side HTTP listener (net.createServer)** | Running Express/Fastify servers in the browser | ServiceWorker-based server emulation is complex and fragile. Claude Code doesn't serve HTTP. | Out of scope for v1. Could add ServiceWorker-based approach in v2 if demand exists. |
| **Full process.spawn() compatibility** | Arbitrary binary execution | Cannot execute arbitrary binaries in browser. Only Wasm-compiled programs can run. | Support a defined set of "shell commands" (ls, cat, grep/ripgrep, git) implemented as Wasm modules or JS shims. |

## Feature Dependencies

```
Terminal UI (xterm.js)
    └──requires──> process.stdin/stdout/stderr
                       └──requires──> Streams (Readable/Writable)
                                          └──requires──> EventEmitter
                                          └──requires──> Buffer

fs module (OPFS-backed)
    └──requires──> Streams (for createReadStream/createWriteStream)
    └──requires──> Buffer
    └──requires──> path module

HTTPS client (fetch proxy)
    └──requires──> Streams (for response streaming)
    └──requires──> url module
    └──requires──> Buffer

child_process emulation
    └──requires──> Streams (stdin/stdout/stderr pipes)
    └──requires──> EventEmitter (exit, error, close events)
    └──requires──> fs module (for cwd, env resolution)
    └──requires──> Web Workers (execution environment)

Module resolution (require/import)
    └──requires──> fs module (reading module files)
    └──requires──> path module (resolving paths)
    └──requires──> Browser builtins override layer

Claude Code boot
    └──requires──> Module resolution
    └──requires──> fs module
    └──requires──> child_process (Bash tool)
    └──requires──> HTTPS client (Anthropic API)
    └──requires──> crypto module (SDK auth)
    └──requires──> process object (env vars, cwd)
    └──requires──> Terminal UI

Persistent filesystem (OPFS)
    └──enhances──> fs module (adds cross-session persistence)
    └──requires──> Web Worker (synchronous OPFS access)

Embeddable SDK
    └──requires──> All table stakes features working
    └──enhances──> Terminal UI (optional, can run headless)
```

### Dependency Notes

- **Streams require EventEmitter:** Node.js streams extend EventEmitter. This must be implemented first.
- **child_process requires Web Workers:** Each "subprocess" is a Web Worker running a Wasm instance. This is the heaviest infrastructure dependency.
- **OPFS requires Web Worker:** Synchronous OPFS methods (read/write) are only available inside Web Workers, not the main thread. This aligns well since the Wasm runtime likely runs in a Worker anyway.
- **Terminal UI requires Streams:** xterm.js receives data via stream-like interfaces connected to process.stdout.
- **Module resolution requires fs:** Loading JavaScript modules from the virtual filesystem is the core bootstrapping step.

## MVP Definition

### Launch With (v1) -- "Claude Code boots and converses"

- [ ] **EventEmitter** -- Foundation for all event-driven APIs
- [ ] **Buffer** -- Binary data handling (already scaffolded)
- [ ] **Streams** -- Required by fs, http, child_process, stdio
- [ ] **path module** -- Already implemented, verify completeness
- [ ] **url module** -- Already implemented, verify completeness
- [ ] **process object** -- env, cwd, platform, stdin/stdout/stderr, exit
- [ ] **fs module (MEMFS)** -- In-memory filesystem with sync/async Read, Write, readdir, stat, mkdir, unlink, rename
- [ ] **crypto module** -- SHA-256, HMAC via Web Crypto. Enough for Anthropic SDK.
- [ ] **HTTPS client via fetch proxy** -- Streaming support for SSE. Enough for api.anthropic.com.
- [ ] **Module resolution** -- require() and import() for bundled Claude Code + Anthropic SDK
- [ ] **Terminal UI (xterm.js)** -- Interactive session with ANSI support
- [ ] **Minimal child_process** -- spawn() with stdio pipes via Web Workers. Enough for Bash tool.
- [ ] **Shell command shims** -- ls, cat, grep (ripgrep-lite), find, head, tail, echo, git (read-only)

### Add After Validation (v1.x)

- [ ] **OPFS persistent filesystem** -- Add when basic MEMFS works; sync files to OPFS for cross-session persistence
- [ ] **git integration (write operations)** -- commit, branch, diff beyond read-only
- [ ] **Expanded crypto** -- Full createHash, createHmac, randomBytes, createCipheriv if needed
- [ ] **npm package loading** -- Install pure-JS packages from CDN at runtime
- [ ] **Web Workers pool** -- Reuse Workers for child_process to reduce spawn latency
- [ ] **Embeddable SDK API** -- Clean initEdgeJS() with options, events, lifecycle hooks

### Future Consideration (v2+)

- [ ] **Multi-CLI support** -- Codex CLI, Gemini CLI, Aider once Claude Code works
- [ ] **MCP server support** -- Model Context Protocol for external tool integration
- [ ] **ServiceWorker-based HTTP server** -- If dev server use cases emerge
- [ ] **WebSocket support** -- For real-time protocols beyond HTTP
- [ ] **Collaborative sessions** -- Multiple users sharing a runtime instance
- [ ] **Snapshot/restore** -- Serialize Wasm memory + OPFS state for instant resume

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| fs module (MEMFS) | HIGH | HIGH | P1 |
| HTTPS client (fetch proxy) | HIGH | MEDIUM | P1 |
| Streams | HIGH | HIGH | P1 |
| child_process (Web Workers) | HIGH | HIGH | P1 |
| Terminal UI (xterm.js) | HIGH | MEDIUM | P1 |
| Module resolution | HIGH | HIGH | P1 |
| process object | HIGH | LOW | P1 |
| crypto (Web Crypto) | HIGH | MEDIUM | P1 |
| EventEmitter | HIGH | LOW | P1 |
| Buffer | HIGH | LOW | P1 |
| path module | HIGH | LOW | P1 |
| url module | HIGH | LOW | P1 |
| Shell command shims | HIGH | MEDIUM | P1 |
| OPFS persistence | MEDIUM | MEDIUM | P2 |
| Embeddable SDK | MEDIUM | MEDIUM | P2 |
| git write operations | MEDIUM | MEDIUM | P2 |
| npm runtime install | LOW | HIGH | P3 |
| MCP support | MEDIUM | HIGH | P3 |
| Multi-CLI support | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for Claude Code to boot and converse
- P2: Should have, add once core works
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | WebContainers (StackBlitz) | BrowserPod (Leaning Tech) | Nodebox (CodeSandbox) | Nodepod (OSS) | EdgeJS (Ours) |
|---------|---------------------------|--------------------------|----------------------|---------------|---------------|
| **Architecture** | Full Node.js to Wasm | Node.js via CheerpOS syscall layer | JS polyfills, no Wasm | Web Workers + polyfills | N-API split: C++ to Wasm, JS native |
| **JS Execution Speed** | Wasm-interpreted | Wasm-interpreted | Native (polyfills only) | Native | Native (browser JIT) |
| **Boot Time** | 2-5 seconds | ~1 second | ~1 second | ~100ms | Target: 1-3 seconds |
| **Binary Size** | Multi-MB (proprietary) | Full Node.js Wasm | ~600KB (polyfills) | ~600KB | Target: 10-15MB gzipped |
| **fs Module** | Full (ephemeral MEMFS) | Full (CheerpOS VFS) | Partial | 40+ polyfills | Full sync+async (MEMFS + OPFS) |
| **child_process** | Yes (limited) | Yes (multiprocess) | Limited, no sync fork | Yes (polyfilled) | Yes (Web Workers) |
| **Networking** | HTTP only, ServiceWorker | HTTP + inbound (Portals) | HTTP only (serverless DBs) | HTTP polyfill | HTTP/HTTPS via fetch proxy |
| **Persistence** | Ephemeral | Unknown | Ephemeral | Ephemeral | OPFS (survives page reload) |
| **Browser Support** | Chromium (requires COOP/COEP), Firefox/Safari beta | Chromium only (initial) | All browsers | Chromium | All browsers (JSPI for Chrome/Firefox, Asyncify fallback) |
| **Requires COOP/COEP** | Yes (SharedArrayBuffer) | Yes | No | No | Recommended, not required |
| **Licensing** | Commercial ($$$) | Free non-commercial, paid commercial | Open source | MIT | Self-hosted |
| **Primary Use Case** | Web IDE (StackBlitz) | Code sandboxes for AI | Embedded code previews | Lightweight sandboxes | AI CLI tools in browser |
| **Node.js Version** | Custom (not versioned) | Node.js 22 | Subset | Subset | EdgeJS (Node-compatible subset) |

### Competitive Positioning

**vs. WebContainers:** EdgeJS wins on JS execution speed (native vs Wasm-interpreted), persistence (OPFS), browser compatibility (no mandatory COOP/COEP), and cost (self-hosted vs commercial licensing). WebContainers wins on Node.js API completeness and ecosystem maturity (5+ years).

**vs. BrowserPod:** EdgeJS wins on JS execution speed and lighter binary (C++ layer only vs full Node.js). BrowserPod wins on Node.js fidelity (runs unmodified Node.js 22) and multi-language roadmap. BrowserPod is the closest architectural competitor but uses a fundamentally different approach (full Linux syscall emulation via CheerpOS).

**vs. Nodebox/Nodepod:** These are polyfill-based runtimes -- lightweight but limited. They cannot run anything requiring real C++ Node.js internals (OpenSSL, nghttp2, libuv). EdgeJS targets higher fidelity than polyfills can achieve.

**EdgeJS's unique position:** The only runtime that gives native JS performance while still providing real Node.js C++ module behavior. This matters for AI workloads where the JS application (Anthropic SDK, JSON parsing, string processing) is performance-critical.

## Claude Code-Specific API Requirements

Based on analysis of Claude Code's tool system and Anthropic SDK:

| API | Tool/Feature Using It | Priority |
|-----|----------------------|----------|
| `fs.readFile/readFileSync` | Read tool, Edit tool, module loading | Critical |
| `fs.writeFile/writeFileSync` | Write tool, Edit tool | Critical |
| `fs.readdir/readdirSync` | LS tool, Glob tool | Critical |
| `fs.stat/statSync` | Glob (sort by mtime), Read (validation) | Critical |
| `fs.mkdir/mkdirSync` | Write tool (create parent dirs) | Critical |
| `fs.unlink/unlinkSync` | File deletion | High |
| `fs.rename/renameSync` | File operations | High |
| `child_process.spawn` | Bash tool (persistent session) | Critical |
| `child_process.exec` | Bash tool (one-off commands) | Critical |
| `https.request` / `fetch` | Anthropic API calls | Critical |
| `crypto.createHash` | SDK auth, file checksums | High |
| `crypto.createHmac` | SDK request signing | High |
| `crypto.randomBytes` | Nonce generation | Medium |
| `process.env` | ANTHROPIC_API_KEY, config | Critical |
| `process.cwd()` | All file operations | Critical |
| `process.stdin/stdout` | Terminal I/O | Critical |
| `process.exit()` | Session termination | High |
| `path.join/resolve/dirname/basename` | All file operations | Critical |
| `url.parse / new URL()` | API endpoint construction | High |
| `EventEmitter` | Streams, child_process events | Critical |
| `Buffer.from/alloc/toString` | Binary data, encoding | Critical |
| `stream.Readable/Writable` | HTTP responses, stdio pipes | Critical |
| `util.promisify` | Async wrappers | Medium |
| `os.platform/homedir/tmpdir` | Environment detection | Medium |
| `readline` | Possible terminal input | Low |

## Sources

- [WebContainers API Docs](https://webcontainers.io/) -- API reference and capabilities
- [WebContainers Browser Support](https://developer.stackblitz.com/platform/webcontainers/browser-support) -- Browser compatibility details
- [BrowserPod Announcement](https://labs.leaningtech.com/blog/browserpod-annoucement) -- Architecture and roadmap
- [BrowserPod 1.0](https://labs.leaningtech.com/blog/browserpod-10) -- General availability details
- [Nodebox Runtime (GitHub)](https://github.com/Sandpack/nodebox-runtime) -- API limitations documentation
- [Nodepod Introduction (Scelar)](https://scelar.com/blog/introducing-nodepod) -- Performance claims and feature list
- [Claude Code - How It Works](https://code.claude.com/docs/en/how-claude-code-works) -- Official architecture documentation
- [Claude Code Tools System Prompt (GitHub Gist)](https://gist.github.com/wong2/e0f34aac66caf890a332f7b6f9e2ba8f) -- Complete tool definitions
- [Claude Code Internal Tools (GitHub Gist)](https://gist.github.com/bgauryy/0cdb9aa337d01ae5bd0c803943aa36bd) -- Implementation analysis
- [OPFS - MDN](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system) -- OPFS specifications and limitations
- [JSPI State of WebAssembly](https://platform.uno/blog/the-state-of-webassembly-2025-2026/) -- JSPI browser support timeline
- [V8 JSPI Blog Post](https://v8.dev/blog/jspi) -- JSPI technical details
- [Interop 2026 (WebKit)](https://webkit.org/blog/17818/announcing-interop-2026/) -- JSPI in Interop 2026

---
*Feature research for: Browser-native Node.js runtime (EdgeJS v9)*
*Researched: 2026-03-18*
