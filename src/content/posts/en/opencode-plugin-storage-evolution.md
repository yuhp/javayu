---
title: "Where Should Plugin State Live in OpenCode? From XDG File Caching to Host Storage"
description: "The second critical boundary shift from OpenCode plugins V1 to V2: where should persistent plugin state actually live? This article explores how plugins moved from managing XDG directories, JSON serialization, and atomic renames in V1 to leveraging host-managed Storage abstractions, business-defined caching policies, and dual-lifecycle isolation in V2."
publishedAt: 2026-10-15T16:00:00+08:00
lang: en
tags:
  - OpenCode
  - Software Architecture
  - Storage Design
  - Plugins
  - TypeScript
cover:
  src: /images/posts/opencode-plugin-storage-evolution/cover.png
  thumbnail: /images/posts/opencode-plugin-storage-evolution/cover-thumb.png
  alt: Diagram showing the evolution of OpenCode plugin state management from V1 local XDG filesystem caches to V2 unified Host Storage abstractions and lifecycle isolation.
translationSlug: opencode-plugin-storage-evolution
---

> **Overview**: This is the second deep-dive in the series *OpenCode Plugins V1 to V2: Architecture Evolution*. Following our exploration of credential boundaries, another critical architectural question arises: **where should persistent plugin state actually live?** In V1, plugins were forced to act as mini storage engines, computing paths, managing filesystem permissions, and ensuring write atomicity manually. In V2, the host encapsulates persistent storage through `ctx.storage`. Using the `opencode-models-discovery` plugin as a case study, this article examines the journey from XDG files to Host Storage, and how to cleanly isolate transient discovery caches from persistent model overrides.

---

## From XDG File Caching to Host Storage

Early in a model discovery plugin's lifecycle, caching responses from upstream `/v1/models` endpoints locally is essential to avoid repetitive network overhead. Between OpenCode V1 and V2, however, the fundamental assignment of storage responsibilities was completely inverted:

The V2 Host Storage mechanism described here debuted in `v1.9.0`, while persistent model overrides and strict isolation regression suites reached general stability in `v2.0.0-rc.1`.

---

## V1: Plugins Acting as Mini Storage Engines

In OpenCode V1, plugins stored discovery caches directly in the operating system's XDG data directory, typically at:

```text
$XDG_DATA_HOME/opencode-models-discovery/providers/
  provider-<encoded-provider-id>.json
```

This forced the plugin to take on low-level storage engine responsibilities:

- Computing filesystem directories across various OS conventions;
- Recursively creating `providers` folders and managing file permissions;
- Reading and deserializing JSON files manually;
- Validating schema versions and provider identity matches;
- Evaluating TTL freshness timestamps;
- Writing to temporary files and executing atomic renames to avoid corruption;
- Catching filesystem errors and cleaning up orphaned temp files.

A typical write path looked like this:

```typescript
await fs.mkdir(path.dirname(statePath), { recursive: true, mode: 0o700 })
await fs.writeFile(temporaryPath, JSON.stringify(state, null, 2), {
  encoding: "utf8",
  mode: 0o600,
})
await fs.rename(temporaryPath, statePath)
```

While functional early on, this pattern forced an application-level plugin to build and maintain its own fragile file-based storage subsystem.

---

## State Bundling: The Pitfall of Monolithic Files

In V1, each provider's persisted state file bundled multiple heterogeneous concerns together:

```typescript
{
  version,
  provider,
  fetchedAt,
  models,
  rawModels,
  overrides,
}
```

This monolithic structure mixed data with **fundamentally different lifecycles**:

- **Raw upstream discovery models** (ephemeral network snapshots);
- **Filtered and enriched models** (derived state subject to business rule changes);
- **User-configured model overrides** (high-value, persistent user customizations);
- **Provider endpoint and identity metadata**.

Model discovery caches are transient, TTL-driven, and safe to wipe at any time. In contrast, user overrides are durable configuration assets that must never be discarded during a cache refresh. Bundling these opposing lifecycles into a single file made schema migrations, partial updates, and cache invalidation unnecessarily perilous.

