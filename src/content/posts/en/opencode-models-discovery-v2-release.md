---
title: "Announcing opencode-models-discovery v2.0.0"
description: "opencode-models-discovery v2.0.0 is officially released! This article serves as both a major release announcement and complete migration guide from V1 to V2, as well as the concluding overview for the 'OpenCode Plugins V1 to V2 Architecture Evolution' series. Explore native V2 support, credential management via Integration API, persistent state via Host Storage, Server/TUI RPC decoupling, and zero-restart console controls."
publishedAt: 2026-10-18T10:00:00+08:00
lang: en
tags:
  - OpenCode
  - Open Source
  - Software Architecture
  - Plugins
  - TypeScript
cover:
  src: /images/posts/opencode-models-discovery-v2-release/cover.png
  thumbnail: /images/posts/opencode-models-discovery-v2-release/cover-thumb.png
  alt: Visual overview of the opencode-models-discovery v2.0.0 release and its OpenCode V2 native architecture upgrade.
translationSlug: opencode-models-discovery-v2-release
---

> **Overview**: Following comprehensive architectural refactoring and rigorous release candidate testing, `opencode-models-discovery` **v2.0.0** is officially released! This milestone represents far more than a routine version bump; it is the culmination of our engineering journey documented across the *"OpenCode Plugins V1 to V2: Architecture Evolution"* series. This article serves both as the official release announcement and migration guide, as well as an indexed guide to the full architectural series.

---

## Redefining the Boundary Between Host and Plugin

OpenCode V2 introduces an entirely revised plugin runtime and fundamentally redraws the lines of responsibility between the host environment and third-party extensions.

Today, `opencode-models-discovery` v2.0.0 is officially released.

This is not merely an updated package version or a superficial API rename. For `opencode-models-discovery`, v2.0.0 represents a complete architectural overhaul centering on **credentials**, **state management**, and **interaction boundaries**:

- **OpenCode V2 becomes the primary, first-class target**, fully leveraging modern host capabilities;
- **OpenCode V1 is retained through a clean, isolated Legacy adapter**, providing seamless backward compatibility;
- **Credential management is delegated entirely to the OpenCode V2 Integration module**, eliminating plaintext `auth.json` inspection;
- **Cache entries and user model overrides are persisted within native Host Storage**, retiring manual XDG directory manipulation;
- **The Server backend isolates business state while the TUI communicates via strongly typed RPC**, preventing UI commands from polluting Agent contexts;
- **Model discovery, live refresh, caching, and overrides form an end-to-end reactive loop** with zero host restarts required;
- **Configuration updates, credential changes, and Integration switches trigger automatic re-discovery**.

---

## 1. What Is `opencode-models-discovery`?

`opencode-models-discovery` is an OpenCode plugin designed for OpenAI-compatible providers and gateways.

It dynamically inspects upstream model endpoints, retrieves available models, standardizes their payloads, and registers them into OpenCode's Provider Registry. In addition to simple model identifiers, the plugin enriches each entry with human-readable titles, context window limits, maximum completion tokens, reasoning/thinking capabilities, tool-calling flags, and other rich metadata based on remote schemas and local rules.

It is particularly well-suited for:

- **OpenAI-compatible API gateways** (such as One API, New API, and custom enterprise proxies);
- **Local inference backends** (such as vLLM, SGLang, Ollama, and LM Studio);
- **Custom model routers and aggregators**;
- **Unified providers exposing dynamic sets of diverse models**;
- **Development and benchmarking setups requiring rapid model list updates**.

In v2.0.0, model discovery evolves from a static, one-time bootstrap hook into a dynamic, event-driven capability deeply integrated with the OpenCode V2 Provider Registry.

---

## 2. Key Features and Architectural Upgrades in v2.0.0

### 1. OpenCode V2 as the First-Class Target

`opencode-models-discovery` v2.0.0 treats OpenCode V2 as its primary development baseline, adopting native V2 contracts across all subsystems:

- The declarative `plugins` / `providers` configuration structure;
- The Provider Registry and Provider Transform pipeline;
- Integration-driven credential resolution;
- Host Storage isolation and transactional persistence;
- Native TUI keymaps, commands, and interactive views;
- Strongly typed Server-to-TUI RPC communication;
- Native Agent Tools for automated agentic workflows.

Concurrently, **the OpenCode V1 adapter remains fully packaged and supported**. Users running on OpenCode V1 can upgrade the npm package without breaking existing workflows.

