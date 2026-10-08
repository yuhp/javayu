---
title: "Inside OpenCode V1/V2 Plugin Loading: One Package for Two Versions and Local Debugging"
description: "OpenCode V1 and V2 use fundamentally different plugin mechanisms, and their plugin definitions are not interchangeable. However, the official migration guide provides a dual-version plugin pattern: by exposing separate V1 and V2 entry points, one npm package can support both versions. This article explains the differences between local directories, npm packages, and server entry points through concrete examples, then presents a packaging strategy for dual-version plugins."
publishedAt: 2026-10-08
lang: en
tags:
  - OpenCode
  - Plugin development
  - TypeScript
  - Open source
cover:
  src: /images/posts/opencode2-plugin-loading/cover.png
  thumbnail: /images/posts/opencode2-plugin-loading/cover-thumb.png
  alt: Diagram showing OpenCode V1 and OpenCode V2 loading the same dual-version plugin through different entry points.
translationSlug: opencode2-plugin-loading
---

> **Overview:** With the formal release of OpenCode 2.0, the plugin ecosystem has made a major generational shift from the V1 Hooks architecture to the V2 Plugin SDK / Transforms architecture. To provide a smooth transition for existing and new users, building a dual-mode plugin that supports both V1 and V2 has become an important option for plugin developers. However, when we followed the official OpenCode documentation to write dual-version code, local debugging still produced strange issues such as failed loading and silent skips. Based on the official TypeScript source in the OpenCode v2.0.15 codebase, this article explains the internal loading and discovery algorithms, reconstructs the differences between npm packages and local development, and presents a practical guide to packaging and debugging dual-version plugins.

If you are building an OpenCode plugin and want one npm package to support both OpenCode V1 and OpenCode V2, the easiest part to misunderstand is often not the business logic. It is whether the host can find the correct entry point at all.

OpenCode V2 introduces a new Plugin SDK and the setup/effect model. To remain compatible with older versions, a plugin can expose the V2 definition and the V1 server function from the same default export. The important shape is a default export containing a string id, setup or effect, and the server function expected by the older host.

The object itself is fine. But if OpenCode never finds the file, none of its id, setup, or server fields will get a chance to run.

This article is based on the OpenCode v2.0.15 tag. Implementations may change across releases, so the final package should always be tested against the versions you intend to support.

## Three conclusions to remember

1. When configuring a local plugin through plugins in OpenCode V2, provide a directory, not dist/index.js itself. OpenCode V1 can reference a plugin file directly or point at the project root.
2. A local directory is primarily searched for server and index files inside that directory. A root package.json with main: ./dist/index.js does not automatically redirect the search into dist.
3. npm packages and local directories use different resolution paths. An npm package first tries its server subpath, so a dual-version package should explicitly export both the package root and ./server.

The directory requirement described here is specific to OpenCode V2 local loading. OpenCode V1 is closer to importing the module selected by the user, so it can reference dist/index.js, dist/server.js, or a project root that resolves to a V1 server function. For OpenCode V2 local development, provide a plugin directory with a discoverable entry point.

## The official example looks clear, but behavior differs