---

## V2: The Host Provides Storage, the Plugin Defines Policies

The OpenCode team deserves praise for the storage architecture in V2. Instead of outsourcing persistence burdens to plugin authors, the host core provides a robust, managed, and replaceable key-value storage service via `ctx.storage`:

```typescript
ctx.storage.get(key)
ctx.storage.set(key, value)
ctx.storage.remove(key)
```

On the plugin side, we need only a thin, decoupled adapter to wire host storage into our shared caching engine:

```typescript
export function createV2StorageCache(storage) {
  return {
    get: storage.get,
    set: storage.set,
    remove: storage.remove,
  }
}
```

This lightweight adapter **does not need to know**:

- Where data is physically stored on disk or in memory;
- Whether the underlying driver is SQLite, an encrypted store, or flat files;
- How the host handles atomic writes, thread safety, or process locks;
- How storage quotas or multi-plugin isolation boundaries are enforced.

It simply projects the host's raw storage primitives into clean `get/set/remove` operations.

---

## Decoupling the Backend from Caching Policies

A cornerstone of the V2 refactor was **strictly separating the storage backend from the caching policy**:

```text
src/v2/storage-cache.ts
  → Minimal adapter around host-provided Storage

src/core/discovery-cache.ts
  → Domain logic: Key generation, Identity comparison, TTL rules, and sanitization
```

Key policy concerns remained inside the plugin domain:

### 1. Isolated Namespacing
```typescript
export function discoveryCacheKey(namespace: string, providerID: string): string {
  return `${namespace}:provider:${encodeURIComponent(providerID)}`
}
```
V2 uses explicit, dedicated key prefixes to eliminate key collisions across plugins or with legacy V1 state.

### 2. Provider Identity Verification
Caches are never retrieved purely on `providerID`. They are verified against a composite identity signature:
- Provider ID
- Base URL
- Models endpoint
- Model info format and metadata endpoint

If a user modifies an endpoint or configures custom enrichment flags, old cache entries fail identity validation immediately, preventing stale configurations from surfacing.

### 3. Plugin-Owned TTL Rules
```typescript
isDiscoveryCacheFresh(fetchedAt, ttlSeconds)
```
Cache validity is a business concern governed by domain logic, rather than hardcoded into storage drivers or UI elements.

### 4. Recursive Secret Sanitization
Before any state reaches storage, all payloads pass through defensive sanitization:
```typescript
if (/^(api[-_]?key|authorization|token|password|secret|credentials?)$/i.test(key)) {
  continue
}
```
Even if upstream provider payloads inadvertently return authentication secrets or bearer tokens, they are scrubbed before hitting persistent storage.

---

## Resilient Execution Pipeline

In V2, the discovery cache cycle operates with layered failure boundaries:

```text
refresh triggered
  ↓
Compute deterministic cache key from Provider Identity
  ↓
Call ctx.storage.get()
  ↓
[Cache is fresh]: Reuse cached rawModels and enrichment data
[Cache is expired]: Request upstream Provider models
[force=true flag]: Bypass cache and fetch remote models directly
  ↓
Execute shared discovery pipeline (filter & enrich)
  ↓
Persist results via ctx.storage.set()
  ↓
Atomically update in-memory inventory
```

**Key Architectural Rule**: Storage read or write failures must never abort model discovery. Storage is an optimization and an offline resiliency net, not an absolute single point of failure.

---

## Cross-Process Control via Server RPC

In modern decoupled architectures, all storage access is centralized behind server boundaries:

```text
TUI Frontend
  ↓ (Typed RPC: cacheInspect / cacheClear)
Server Backend
  ↓
ctx.storage
```

The terminal interface does not touch `ctx.storage` directly. Inspection (`cacheInspect`) and invalidation (`cacheClear`) requests flow through typed RPC contracts, ensuring that invalidation logic and concurrency safety remain encapsulated on the server.

