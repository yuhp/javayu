---
title: "How to Build Modern OpenCode Plugin UIs: Decoupling Server and TUI via the V2 RPC Architecture"
description: "The third critical boundary shift from OpenCode plugins V1 to V2: how should responsibilities be divided between the user interface and backend business logic? Why should a simple model refresh never pollute the Agent conversation session? This article explores the architectural evolution from config-injected commands and synthetic messages to native TUI keymaps, strongly typed RPC contracts, and the zero-restart Discovery Console."
publishedAt: 2026-10-16T11:00:00+08:00
lang: en
tags:
  - OpenCode
  - Software Architecture
  - RPC
  - TUI
  - Plugins
  - TypeScript
cover:
  src: /images/posts/opencode-plugin-rpc-tui-separation/cover.png
  thumbnail: /images/posts/opencode-plugin-rpc-tui-separation/cover-thumb.png
  alt: Architecture diagram showing decoupled communication between the OpenCode plugin Server backend and the TUI frontend via typed RPC contracts.
translationSlug: opencode-plugin-rpc-tui-separation
---

> **Overview**: This is the third deep-dive in the series *OpenCode Plugins V1 to V2: Architecture Evolution*. After addressing credential ownership (via the Integration API) and state persistence (via Host Storage), another critical friction point emerges when building visual interactions: **why should routine operations—like refreshing models or tweaking overrides—inadvertently trigger an Agent's LLM conversation loop?** Using the `opencode-models-discovery` plugin as a case study, this article examines the progression across three generations of plugin UI designs and demonstrates how to cleanly decouple the Server backend from the TUI frontend using OpenCode V2's native RPC architecture.

---

## Why Did a "Refresh Models" Command Trigger the Agent?

In OpenCode V1, plugins integrated with the user interface via configuration injection: plugins registered command definitions inside their `config` hooks, and the Agent executed the corresponding prompt templates.

In early V2 iterations, attempting to let users trigger refreshes directly led to an intermediate workaround: executing a Server Command and feeding the result back into the current chat session via `session.synthetic()`.

This introduced an unintuitive and jarring user experience:

```text
User simply wants to refresh the model list
  ↓
Plugin injects a synthetic message into the active chat session
  ↓
The active Agent reasoning loop awakens unintentionally
  ↓
Spurious LLM completions or unrequested tool executions are triggered
```

Refreshing models is fundamentally a deterministic administrative action, not an conversational prompt. **Forcing it into the chat session conflates user interface interactions with the Agent dialogue runtime—violating an essential architectural boundary.**

---

## Three Generations of Plugin UI Interaction

The interaction model of OpenCode plugins evolved across three distinct generations:

```text
Generation 1 (V1): Config-injected commands → Agent prompt templates

Generation 2 (Early V2): Agent Tools / Server Commands → session.synthetic() messages

Generation 3 (Current V2): Native TUI Keymaps → Strongly typed RPC → Server Handlers → Native Toasts & Dialogs
```

The breakthrough of the current architecture is clear: **the TUI is no longer an afterthought grafted onto the chat prompt loop. It operates as an independent presentation client communicating with the backend over typed RPC, completely avoiding chat history pollution.**

---

## The Server: The Single Source of Truth

In a decoupled architecture, all operations involving network requests, credential resolution, and core Provider Registry manipulations are strictly consolidated in the Server Plugin:

- Inspecting and querying the active Provider Registry;
- Parsing discovery filtering and naming parameters;
- Resolving credentials securely via the Integration API;
- Managing cache entries and persistent model overrides through Host Storage;
- Querying remote `/v1/models` endpoints;
- Maintaining an in-memory inventory and swapping it atomically;
- Triggering `provider.transform()` and `provider.reload()`;
- Registering public Agent Tools and RPC handlers.

Whether triggered by terminal startup, config hot-reloads, credential updates, automated Agent Tools, or interactive TUI commands, the Server executes a single idempotent pipeline:

