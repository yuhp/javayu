---
title: "From Config Hooks to Server/TUI: The Architecture Evolution of OpenCode Plugins from V1 to V2"
description: "Moving from OpenCode V1 to V2 is far more than swapping API names—it is a fundamental redistribution of responsibilities between host and plugin. Drawing from real-world model discovery plugin experience, this article breaks down the shift from config hooks, filesystem auth, and XDG caching to Provider Transforms, Host Storage, the Integration API, and Server/TUI RPC."
publishedAt: 2026-10-14
lang: en
tags:
  - OpenCode
  - Architecture
  - Plugins
  - TypeScript
  - Open Source
cover:
  src: /images/posts/opencode-plugin-v1-v2-architecture/cover.png
  thumbnail: /images/posts/opencode-plugin-v1-v2-architecture/cover-thumb.png
  alt: Diagram illustrating the architectural evolution of OpenCode plugins from V1 config hooks and filesystem monolith to V2 Provider Transforms, Host Storage, and Server/TUI separation.
translationSlug: opencode-plugin-v1-v2-architecture
---

> **Overview**: With the release of OpenCode 2.0, plugin developers face much more than a routine API migration—it represents a complete overhaul of the boundary between the host and its plugins. In V1, plugins were effectively monolithic orchestrators, expected to parse configurations, locate auth files, manage local caches, and mutate runtime state directly. In V2, the host takes ownership of credentials, persistence, and inter-process boundaries, while plugins shift toward a declarative architecture built on Provider Registries, Host Storage, and Server/TUI separation. This article uses the end-to-end evolution of a model discovery plugin to break down the architectural decisions and engineering practices behind that transformation.

---

## Beyond an API Migration

Initially, a model discovery plugin only needed to do one simple thing during OpenCode startup: read provider configuration, query `/v1/models`, and write the discovered models back into the config object.

In OpenCode V2, the foundational assumptions changed:

1. Built-in provider and model definitions are now managed by dedicated core modules.
2. The internal Integration system manages authentication natively, eliminating plaintext credential extraction from `auth.json`.
3. The host provides an explicit, managed persistence layer via `ctx.storage`.
4. TUI interactions and background services are decoupled across process boundaries.

Consequently, building for V2 is **not about swapping deprecated function calls—it is about redrawing the line between host responsibilities and plugin responsibilities**.

---

## V1: Config Hooks, the Filesystem, and a Monolithic Runtime

In V1, a plugin was a server function that returned `config` and `event` hooks:

```typescript
export const ModelDiscoveryPlugin: Plugin = async (input, options) => {
  return {
    config: async (config) => {
      // discover models and update config.provider
    },
    event: async (event) => {
      // handle runtime events
    },
  }
}
```

The typical execution flow looked like this:

```text
OpenCode starts
  ↓
config hook runs
  ↓
Read provider.<id>.options
  ↓
Read auth store and local plugin cache
  ↓
Request /v1/models
  ↓
Mutate config.provider.<id>.models directly
```

While straightforward, this model forced the plugin to handle far too many host-level concerns:

- Understanding and tightly coupling to internal V1 configuration schema nuances;
- Locating and deserializing host-managed credentials on disk;
- Implementing custom XDG-compliant caching, atomic writes, and TTL logic;
- Mutating global startup configuration in place;
- Registering ad-hoc config-injected commands;
- Bundling discovery, state, and terminal interaction into a single monolithic runtime.

---

## V2: Driven by the Provider Registry

OpenCode V2 plugins use `Plugin.define({ id, setup })` and interact with the host through an injected context:

```typescript
export default Plugin.define({
  id: "opencode.models-discovery",
  setup: setupV2,
})
```

The execution flow shifts to a declarative cycle:

```text
setup
  ↓
ctx.provider.list()
  ↓
Register replayable provider transforms
  ↓
refresh: query, filter, and enrich models
  ↓
Replace in-memory inventory
  ↓
ctx.provider.reload()
  ↓
Host replays transforms and updates the Provider Registry
```