---

## Dual-Lifecycle Architecture: Isolating Caches from Overrides

In `v2.0.0-rc.1`, persistent model overrides were introduced natively on top of Host Storage, enforcing a **dual-lifecycle separation**:

```text
opencode.models-discovery.v2:provider:<id>
  → Remote discovery snapshots: Short lifecycle, safely expirable, ephemeral

overrides:<providerID>:<modelID>
  → User-configured customizations: Long lifecycle, structured, immune to cache flushes
```

### 1. Versioned Record Schemas
Each user override is stored as an independent, versioned record:

```typescript
export interface StoredModelOverride {
  readonly version: 1
  readonly providerID: string
  readonly modelID: string
  readonly patch: Record<string, unknown>
  readonly enabled: boolean
  readonly updatedAt: string
}
```

Using clear key prefixes (`overrides:<providerID>:<modelID>`), the server can query subsets cleanly via `storage.scan({ prefix })`.

### 2. Invalidation Isolation: Cache Clears Never Touch Overrides
Users frequently clear cache entries when testing network endpoints. In our implementation, `cacheClear` operations scan exclusively for keys prefixed with `opencode.models-discovery.v2:provider:`. Overrides live in a distinct prefix space and are untouched. Automated regression tests (`test/v2/cache-rpc.test.ts`) assert this invariant continuously: **clearing discovery caches never deletes user overrides**.

### 3. Defensive Validation Allowlist
Overrides persisted to Host Storage are strictly validated:
- Allowed properties are limited to: `name`, `limit`, `capabilities`, `reasoning`, `attachment`, `cost`, `compatibility`, `variants`;
- Context token bounds (`limit.context`, `limit.output`) must be positive integers;
- Security keys (API keys, authorization headers) are strictly blocked;
- Corrupted or invalid stored records are safely skipped during load cycles.

---

## Complete Physical Isolation from Legacy V1 Storage

The data formats of V1 filesystem caches and V2 Host Storage are intentionally incompatible:

```text
V1: Provider state + models + rawModels + overrides (monolithic JSON under XDG)
V2: Distinct discovery caches and overrides:<providerID>:<modelID> (managed by Host Storage)
```

In `v2.0.0-rc.1`, `test/v1-v2-isolation.test.ts` verifies strict boundaries:
1. **Namespace and Path Isolation**: V2 caches operate under managed storage keys, while V1 uses private XDG directories; neither reads the other.
2. **Schema Incompatibility Protection**: V1 stores cannot misinterpret V2 `overrides:*` records as legacy state files.

By avoiding fragile runtime migration bridges between V1 files and V2 storage, both implementations remain lean, robust, and completely isolated.

---

## Conclusion: Storage Backends Belong to the Host, Caching Policies Belong to the Plugin

A well-designed plugin ecosystem relies on clear separation of state concerns:

- **The Host**: Owns storage infrastructure, physical persistence, concurrency safety, and storage backends;
- **The Plugin**: Owns business logic, cache invalidation rules, identity schemas, and sensitive field sanitization;
- **State Segregation**: Ephemeral caches and durable user configurations must be cleanly decoupled across distinct lifecycles.

In V1, the design focus was limited to *"where should I write my files?"* In V2, the architectural question becomes *"who owns this state, and what is its true lifecycle?"* Answering that question properly is the key to building durable, production-grade plugins.

---

## Project & Release Resources

The Host Storage adapters, lifecycle isolation pipelines, and override validation logic discussed here are available in open source:

- **GitHub Release**: [`opencode-models-discovery v2.0.0-rc.1`](https://github.com/yuhp/opencode-models-discovery/releases/tag/v2.0.0-rc.1) (Complete Host Storage adapters, dual-lifecycle isolation, and test suites)
- **npm Package**: [`opencode-models-discovery@2.0.0-rc.1`](https://www.npmjs.com/package/opencode-models-discovery/v/2.0.0-rc.1) (Dual-version package supporting OpenCode V1 and V2)
