# grpc_exec

`grpc_exec` is the execution anchor for the new V9 surface.

It provides:

- **streaming command execution** over gRPC
- **termination control** for long-running commands
- **network tunnel streams** for browser/host clients that need a single
  supported transport instead of the legacy gVisor/Wisp/fetch-proxy matrix

The intended deployment model is:

- run `grpc_execd` close to the sandbox/runtime you want to expose
- connect clients over a hosted endpoint
- use the same module family for both command execution and network access

## Services

### `ExecService`

The reference-compatible command execution service.

- first client event starts a command
- output streams incrementally
- later client events can terminate the running command
- a final exit event reports completion

### `TunnelService`

The V9 extension that replaces the legacy transport stack with a single
gRPC-backed byte stream path.

- open a network stream to `host:port`
- exchange raw bytes over the stream
- close the stream explicitly

This is the single supported “chisel/tunnel” transport path for the rewritten
project.

## Current status

The command execution service is implemented and tested.

The tunnel service contract is defined in the proto as part of the migration
away from the old multi-transport browser stack. Server/client plumbing is the
next step in the rewrite.