```typescript
const refreshFromCurrentConfig = async (force?: boolean) => {
  // 1. Sync active provider settings and integration connections
  // 2. Resolve credentials securely via the Integration API
  // 3. Perform model discovery and metadata enrichment
  // 4. Merge persistent user overrides
  // 5. Atomically update in-memory inventory and reload providers
}
```

This single-source-of-truth design guarantees that business logic never drifts across different UI or execution surfaces.

---

## RPC: The Strongly Typed Contract Between Server and TUI

In `v2.0.0-rc.1`, inter-process communication is defined formally in `src/v2/rpc.ts`, covering status queries, refreshes, cache maintenance, and model override lifecycles:

```typescript
export const DiscoveryRpcDefinition = Rpc.define({
  id: "opencode.models-discovery",
  methods: {
    status: { /* Retrieve provider/model catalogs and override flags */ },
    refresh: { /* Trigger incremental or forced discovery refreshes */ },
    cacheInspect: { /* Inspect cache keys, TTL freshness, and hits */ },
    cacheClear: { /* Clear specific provider or all discovery caches */ },
    overrideList: { /* Query all active persistent model overrides */ },
    overrideSet: { /* Validate and save model override patches */ },
    overrideDelete: { /* Delete overrides and restore discovered defaults */ },
  },
})
```

The Server registers handlers:

```typescript
await ctx.rpc.register(DiscoveryRpcDefinition, {
  refresh: async (rawInput) => {
    const input = rawInput as { force?: boolean } | undefined
    const result = await refreshFromCurrentConfig(input?.force === true)
    return {
      providers: result.providers,
      models: result.models,
    }
  },
  overrideSet: async (input) => {
    const override = await setModelOverride(ctx.storage, input)
    await refreshInventoryInternal()
    await ctx.provider.reload()
    return { success: true, override }
  },
  overrideDelete: async ({ providerID, modelID }) => {
    const success = await deleteModelOverride(ctx.storage, providerID, modelID)
    await refreshInventoryInternal()
    await ctx.provider.reload()
    return { success }
  },
})
```

The TUI instantiates a typed client:

```typescript
const rpc = context.client.rpc(DiscoveryRpcDefinition)

const result = await rpc.refresh(
  { force: true },
  { location },
)
```

**The primary benefit of RPC is establishing strict encapsulation boundaries**: the TUI only consumes typed inputs and outputs. It has zero knowledge of—and no direct access to—how the Server manages secrets, handles disk caching, or talks to upstream providers.

---

## The TUI: Dedicated Purely to User Ergonomics

With business logic isolated, `src/tui.ts` becomes a lean presentation layer focused solely on user interactions:

1. Registering slash commands and command palette entries;
2. Capturing user arguments (e.g. force flags or provider filters);
3. Dispatching non-blocking, asynchronous RPC requests;
4. Rendering clean responses via native Toasts, Selects, Confirms, and Alert dialogs.

Consider the slash command implementation:

```typescript
context.keymap.layer(() => ({
  mode: "global",
  commands: [{
    id: "models-discovery.refresh",
    slash: {
      name: "models-discovery-refresh",
      arguments: true,
    },
    run: async (input) => {
      const force = input?.toLowerCase().includes("force")
      const result = await rpc.refresh({ force }, { location })

      context.ui.toast.show({
        title: "Models Discovery",
        message: `Discovered ${result.models} models across ${result.providers} providers.`,
        variant: "success",
      })
    },
  }],
}))
```

**Notice what is absent**: no HTTP requests, no credential sniffing, and no direct storage calls. The TUI acts strictly as a lightweight, reactive terminal client.

---

## The Discovery Console: RPC-Driven Multi-Tier Navigation & Zero-Restart Overrides

In `v2.0.0-rc.1`, this architecture powers an interactive terminal console (`/models-discovery-console`):