The official [OpenCode V2 plugin migration guide](https://opencode.ai/v2/docs/build/plugins/migrate-v1/#support-v1-and-v2-from-one-package) shows the dual-version pattern: V2 uses Plugin.define, while V1 keeps a top-level server function.

```typescript
import { Plugin } from "@opencode/plugin"

export default {
  ...Plugin.define({
    id: "example",
    async setup(ctx) {
      await ctx.tool.hook("execute.before", () => {
        console.log("A tool is about to run (V2)")
      })
    },
  }),
  async server() {
    return {
      "tool.execute.before": async () => {
        console.log("A tool is about to run (V1)")
      },
    }
  },
}
```

The migration guide's dual-version idea is straightforward: OpenCode V1 uses the default export's server function, OpenCode V2 uses id plus setup or effect, and both contracts live in one module.

The official [OpenCode V2 plugin configuration guide](https://opencode.ai/v2/docs/plugins/) also shows that the plugins configuration can contain package names, versions, local directories, local files, file URLs, and option objects:

    {
      "$schema": "https://opencode.ai/config.json",
      "plugins": [
        "opencode-acme-plugin",
        "opencode-acme-plugin@1.2.0",
        "@acme/opencode-plugin",
        "./plugins/local",
        "../shared/plugin.ts",
        "/absolute/path/plugin.ts",
        "file:///home/me/plugins/local",
        {
          "package": "@acme/opencode-plugin",
          "options": {
            "agent": "reviewer",
            "strict": true
          }
        }
      ]
    }

These examples describe the configuration forms allowed by the official documentation, but that does not mean every form works in the current OpenCode V2 implementation. Explicitly configuring a local single file is one of the documentation-versus-implementation differences examined later in this article. In practice, entry-point resolution happens before module validation and is often the reason a plugin appears to do nothing.

## Local OpenCode V2 Plugin Loading Problems

### Pointing directly to a JavaScript file: skipped

If an explicit plugins entry points to file:///path/to/project/dist/index.js, OpenCode V2 first checks whether the target is a file. If it is, the scanner records a warning and skips it:

    configured plugin path must be a directory

An explicit plugins entry in OpenCode V2 should therefore point to a directory, not a single .js file. The auto-discovery mechanism under .opencode/plugins/ can still discover a single .ts/.js file; these two sources use different scanning paths.

### Pointing at the project root: no error, no plugin

Imagine this project:

    my-plugin/
    ├── package.json       # main points to ./dist/index.js
    ├── src/
    └── dist/
        ├── index.js
        └── server.js

If the configuration points at the project root, the plugin may still not load. A local directory is primarily searched for:

    /path/to/my-plugin/server
    /path/to/my-plugin/index

The resolver does not treat the root as an npm package and automatically follow main into dist/index.js. Without a root server.js, server.ts, index.js, or index.ts, the search finds nothing.

### Pointing at the build directory: loads successfully

If the configuration points to file:///path/to/my-plugin/dist, OpenCode V2 can find dist/server.js or dist/index.js directly. This is why a child directory can work while the project root does not: the two configurations trigger different resolution rules.

## Why explicitly configured local plugins require directories

The directory rule is not only a path-validation detail. It is also related to V2's multi-surface plugin design. A complete V2 plugin directory may contain:

    index.ts   # main entry
    rpc.ts     # RPC extension
    tui.ts     # terminal UI extension

OpenCode needs the plugin directory as the root for discovering these sibling entry points. After PR #46105 (https://github.com/anomalyco/opencode/pull/46105) introduced Typed RPC and Custom Events, this directory layout became more important; PR #46898 (https://github.com/anomalyco/opencode/pull/46898) made rejection of non-directory configuration more visible.

The official implementation therefore keeps the rule that explicitly configured local plugins must be directories instead of treating a bare file as a complete V2 plugin. The official migration guide still contains local-file examples, however, which is why the documentation and current implementation can be confusing.

## V1 and V2 resolve local plugins differently

The two hosts do not use exactly the same local entry-point model:

| Local reference | OpenCode V1 | OpenCode V2 |
| --- | --- | --- |
| Project root | Usually works if the module resolves and provides a V1 server | Usually requires a discoverable root server or index |
| dist/index.js or dist/server.js | Can be loaded directly | Usually rejected during explicit plugins file validation |
| dist/ directory | Can be loaded | Recommended; entries are probed in server → index order |
| Default export | V1 server contract | String id plus setup/effect; V1 server() is not converted automatically |

These two configurations should therefore not be treated as equivalent:

    V1: plugin = file:///path/to/project/dist/server.js
    V2: plugins = [file:///path/to/project/dist]

The first is closer to importing a module file directly; the second gives a directory to V2's entry resolver. For V2 local development, pointing at the build directory is generally more reliable than pointing at a single file.

## Where Documentation and Implementation Diverge

As of OpenCode v2.0.24, the behavior is still tracked in upstream issues: #46551 (https://github.com/anomalyco/opencode/issues/46551) covers dropped explicitly configured local files, #52300 (https://github.com/anomalyco/opencode/issues/52300) covers local directories ignoring package.json main, and #49608 (https://github.com/anomalyco/opencode/issues/49608) covers V2 local plugin paths and @opencode/plugin resolution.

When building a plugin, distinguish between three things: the configuration contract shown in the official documentation, the implementation in a particular release, and the exact build you are running. Before publishing or debugging, verify behavior against the target version.

## OpenCode V2 Entry Resolution in the Source Code

In v2.0.15, the relevant implementation is in source.ts, module.ts, host.ts, and import.bun.ts:

- source.ts scans configuration and checks paths.
- module.ts loads the module and validates the V2 default export.
- host.ts resolves server, the root entry, tui, and rpc.
- import.bun.ts performs runtime module resolution in Bun.

Official source links:

- https://github.com/anomalyco/opencode/blob/v2.0.15/packages/core/src/config/plugin/source.ts
- https://github.com/anomalyco/opencode/blob/v2.0.15/packages/core/src/plugin/module.ts
- https://github.com/anomalyco/opencode/blob/v2.0.15/packages/plugin/src/host.ts
- https://github.com/anomalyco/opencode/blob/v2.0.15/packages/util/src/runtime/import.bun.ts

You can think of the resolver this way: a local directory tries directory/server and directory/index; an npm package tries package/server and then the package root. The npm path is where normal package.json exports, package-root, and, where applicable, main resolution takes place.

When exports is present, explicitly provide the package-root entry. Do not assume that omitting exports[.] will always fall back to main. Only a limited set of “entry not found” errors is ignored; other exceptions are rethrown.

### After Resolving the Entry Point: Validate the Default Export

OpenCode V2 still validates the default export. It expects a string id and a setup or effect function. Otherwise you may see:

    Plugin must export a default definition with an id and an effect or setup function.

V2 does not automatically convert the hooks returned by a V1 server() function. Loading is easier to reason about as three stages: find the physical entry point, import the module, then validate the default export and register the supported contract.

## A recommended dual-version package

### 1. Create explicit entry files

Make the build produce both dist/index.js and dist/server.js. The default export can contain both the V2 definition and the V1 server. V1 and V2 do not have to live in completely separate files; the final entry points simply need to be explicit.

### 2. Declare exports explicitly

Expose both the package root and ./server in package.json:

    {
      "name": "opencode-models-discovery",
      "main": "./dist/index.js",
      "exports": {
        ".": { "default": "./dist/index.js" },
        "./server": { "default": "./dist/server.js" }
      },
      "files": ["dist", "README.md", "LICENSE"]
    }

Keep main for older tools if needed, but use exports to document the entry points you intend to expose. Before publishing, confirm that both build files are included in the npm package.

### 3. Test npm and local development separately

For the published package, use its package name, for example plugin: [opencode-models-discovery@latest]. For local development, point directly at the build directory, for example plugins: [{ package: file:///path/to/opencode-models-discovery/dist }].

If you must point at the project root, add a small server.js or index.js forwarding entry there and have it import the build output from dist. That is a development convenience; the published package should still rely on clear exports declarations.

### 4. Use a shared runtime to avoid duplicate bundles

If dist/index.js and dist/server.js each bundle the complete implementation, the two entries may contain a large amount of duplicated code. Put the implementation in one runtime and keep the two entry points thin:

    dist/runtime.js  # complete implementation, built once
    dist/index.js    # thin package-root entry
    dist/server.js   # thin ./server entry

For example:

    // src/index.ts
    import { combinedPlugin, ModelDiscoveryPlugin, setupV2 } from "./runtime.js"
    export { ModelDiscoveryPlugin, setupV2 }
    export default combinedPlugin

    // src/server.ts
    import { combinedPlugin } from "./runtime.js"
    export default combinedPlugin

Do not let the filename server.js tempt you into exporting only the V1 ModelDiscoveryPlugin. When V2 uses file:///path/to/dist, the host may probe server.js first and then validate its default export for the V2 id and setup. server.js should therefore export the combined plugin as well.

## A debugging checklist

1. Is the local plugins path a directory rather than a single .js file?
2. Does the target directory contain a server or index build output?
3. Did package.json's files field exclude the build files?
4. Does the npm package provide both exports[.] and exports[./server]?
5. Does the default export contain a string id and a setup/effect function?
6. Is the V1 server function still present and returning the expected hooks?
7. Are local and npm tests using the same build artifact?

## Conclusion

Dual-version plugins have two separate problems: the V1/V2 API contracts and the way each source type resolves its entry point. A correctly shaped object is not enough; the host must first find that object.

The safest approach is to provide clear server and root build entries, expose both through exports, point local development at the build directory, and test independently in OpenCode V1 and OpenCode V2.