---

### 2. Delegating Credential Ownership to the Integration API

In legacy plugin models, extensions were often forced to act as credential sniffers: parsing configuration objects, resolving environment variables, or even constructing filesystem paths to inspect the host's `auth.json`. This coupled the plugin tightly to internal host implementation details, creating security risks and upgrade fragility.

In OpenCode V2, `opencode-models-discovery` delegates authentication completely to the host's `Integration API`:

```text
Host manages connections and active credentials
        ↓
Plugin retrieves current valid credential via ctx.integrations
        ↓
Credentials used transiently for upstream discovery HTTP calls
        ↓
Secrets never leak into disk caches, model lists, RPC payloads, or logs
```

Users can connect to providers using the native interactive `/connect` command without embedding secrets into `opencode.json`:

```text
/connect
```

When credentials are created, rotated, or switched, the plugin subscribes to host lifecycle events and refreshes the model registry silently without requiring a service restart.

---

### 3. Unified State Persistence via Host Storage

Previously, plugins managed their own disk caches, handling directory creation, concurrency locks, JSON corruption recovery, and custom TTL expirations.

OpenCode V2 provides a dedicated host-level storage primitive through `ctx.storage`. Rather than worrying about raw disk I/O, the plugin focuses purely on data semantics and lifecycles:

```text
discovery cache
  → Ephemeral mirror of upstream models
  → Short-lived, managed by TTL, safe for automatic eviction

model override
  → User-customized metadata (context size, reasoning flags, aliases)
  → Long-lived, namespace-isolated, preserved across cache purges
```

Model overrides reside in an isolated storage namespace:
```text
overrides:<providerID>:<modelID>
```

When an override is saved via the console, it persists permanently. Clearing a provider's discovery cache will never wipe out carefully tailored model overrides. Furthermore, the storage layer enforces strict sanitization, preventing API keys, auth tokens, or custom headers from ever touching disk.

---

### 4. Reactive Configuration and Credential Lifecycle Hooks

OpenCode V2 continuously monitors `opencode.json` and `opencode.jsonc`, emitting `config.updated` events upon changes. The plugin captures these events, reconciles provider settings in memory, and triggers registry updates instantly.

Additionally, the plugin natively tracks authentication lifecycle events:
- `credential.updated`: Secret content or attributes were modified;
- `credential.switched`: The active credential was switched between accounts;
- `integration.updated`: Provider connection endpoints or parameters changed.

If an upstream provider experiences a temporary outage or network glitch during a refresh, the plugin employs a **last-known-good inventory fallback**. This ensures active sessions never lose their working models due to a transient failure.

---

### 5. Native TUI Console, RPC Layer, and Agent Tools

v2.0.0 offers distinct interaction interfaces tailored for both human developers and autonomous agents:

```text
Developer Controls (Native TUI Commands):
/models-discovery-refresh
/models-discovery-console

Agent Automation (Agent Tools):
models_discovery_refresh
models_discovery_status
```

The interactive `/models-discovery-console` provides:
- Provider status and discovered model inspection;
- Granular capability and limit previews (Context, Max Output, Thinking, Tools);
- On-demand incremental and full cache invalidation;
- Cache clearing scoped to individual providers or across all entries;
- **In-terminal model override editing with live reloading and zero host restarts**.

---

## 3. Getting Started

### 1. Installation and Basic OpenCode V2 Configuration

Declare the plugin and target provider in your workspace or global `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    "opencode-models-discovery@2.0.0"
  ],
  "providers": {
    "gateway": {
      "name": "Gateway",
      "package": "@opencode/ai/providers/openai-compatible",
      "settings": {
        "baseURL": "https://gateway.example.com/v1",
        "modelsDiscovery": {
          "enabled": true,
          "modelInfoFormat": "models.dev",
          "cache": {
            "enabled": true,
            "ttlSeconds": 86400
          }
        }
      }
    }
  }
}
```

The default discovery endpoint is `/v1/models`. For custom gateways or unique route structures, specify `endpoint` explicitly:

```json
{
  "modelsDiscovery": {
    "enabled": true,
    "endpoint": "/custom/api/models"
  }
}
```

### 2. Managing Credentials with `/connect`

We strongly recommend managing secrets via the OpenCode V2 native flow:

1. Omit plain `apiKey` strings from your `settings`;
2. Execute `/connect` inside your terminal;
3. Select your provider and input your secret key;
4. The plugin automatically detects the new integration and initiates discovery.

