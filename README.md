# agent-shell-tools + V9 runtime orchestration

This repository is being repurposed from the old browser-first V9 surface into a
new project focused on the same top-level components and compositions as
[`google/agent-shell-tools`](https://github.com/google/agent-shell-tools):

- **[`sandbox/`](sandbox/)** — sandboxed command execution boundary
- **[`command_filter/`](command_filter/)** — narrow host-side command delegation
- **[`grpc_exec/`](grpc_exec/)** — streaming command execution over gRPC
- **[`mcpmux/`](mcpmux/)** — MCP proxy for iterative tool/server development

The V9 contribution now lives in the orchestration layer around those tools:

- browser and Node.js clients for hosted execution
- multi-runtime / multi-sandbox session management
- concurrent runtime isolation for multiple terminals or agents on one page

File access is intentionally **out of scope** for the product surface. Agents
use their native file tools for that.

## Product direction

The repo is intentionally moving away from:

- `v9 run`
- `v9 build`
- browser-direct TCP / Wisp / fetch-proxy transport tiers
- MEMFS shell shims as the primary execution model

and toward:

- real sandboxed command execution
- `grpc_exec` as the canonical execution transport
- one gRPC-backed network tunnel path
- multiple independent runtime sessions sharing the same page safely

## Components

### `sandbox`

Sandboxed execution boundary. The reference shape is an nsjail-based sandbox,
where the agent has freedom **inside** the sandbox but cannot access host
credentials or mutate the host filesystem outside the mounted sandbox scope.

### `command_filter`

Rule-language-based allow-listing for host-side commands. This complements
sandboxing; it does **not** replace it.

### `grpc_exec`

gRPC streaming command execution. This module is the anchor for the new V9
execution model and is also where the single supported tunnel/chisel-style
network path will live.

### `mcpmux`

An MCP proxy that can add, reload, and remove child MCP servers dynamically.

## Supported compositions

### Agent inside the sandbox

The agent runs inside `sandbox` and executes commands there. `command_filter`
only applies to any intentionally delegated host-side commands.

### Agent outside the sandbox

The agent or UI client runs outside the sandbox and talks to `grpc_exec`
inside the sandbox over a hosted endpoint.

### Multiple runtimes on one page

The new V9-specific requirement is explicit support for:

- multiple sandboxes,
- multiple runtime sessions,
- and multiple terminal/agent clients

running concurrently on the same page without shared-state collisions.

## Development

The canonical surface is now the imported tool suite plus V9 orchestration
around it. Any remaining browser/runtime code should be treated as transitional
client-side support, not the primary product surface.

### Go components

The imported `agent-shell-tools`-style components build and test via Go:

```bash
go test ./grpc_exec/... ./mcpmux/...
```

### Browser/runtime experiments

Legacy browser/runtime code still exists during migration, but it is no longer
the primary product surface. It should be treated as a client/demo layer until
fully reworked around isolated runtime instances and grpc-backed execution.

## Status

This branch is intentionally breaking compatibility with the old V9 APIs in
order to produce a cleaner successor repository with the exact high-level
surface requested above.