V2 forbids mutating user config files directly, and long-running network calls should never live inside transform callbacks. Network requests, authentication, and caching belong strictly in the `refresh` phase; the `transform` callback is a pure projection mapping the latest inventory onto the host's provider drafts.

---

## Single Combined Entrypoint, Two Distinct Adapters

To maintain backward compatibility without fragmenting the package ecosystem, we avoided publishing separate npm packages. Instead, a single combined entrypoint serves both host generations seamlessly:

```text
OpenCode V1 -> default.server(input, options)
OpenCode V2 -> default.id + default.setup(ctx)
```

Internally, code separation remains strict and clean:

- `src/core/`: Host-agnostic discovery pipelines, name filters, model enrichment, and caching policies;
- `src/v2/`: Primary OpenCode V2 adapter (Provider Transforms, Host Storage, Integration API, TUI/RPC);
- `src/plugin/`: Legacy OpenCode V1 adapter (Config Hook, XDG filesystem state, legacy commands);
- `src/runtime.ts`: Bundles both adapters into a single exported surface at `dist/runtime.js`.

When running in OpenCode V1, the plugin logs an explicit warning indicating the legacy adapter is active. All new capabilities, storage primitives, and user-facing experiences are built natively for V2.

---

## Architectural Comparison: V1 vs. V2

| Dimension | OpenCode V1 | OpenCode V2 |
|---|---|---|
| **Role** | Legacy support adapter | Primary stable implementation |
| **Config Retrieval** | Plugin options and `config` hook | `ctx.provider.list()` |
| **Provider Settings** | `provider.<id>.options` | `providers.<id>.settings` |
| **Model Injection** | Direct in-place config mutation | Declarative `ctx.provider.transform()` |
| **User Overrides** | Mixed into local XDG state | Isolated Host Storage `overrides:<id>:<model>` |
| **Applying Changes** | Rebuilding global configuration | Inventory swap + `provider.reload()` |
| **Authentication** | `apiKey`, resolved provider, `auth.json` fallback | `ctx.integration.connection` |
| **Caching** | Private JSON files under XDG directories | Host-managed `ctx.storage` |
| **Commands** | Config-injected command objects | Native TUI Keymap commands |
| **Process Model** | Monolithic server plugin | Server Plugin + TUI Plugin |
| **Communication** | Intra-process state or raw session events | Strongly typed Server/TUI RPC |

---

## Three Fundamental Boundary Shifts

### 1. The Credential Boundary

- **V1**: The plugin had to locate credentials on the filesystem and understand their layout.
- **V2**: The host retains complete ownership of credentials; plugins safely consume credentials exposed through `ctx.integration`.

### 2. The Persistence Boundary

- **V1**: The plugin managed filesystem paths, directory creation, atomic writes, and TTL enforcement.
- **V2**: The host provides a managed persistence backend via `ctx.storage`; plugins only manage cache keys, identities, and invalidation semantics.

### 3. The Process Boundary

- **V1**: Background logic, configuration hooks, and terminal UI output shared a single runtime.
- **V2**: **The TUI and Server run in distinct contexts**:
  - **TUI**: Owns keymap shortcuts, input dialogs, status toasts, and the RPC client;
  - **Server**: Owns discovery cycles, integration auth, cache persistence, Provider Registry updates, and the RPC handler.

---

## Anatomy of a Complete Refresh Cycle

Once the V2 architecture settled, a model refresh followed a strict unidirectional pipeline with layered failure domains:

```text
User executes /models-discovery-refresh
  ↓
Triggered by TUI Keymap command
  ↓
RPC calls refresh({ force })
  ↓
Server runs refreshFromCurrentConfig()
  ↓
Integration API resolves credentials securely
  ↓
ctx.storage reads or writes discovery cache
  ↓
Query provider /v1/models (preserve previous inventory on network error)
  ↓
Read persistent overrides from ctx.storage (overrides:<providerID>:<modelID>)
  ↓
Merge user overrides and atomically swap in-memory inventory
  ↓
Invoke provider.transform and execute provider.reload()
  ↓
RPC returns summary payload
  ↓
TUI Toast displays feedback
```

The core advantage of this structure is security and resilience: **user interaction layers never touch raw credentials, storage files, or the Registry directly**; and when upstream networks drop temporarily, retaining `previousInventory` ensures that a transient network hiccup does not wipe out currently available models.

---

## Model Overrides with Hot Reload (Zero-restart Loop)

Beyond automated discovery, the V2 architecture establishes a real-time override pipeline:

```text
User modifies a model in /models-discovery-console (e.g. adjust limits or enable reasoning)
  ↓
TUI sends RPC overrideSet({ providerID, modelID, patch })
  ↓
Server validates patch payload (rejects any sensitive credential keys)
  ↓
Server persists to ctx.storage ("overrides:<providerID>:<modelID>")
  ↓
Apply patch to in-memory inventory and call ctx.provider.reload()
  ↓
Host replays provider.transform, updating active Provider Registry
  ↓
TUI fetches refreshed state in place (overridden models flagged with *)
```

Developers can fine-tune context windows or enable reasoning capabilities **without ever restarting the OpenCode daemon or restarting their active terminal session**.

---

## Evolution Timeline: How the Architecture Formed

Looking back at the version history, the architecture matured across six clear stages:

1. **v1.6: Initial V2 Exploration**. Built the first V2 Provider Discovery prototype and used a combined entrypoint to allow seamless co-existence across V1 and V2.
2. **v1.7: Lifecycle Stability**. Addressed config reloads, prevented duplicate transform registrations, and handled lifecycle hooks and cleanup reliably.
3. **v1.8: Shared Core Abstraction**. Refactored domain logic so both V1 and V2 adapters share the exact same model filtering, naming, and enrichment rules.
4. **v1.9: Host Storage Integration**. Migrated private XDG caches to `ctx.storage`, decoupling persistence mechanisms from business logic.
5. **v1.10: Integration, RPC, and Native TUI**. Connected credential-free authentication via the Integration API and established typed RPC contracts for TUI refresh commands and the interactive Discovery Console.
6. **v2.0.0-rc.1: Stable V2 Baseline and V1 Maintenance Mode**. Formally promoted V2 to the primary implementation while freezing V1 in legacy mode; added persistent model overrides, offline resilience, and dual-version isolation testing.

---

## Conclusion: What Should a Plugin Actually Own?

In V1, plugins were designed to do everything themselves: hunt for credentials, write local caches, mutate host config arrays, and render arbitrary terminal outputs.

The V2 architecture establishes a clear separation of concerns:

- **The Host owns infrastructure**: Credential lifecycle, storage backends, the Provider Registry, and inter-process RPC communication;
- **The Plugin owns its domain**: Which models to discover, how to filter them, and how to enrich their metadata;
- **The TUI owns the experience**: Turning complex background capabilities into intuitive, ergonomic terminal interactions.

This is the central takeaway when transitioning to OpenCode V2: **do not just translate APIs line by line—first decide which side of the boundary each responsibility belongs to.**

---

## Project & Release Resources

The complete architecture and implementation covered in this article are open source and deployed in production:

- **GitHub Release**: [`opencode-models-discovery v2.0.0-rc.1`](https://github.com/yuhp/opencode-models-discovery/releases/tag/v2.0.0-rc.1) (Detailed release notes, source archives, and architecture evolution logs)
- **npm Package**: [`opencode-models-discovery@2.0.0-rc.1`](https://www.npmjs.com/package/opencode-models-discovery/v/2.0.0-rc.1) (Dual-version package supporting seamless distribution across OpenCode V1 and V2)

