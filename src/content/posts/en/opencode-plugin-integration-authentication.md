---
title: "Who Owns Plugin Credentials in OpenCode? From Auth-File Sniffing to the Integration API"
description: "The first critical boundary shift from OpenCode plugins V1 to V2: who owns the credentials? This article dives into the transition from sniffing XDG auth.json credential files and environment variables in V1 to leveraging the declarative Integration Connection API, isolated secret lifecycles, and strict override guards in V2."
publishedAt: 2026-10-15T10:00:00+08:00
lang: en
tags:
  - OpenCode
  - Security Architecture
  - Credential Management
  - Plugins
  - TypeScript
cover:
  src: /images/posts/opencode-plugin-integration-authentication/cover.png
  thumbnail: /images/posts/opencode-plugin-integration-authentication/cover-thumb.png
  alt: Diagram showing the evolution of OpenCode plugin credential flow from reading plaintext files in V1 to consuming credentials via the Integration API with strict sanitization in V2.
translationSlug: opencode-plugin-integration-authentication
---

> **Overview**: This is the first deep-dive in the series *OpenCode Plugins V1 to V2: Architecture Evolution*. When refactoring plugin architectures, few changes are as sensitive and vital as **reassigning ownership of security credentials**. In V1, plugins assumed monolithic responsibility for locating, reading, and parsing host authentication files. In V2, the host encapsulates credential lifecycles completely via its Integration system. Using the real-world evolution of the `opencode-models-discovery` plugin, this article explores the shift from hardcoded file reading to the Integration API, complete with defensive sanitization to prevent secrets from leaking into persistence layers.

---

## From Auth-File Sniffing to the Integration API

At first glance, a model discovery plugin only needs to fetch an API key and query an upstream `/v1/models` endpoint. Beneath the surface, however, how credentials are handled marks a fundamental boundary shift between the two generations of OpenCode:

The Integration authentication architecture described here debuted in `v1.10.0` and became the only supported, primary credential path in `v2.0.0-rc.1`.

---

## V1: Plugins Hunting for Credentials

In OpenCode V1, plugins took it upon themselves to locate provider API keys, maintaining an ad-hoc resolution chain:

```text
provider.<id>.options.apiKey
  ↓
OpenCode resolved provider
  ↓
OPENCODE_AUTH_CONTENT
  ↓
$XDG_DATA_HOME/opencode/auth.json
```

In practice, plugins had to construct filesystem paths based on XDG conventions and host process signatures:

```typescript
function getHostAuthFile(): string | undefined {
  if (!xdgData) return undefined

  const hostClient = detectHostClient()
  return path.join(xdgData, hostClient, "auth.json")
}
```

Then, the plugin read and parsed the JSON payload directly:

```typescript
const auths = JSON.parse(await fs.readFile(file, "utf8"))
return auths[providerName]
```

While pragmatic in early V1 days, this design leaked excessive host implementation details into the plugin layer:

- The exact physical directory where auth files were stored;
- Host filenames and serialization schemas;
- Client differentiation heuristics between OpenCode and Mimocode;
- Internal structures of credential stores;
- Fallback mechanics around environment variables like `OPENCODE_AUTH_CONTENT`.

---

## The Antipattern of Filesystem Dependency

Directly parsing host auth files is not just fragile—it fundamentally blurs the security trust boundary between host and plugin:

```text
Host is responsible for securing credentials
  VS
Plugin is responsible for guessing where credentials live
```

This antipattern produces real architectural problems:

1. **Host Refactoring Breaks Plugins**: If the host shifts to the OS keychain or an encrypted database, file-reading plugins silently fail;
2. **Maintenance Bloat**: Plugins must preserve legacy file parsers across multiple host tools and versions;
3. **Files Become Unofficial APIs**: Unversioned disk layouts turn into de-facto public contracts;
4. **Unnecessary Risk for Plugins**: Plugins take on complex file IO, permission handling, and secret parsing burdens;
5. **Process Synchronization Issues**: In decoupled Server/TUI architectures, independent processes might read and lock files concurrently.

---

## V2: Declarative Connections via the Integration API

The OpenCode team deserves significant credit for the credential architecture in V2. It completely abandons the fragile pattern of leaving plaintext `auth.json` files on disk, moving instead to internal, host-managed credential orchestration and encryption.

This redesign substantially elevates the baseline security of the host by preventing local plaintext keys from being accidentally exposed or scraped by third-party processes. More importantly, it equips the plugin ecosystem with an elegant, public, and strongly typed Integration Connection API:

```typescript
const connection = await ctx.integration.connection.active(integrationID)
const credential = connection
  ? await ctx.integration.connection.resolve(connection)
  : undefined
```

During initialization (`setup`), the plugin simply declares the required authentication schemes for its supported providers:

```typescript
await ctx.integration.transform((draft) => {
  draft.method.update({
    integrationID,
    method: { type: "key", label: "API key" },
  })
})
```

When discovering models, the plugin calls this public API to retrieve an active credential, **without touching any underlying files or host-managed storage systems**.

---

## Production Credential Resolution Pipeline

In production (`src/v2/credential-resolver.ts`), the V2 architecture follows a predictable and secure resolution chain:

1. Explicit user settings: `providers.<id>.settings.apiKey`;
2. Host pre-resolved provider keys: `provider.apiKey`;
3. Connections mapped by user-configured `integrationID`;
4. Default convention-based Integration IDs generated from Provider IDs;
5. Fallback connections named after the Provider ID itself;
6. Unauthenticated requests for local, unauthenticated runtimes (e.g. Ollama or LocalAI).

The resolver cleanly handles diverse connection types through typed schemas:

```typescript
if (credential?.type === "key") {
  return credential.key
}

if (credential?.type === "oauth") {
  return credential.access
}

if (connection.type === "env") {
  return process.env[connection.name]
}
```

---

## Compressing the Secret Lifecycle

The difference in secret lifecycles between the two generations is night and day:

### V1 Era (Extended Exposure Surface)
```text
Plugin locates disk file
  ↓
Reads full file from filesystem
  ↓
Parses global credential store in memory
  ↓
Extracts target provider key
  ↓
Retains secret in memory indefinitely
```

### V2 Era (Ephemeral, Just-in-Time Consumption)
```text
Host manages credential storage and security
  ↓
Plugin calls active() and resolve()
  ↓
Secret consumed strictly within discovery HTTP context
  ↓
Released immediately; secrets never persist in plugin memory
```

This is not a cosmetic syntax change—it restores ownership of storage, rotation, encryption, and lifecycle protection to the host where it belongs.

---

## Defining Strict Red Lines: Where Secrets Must Never Go

In V2, resolved secrets exist exclusively inside transient HTTP discovery requests and **are barred from entering persistence or presentation layers**:

### Strictly Prohibited for Secrets:
- ❌ **Host Storage** (both discovery cache and model overrides);
- ❌ **Provider Model Drafts** (definitions registered into the Provider Registry);
- ❌ **RPC Return Payloads** (inter-process data packets);
- ❌ **Status Summaries** (such as `models_discovery_status` CLI output);
- ❌ **TUI Components** (Dialogs, Toasts, Console views);
- ❌ **Log Files and Exception Traces**.

### Safe Model Metadata for the UI and Host Layers:
- ✅ Provider ID and Model ID
- ✅ Upstream API Model ID
- ✅ Context limits (token limits, window sizes)
- ✅ Capabilities (vision, tool calling, JSON schema)
- ✅ Variants and reasoning configurations

---

## Preventing Model Overrides from Becoming a Credential Backdoor

In `v2.0.0-rc.1`, persistent model overrides were introduced, allowing developers to tweak model limits directly from the TUI. However, this introduced a new attack vector: **preventing users or malicious inputs from persisting API keys or Authorization headers inside override objects**.

To safeguard the system, `src/v2/overrides.ts` enforces a defensive regex guard:

```typescript
const SENSITIVE_KEYS = /(?:api[_-]?key|authorization|headers?|token|password|secret|credential)/i
```

Any patch request—whether at root level or within nested `compatibility` blocks—that matches this pattern is immediately rejected with an explicit error:

```text
Error: Override field is not allowed: patch.apiKey
```

Furthermore, updates are restricted to an explicit property allowlist: `name`, `limit`, `capabilities`, `reasoning`, `attachment`, `cost`, `compatibility`, `variants`.

This guarantees that local discovery caches, remote results, and user overrides **remain 100% credential-free at all times**.

---

## Clean Isolation Between V1 and V2 Support

While supporting both generations from a single package, the V2 adapter maintains strict isolation from legacy fallbacks:

- No reading of V1 `auth.json` files;
- No reading of `OPENCODE_AUTH_CONTENT` environment variables;
- No inspection of private host databases.

This boundaries guarantee that while V1 and V2 co-exist in one package, their auth paths never cross. The only logic they share is domain-level: **how to issue a discovery HTTP call with an already-resolved key**, not **how to rummage through the host to find that key**.

---

## Conclusion: Hosts Own Credentials, Plugins Consume Them

The security architecture of OpenCode V2 represents a major step forward: **moving from raw plaintext files on disk to professional, host-managed credential orchestration** is not just an API refresh—it is a critical maturity milestone for the developer platform.

Modern plugin systems rely on clear boundaries of responsibility:

- **The Host**: Owns credential encryption, multi-tenancy, authentication flows, dynamic rotation, and secure disk storage;
- **The Plugin**: Declares required authentication types and consumes credentials ephemerally when communicating with remote endpoints.

When a plugin starts assembling filesystem paths or parsing private host config formats, it is no longer integrating—it is coupling to private implementation details. The credential model in OpenCode V2 sets a great precedent for CLI tools that seek both security and engineering elegance.

---

## Project & Release Resources

The credential management patterns and defensive guards described here are available in open source:

- **GitHub Release**: [`opencode-models-discovery v2.0.0-rc.1`](https://github.com/yuhp/opencode-models-discovery/releases/tag/v2.0.0-rc.1) (Complete Integration auth module and defensive override guards)
- **npm Package**: [`opencode-models-discovery@2.0.0-rc.1`](https://www.npmjs.com/package/opencode-models-discovery/v/2.0.0-rc.1) (Dual-version package supporting OpenCode V1 and V2)
