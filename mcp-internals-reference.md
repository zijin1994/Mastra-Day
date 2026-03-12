# MCP Internals — How Tools Are Registered, Discovered, and Called

A walkthrough of the MCP TypeScript SDK internals showing how JSON-RPC connects clients to servers.

## The Full Picture

### Server Side — Where Tools Are Registered and Served

**File: `packages/server/src/server/mcp.ts`**

- [`registerTool()`](https://github.com/modelcontextprotocol/typescript-sdk/blob/108f2f3ab6a1267587c7c4f900b6eca3cc2dae51/packages/server/src/server/mcp.ts#L869-L898) — stores the tool in a `_registeredTools` map
- [`tools/list` handler](https://github.com/modelcontextprotocol/typescript-sdk/blob/108f2f3ab6a1267587c7c4f900b6eca3cc2dae51/packages/server/src/server/mcp.ts#L139-L165) — returns only metadata, never code
- [`tools/call` handler](https://github.com/modelcontextprotocol/typescript-sdk/blob/108f2f3ab6a1267587c7c4f900b6eca3cc2dae51/packages/server/src/server/mcp.ts#L168-L221) — the actual dispatch

---

### Client Side — Where Tools Are Discovered and Called

**File: `packages/client/src/client/client.ts`**

- [`connect()`](https://github.com/modelcontextprotocol/typescript-sdk/blob/108f2f3ab6a1267587c7c4f900b6eca3cc2dae51/packages/client/src/client/client.ts#L470-L522) — handshake first
- [`listTools()`](https://github.com/modelcontextprotocol/typescript-sdk/blob/108f2f3ab6a1267587c7c4f900b6eca3cc2dae51/packages/client/src/client/client.ts#L980-L992) — fetches the schemas
- [`callTool()`](https://github.com/modelcontextprotocol/typescript-sdk/blob/108f2f3ab6a1267587c7c4f900b6eca3cc2dae51/packages/client/src/client/client.ts#L860-L907) — sends a `tools/call` RPC request

---

### The RPC Router — Where Messages Get Dispatched

**File: `packages/core/src/shared/protocol.ts`**

- [`onmessage` dispatcher](https://github.com/modelcontextprotocol/typescript-sdk/blob/108f2f3ab6a1267587c7c4f900b6eca3cc2dae51/packages/core/src/shared/protocol.ts#L707-L718) — routes incoming messages by type
- [`_onrequest()`](https://github.com/modelcontextprotocol/typescript-sdk/blob/108f2f3ab6a1267587c7c4f900b6eca3cc2dae51/packages/core/src/shared/protocol.ts#L761-L910) — looks up handler by method name

---

### JSON-RPC Type Definitions

- [`packages/core/src/types/spec.types.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/108f2f3ab6a1267587c7c4f900b6eca3cc2dae51/packages/core/src/types/spec.types.ts#L181-L222)

---

## Request Flow Diagram

```
Client                                  Server
  |                                       |
  |──── initialize (handshake) ──────────>|
  |<─── capabilities + protocol ver ──────|
  |                                       |
  |──── tools/list ──────────────────────>|   "what can you do?"
  |<─── [tool names + JSON schemas] ──────|   returns metadata only
  |                                       |
  |──── tools/call ──────────────────────>|
  |     { name: "read_text_file",         |
  |       arguments: { path: "..." } }    |
  |                                       |
  |     (server runs the handler)         |
  |                                       |
  |<─── result ───────────────────────────|
  |     { content: [{ type: "text",       |
  |       text: "file contents..." }] }   |
```

---

## Summary

| Step | Who | File | What happens |
|------|-----|------|-------------|
| 1. Connect | Client | [`client.ts#connect()`](https://github.com/modelcontextprotocol/typescript-sdk/blob/108f2f3ab6a1267587c7c4f900b6eca3cc2dae51/packages/client/src/client/client.ts#L470-L522) | `initialize` handshake |
| 2. Discover | Client | [`client.ts#listTools()`](https://github.com/modelcontextprotocol/typescript-sdk/blob/108f2f3ab6a1267587c7c4f900b6eca3cc2dae51/packages/client/src/client/client.ts#L980-L992) | `listTools()` sends `tools/list` RPC |
| 3. Serve schemas | Server | [`mcp.ts#tools/list`](https://github.com/modelcontextprotocol/typescript-sdk/blob/108f2f3ab6a1267587c7c4f900b6eca3cc2dae51/packages/server/src/server/mcp.ts#L139-L165) | `tools/list` handler returns names + JSON schemas |
| 4. Invoke | Client | [`client.ts#callTool()`](https://github.com/modelcontextprotocol/typescript-sdk/blob/108f2f3ab6a1267587c7c4f900b6eca3cc2dae51/packages/client/src/client/client.ts#L860-L907) | `callTool()` sends `tools/call` RPC |
| 5. Dispatch | Core | [`protocol.ts#onmessage`](https://github.com/modelcontextprotocol/typescript-sdk/blob/108f2f3ab6a1267587c7c4f900b6eca3cc2dae51/packages/core/src/shared/protocol.ts#L707-L718) | Routes by method name to handler |
| 6. Execute | Server | [`mcp.ts#tools/call`](https://github.com/modelcontextprotocol/typescript-sdk/blob/108f2f3ab6a1267587c7c4f900b6eca3cc2dae51/packages/server/src/server/mcp.ts#L168-L221) | `tools/call` handler looks up tool, validates input, runs callback |
| 7. Return | Core | [`protocol.ts#_onrequest`](https://github.com/modelcontextprotocol/typescript-sdk/blob/108f2f3ab6a1267587c7c4f900b6eca3cc2dae51/packages/core/src/shared/protocol.ts#L761-L910) | Wraps result in JSON-RPC response, sends back |

**Key takeaway:** The client never has the tool code — it only ever has `{ name, description, inputSchema }`. Every actual execution is a round-trip RPC call.

---

## Reference: Filesystem MCP Server Example

A concrete implementation using this SDK: [`modelcontextprotocol/servers/src/filesystem`](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem)

| File | Purpose |
|------|---------|
| `index.ts` | Entry point — registers 14 tools with `server.registerTool()` |
| `lib.ts` | Core logic — file operations, path validation, security |
| `path-utils.ts` | Path resolution helpers |
| `roots-utils.ts` | MCP roots protocol handling |