```text
Models Discovery Console
  ├─ Browse Models
  │    ├─ Provider list
  │    ├─ Model list (overridden models flagged with an asterisk: "claude-3-5-sonnet *")
  │    └─ Model details & Actions
  │         ├─ Edit override (modify Name / Context Limit / Output Limit / Reasoning)
  │         └─ Delete override (remove customizations, restoring discovered values)
  │
  └─ Cache Operations
       ├─ Inspect Cache Status (view cache hits, ages, and TTL states)
       ├─ Force Refresh (bypass caches and re-fetch from remotes)
       ├─ Clear Provider Cache (purge cache for a single provider)
       └─ Clear All Discovery Caches (flush all discovery caches without touching overrides)
```

### 1. Robust Sanitization During Model Inspection
The model browsing views consume sanitized data returned by the `status` RPC. They display model IDs, context window sizes, and reasoning flags, while **all API keys, Authorization headers, and internal host secrets remain safely inaccessible behind the Server barrier**.

### 2. The Zero-Restart Reactive Loop
When a developer chooses **Edit override** in the TUI to expand a model's context limit:

1. The TUI captures user input and calls `rpc.overrideSet()`;
2. The Server validates the schema, verifies allowlisted fields, and writes to `ctx.storage`;
3. The Server calls `ctx.provider.reload()`, causing the host to replay transforms instantly;
4. The active Provider Registry updates in memory;
5. The TUI re-fetches `status` in place; an asterisk `*` appears beside the model name, and the new configuration is instantly live.

**Developers never need to restart the OpenCode daemon, exit their active terminal, or reconnect providers.**

---

## Why Decoupling Greatly Reduces Maintenance Overhead

1. **Eliminates Code Duplication (DRY)**:
   If the TUI made direct network calls, logic would diverge across Agent Tools, background boot routines, and user commands. Centralizing discovery in the Server prevents drift.
2. **Zero Credential Leakage**:
   Resolved plaintext secrets exist briefly in the Server's memory during HTTP discovery calls and are never transmitted over RPC to the UI layer.
3. **Guards Against State Divergence**:
   In-memory inventories, storage caches, and Provider Registry drafts are governed exclusively by the Server. The TUI never maintains stale state caches.
4. **Independent, Predictable Testing**:
   The Server can be tested thoroughly without any terminal environment for resilience, offline caching, and security invariants; the TUI can be tested independently by mocking the RPC interface.

---

## Complementary Roles: Native TUI Commands vs. Agent Tools

Introducing a native TUI does not make Agent Tools obsolete. Rather, they serve complementary purposes in a modern developer tool:

```text
Agent Tool ──┐
             ├─> Server Core Controller (Single Domain Implementation)
TUI RPC  ────┘
```

- **Agent Tools**: Designed for autonomous model loops, scriptable automation, and multi-step agent debugging;
- **TUI Commands / RPC**: Designed for human developers requiring immediate feedback, hotkey control, and visual ergonomics.

Both channels share identical domain capabilities while preserving separate input/output contracts.

---

## Conclusion: Presentation Layers Should Never Hold Business State

Tracing the architectural evolution of OpenCode plugins leads to one essential insight:

```text
TUI Frontend: Owns presentation, human interaction, and UX ergonomics
Server Backend: Owns domain logic, security boundaries, and persistent state
```

When a user executes `/models-discovery-refresh`, the TUI issues a structured contract request. Credential resolution, caching, network requests, and Registry updates execute safely on the Server. Feedback returns through native Toasts without injecting noise into the user's ongoing conversation.

This is the real strength of the OpenCode V2 architecture: **empowering the TUI to be a clean, modern client rather than a monolithic, stateful burden.**

---

## Project & Release Resources

The complete RPC schema, native TUI command integrations, and interactive Discovery Console implementation are open source and deployed:

- **GitHub Release**: [`opencode-models-discovery v2.0.0-rc.1`](https://github.com/yuhp/opencode-models-discovery/releases/tag/v2.0.0-rc.1) (Complete Server/TUI RPC contracts and zero-restart console)
- **npm Package**: [`opencode-models-discovery@2.0.0-rc.1`](https://www.npmjs.com/package/opencode-models-discovery/v/2.0.0-rc.1) (Dual-version package supporting OpenCode V1 and V2)