Alternatively, environment variable interpolation remains fully supported for automated deployments:

```json
{
  "settings": {
    "baseURL": "https://gateway.example.com/v1",
    "apiKey": "{env:GATEWAY_API_KEY}"
  }
}
```

---

## 4. Migrating from OpenCode V1 to V2

For existing installations, here is a breakdown of how key configuration paradigms translate:

| Feature Dimension | OpenCode V1 (Legacy) | OpenCode V2 (Native) |
|---|---|---|
| **Plugin List** | `plugin: []` | `plugins: []` |
| **Provider Map** | `provider: {}` | `providers: {}` |
| **Provider Package** | `provider.<id>.npm` | `providers.<id>.package` |
| **Configuration Key** | `provider.<id>.options` | `providers.<id>.settings` |
| **Discovery Options** | `options.modelsDiscovery` | `settings.modelsDiscovery` |
| **State Persistence** | Custom XDG filesystem management | Native `ctx.storage` |
| **Credential Source** | Plaintext `auth.json` inspection | Integration API / `/connect` |
| **Data Flow** | Imperative config Hook overrides | Provider Registry & Transform pipeline |
| **Console & Interaction** | Synthetic session messages / blocking cmds | Native TUI Keymaps & typed RPC |

### Migration Notes

1. In V2, `modelsDiscovery.enabled` must be explicitly declared as `true`;
2. Legacy XDG filesystem caches are not migrated to V2; Host Storage will automatically re-populate clean caches on first launch;
3. OpenCode `2.0.26` or later is recommended to ensure complete TUI RPC and Storage reliability.

---

## 5. Architectural Deep-Dives: The Complete Series

The v2.0.0 redesign represents an extensive exploration into OpenCode V2's internal architecture. If you are interested in the engineering rationale, hard-learned lessons, and technical implementation details, explore the complete series on our blog:

1. **[Prelude · How Do OpenCode Plugins Actually Load? Runtime Anatomy and Debugging Guide](/en/posts/opencode2-plugin-loading/)**  
   *Tracing the lifecycle from module resolution and dynamic import to host execution, complete with an environmental troubleshooting checklist.*

2. **[Overview · From Config Hooks to Server/TUI: The Architectural Evolution of OpenCode Plugins](/en/posts/opencode-plugin-v1-v2-architecture/)**  
   *A high-altitude map of the three tectonic shifts between V1 and V2: config hooks, credential boundaries, and interaction paradigms.*

3. **[Deep-Dive 1 · Who Owns Plugin Credentials in OpenCode? From Auth-File Sniffing to the Integration API](/en/posts/opencode-plugin-integration-authentication/)**  
   *Why extensions should never touch `auth.json` on disk, and how to harness V2 Integration APIs for leak-proof secret resolution.*

4. **[Deep-Dive 2 · Where Should Plugin State Live in OpenCode? From XDG File Caching to Host Storage](/en/posts/opencode-plugin-storage-evolution/)**  
   *Retiring ad-hoc file locking and directory management in favor of Host Storage, isolating short-lived discovery caches from durable model overrides.*

5. **[Deep-Dive 3 · How to Build Modern OpenCode Plugin UIs: Decoupling Server and TUI via the V2 RPC Architecture](/en/posts/opencode-plugin-rpc-tui-separation/)**  
   *Why a simple "refresh models" command must never trigger an LLM conversation turn. A step-by-step review of typed RPC contracts and real-time TUI consoles.*

---

## 6. Closing Thoughts & Resources

The mission of `opencode-models-discovery` v2.0.0 extends beyond merely keeping a plugin operational on a new platform. It is an exploration of what robust, enterprise-ready extensions should look like across modern CLI AI tooling.

With credentials protected by the host, state safely persisted, and user interfaces cleanly decoupled through typed RPC, the plugin sheds infrastructure overhead and focuses on its primary mission: intelligent model discovery and metadata enhancement.

- **GitHub Repository**: [https://github.com/yuhp/opencode-models-discovery](https://github.com/yuhp/opencode-models-discovery)
- **npm Package**: [https://www.npmjs.com/package/opencode-models-discovery](https://www.npmjs.com/package/opencode-models-discovery)

We invite everyone in the OpenCode community to test v2.0.0! Feedback, issues, and pull requests are warmly welcomed on GitHub.
