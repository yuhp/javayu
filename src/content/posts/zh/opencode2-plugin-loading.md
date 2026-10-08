---
title: "OpenCode V1/V2 插件加载剖析：如何实现双版本共包与本地调试"
description: "OpenCode V1 与 V2 的插件机制完全不同，两者的插件定义也不兼容。不过，官方迁移文档提供了双版本插件方案：通过分别暴露 V1 和 V2 入口，让同一个 npm 包同时兼容两个版本。本文用实际现象解释本地目录、npm 包和 server 入口的差异，并给出双版本插件的打包方式。"
publishedAt: 2026-10-08
lang: zh
tags:
  - OpenCode
  - 插件开发
  - TypeScript
  - 开源
cover:
  src: /images/posts/opencode2-plugin-loading/cover.png
  thumbnail: /images/posts/opencode2-plugin-loading/cover-thumb.png
  alt: 图示 OpenCode V1 与 OpenCode V2 从不同插件入口加载同一个双版本插件。
translationSlug: opencode2-plugin-loading
---

> **导读**：随着 OpenCode 2.0 的正式发布，插件生态迎来了从 V1 的 Hooks 架构向 V2 的 Plugin SDK / Transforms 架构的全面代际跃迁。为了保证存量用户与新版本用户的平滑过渡，开发兼具 V1 与 V2 兼容能力的“双模（Combined）插件”成为当下开发者的必然选择。然而，当我们严格按照 OpenCode 官方文档编写 Dual-Version 代码时，却遇到了本地调试无法加载、静默失败等一系列诡异问题。本文基于 OpenCode `v2.0.15` 代码中的官方 TypeScript 源码，拆解其内部底层的加载与探测算法，还原 npm 包与本地开发模式下的差异，并给出工业级的双版本打包/调试实践指南。


## 先记住三个结论

1. 在 OpenCode V2 中通过 plugins 配置本地插件时，传入的路径应当是目录，不要直接传 dist/index.js。OpenCode V1 则可以直接引用插件文件，也可以引用代码根目录。
2. 本地目录主要按目录下的 server 和 index 文件寻找入口，不会因为根目录的 package.json 有 main: ./dist/index.js 就自动跳到 dist。
3. npm 包和本地目录的解析路径不同。npm 包会优先尝试包的 server 子路径，因此双版本包最好显式导出包根和 ./server。

这里的目录限制特指 OpenCode V2 的本地加载流程，不适用于 OpenCode V1。OpenCode V1 更接近直接导入用户指定的模块，因此可以引用 dist/index.js、dist/server.js，或者能够解析到 V1 server 函数的项目根目录；OpenCode V2 在本地加载时则应优先提供包含可探测入口的插件目录。

## 官方示例看似清晰，实际行为却不一致

官方在 [OpenCode V2 插件迁移指南](https://opencode.ai/v2/docs/build/plugins/migrate-v1/#support-v1-and-v2-from-one-package) 中给出了双版本入口示例：V2 使用 Plugin.define，V1 保留顶层 server 函数。

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

OpenCode 的迁移文档给出的双版本思路是：OpenCode V1 找到默认导出的 server 函数，把它作为旧版 hooks 插件运行；OpenCode V2 找到 id，以及 setup 或 effect，把它作为新版插件注册；两套协议放在同一个模块中，由不同版本的宿主使用各自认识的字段。

同时官方也在 [OpenCode V2 使用文档：插件配置](https://opencode.ai/v2/docs/plugins/) 中给出了插件加载的配置示例，允许用户通过 plugins 配置本地目录、文件、npm 包和插件选项等。

```jsonc
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
        "strict": true,
      },
    },
  ],
}
```

这些配置示例描述了官方文档允许的配置写法，但不代表每一种写法都能在当前 OpenCode V2 实现中正常工作。尤其是显式配置本地单文件这一写法，正是本文后面要分析的文档与实现差异。我们在实际开发调试时，才会发现入口寻址往往更早发生，也更容易让问题看起来像“插件没有反应”。

## 本地调试 OpenCode V2 插件时遇到的加载问题

### 直接引用加载 JavaScript 文件：被跳过

显式 plugins 配置如果直接指向 file:///path/to/project/dist/index.js，OpenCode V2 的配置扫描会先检查目标是不是文件。如果是文件，就记录 warning 并跳过：

    configured plugin path must be a directory

因此，在 OpenCode V2 的显式 plugins 配置中应当传入目录，而不是某个 .js 文件。需要注意，.opencode/plugins/ 下的自动发现机制仍然可以发现单个 .ts/.js 文件；这两种来源走的是不同的扫描路径。

### 指向项目根目录：没有报错，但也没有插件

假设项目结构如下：

    my-plugin/
    ├── package.json       # main 指向 ./dist/index.js
    ├── src/
    └── dist/
        ├── index.js
        └── server.js

如果把配置指向项目根目录，插件可能仍然加载不到。本地目录的入口探测主要尝试：

    /path/to/my-plugin/server
    /path/to/my-plugin/index

它不会把项目根目录当成一个 npm 包，再根据 package.json 的 main 跳转到 dist/index.js。如果根目录没有 server.js、server.ts、index.js 或 index.ts，探测就会落空。

### 指向构建目录：成功加载

如果改成指向 "file:///path/to/my-plugin/dist" 或者 "/path/to/my-plugin/dist"，OpenCode V2 就可以直接命中 dist/server.js 或 dist/index.js。这解释了为什么指向子目录可以，指向拥有 package.json 的项目根目录却不行：两种配置触发的是不同的入口寻址规则。


## 文档、源码与实际行为的差异

截至 OpenCode v2.0.24，相关行为仍可在上游 Issue 中追踪：[#46551](https://github.com/anomalyco/opencode/issues/46551)讨论显式本地文件路径被丢弃，[#52300](https://github.com/anomalyco/opencode/issues/52300)讨论本地目录忽略 package.json 的 main，[#49608](https://github.com/anomalyco/opencode/issues/49608)讨论 V2 本地插件路径和 @opencode/plugin 解析问题。

这意味着，写插件时需要区分三件事：官方文档展示的配置契约、某个具体版本的源码实现，以及你实际运行的构建版本。最终发布或调试前，应以目标版本的实际行为为准。

### 为什么显式本地插件要求目录

目录限制不只是一个路径校验细节，也与 V2 的多端插件设计有关。一个完整的 V2 插件目录可能同时包含：

    index.ts   # 主入口
    rpc.ts     # RPC 扩展
    tui.ts     # 终端 UI 扩展

OpenCode 需要以插件目录为根，继续探测这些同级入口。

官方在 PR [#46105](https://github.com/anomalyco/opencode/pull/46105) 中引入 Typed RPC 和 Custom Events 后，这种目录结构变得更重要；

PR [#46898](https://github.com/anomalyco/opencode/pull/46898) 则让非目录配置被拒绝时能够留下更明确的诊断。

因此，官方实现选择保留“显式配置必须是目录”的规则，而不是把裸文件当作只有一个入口的完整 V2 插件。需要注意的是，官方迁移文档仍然保留了本地文件路径示例，这正是文档与当前实现容易产生误解的地方。

## V1 与 V2 的本地加载方式不同

两代宿主对本地插件的入口寻址并不完全相同：

| 本地引用方式 | OpenCode V1 | OpenCode V2 |
| --- | --- | --- |
| 项目根目录 | 通常可以，只要模块能被解析并提供 V1 server | 通常需要根目录存在可探测的 server 或 index |
| dist/index.js 或 dist/server.js | 可以直接加载 | 显式 plugins 配置通常会在文件校验阶段拒绝 |
| dist/ 目录 | 可以 | 推荐，按 server → index 探测 |
| 默认导出要求 | V1 server 契约 | 字符串 id 和 setup/effect；不会自动转换 V1 server() |

所以不能把下面两种配置当成等价写法：

    V1: plugin = ["file:///path/to/project/dist/server.js"]
    V2: plugins = ["file:///path/to/project/dist"]

前者更接近“直接导入一个模块文件”，后者是把目录交给 V2 的入口解析器。对于 V2 本地调试，优先使用构建目录，通常比直接引用单文件更可靠。


## 从源码看 OpenCode V2 的入口解析

在 v2.0.15 中，相关实现位于 source.ts、module.ts、host.ts 和 import.bun.ts：

- [source.ts](https://github.com/anomalyco/opencode/blob/v2.0.15/packages/core/src/config/plugin/source.ts)：配置扫描和路径校验。
- [module.ts](https://github.com/anomalyco/opencode/blob/v2.0.15/packages/core/src/plugin/module.ts)：模块加载和 V2 默认导出校验。
- [host.ts](https://github.com/anomalyco/opencode/blob/v2.0.15/packages/plugin/src/host.ts)：server、根入口、tui 和 rpc 的入口寻址。
- [import.bun.ts](https://github.com/anomalyco/opencode/blob/v2.0.15/packages/util/src/runtime/import.bun.ts)：Bun 运行时的模块解析。

### 1. 本地路径校验的死命令

在 `source.ts` 的 `ConfigPluginSource.scan` 中，对配置得到的绝对路径会先检查是否为文件。真实源码不是抛出异常，而是记录 warning 并返回 `Option.none()`，使该配置项被过滤掉：

```typescript
if (yield* fs.isFile(operation.target)) {
  yield* Effect.logWarning("configured plugin path must be a directory", { target: operation.target })
  return Option.none<Operation>()
}
```
这就是为什么通过 `plugins` 配置直接指向 `.js` 文件不会进入正常的 V2 配置插件加载流程；它会被记录 warning 后忽略。`PluginModule.load` 仍保留了面向旧的自动发现来源的单文件兼容分支，但这不改变配置扫描阶段的行为。

### 2. 双轨制解析逻辑：`Host.resolve`
以下逐字摘录 `host.ts` 的完整 `resolve` 函数：

```typescript
export function resolve(target: Target): Entrypoints {
  const entry = (subpaths: readonly string[]) => {
    for (const subpath of subpaths) {
      const specifier = target.name
        ? [target.name, subpath].filter(Boolean).join("/")
        : path.resolve(target.directory, subpath || "index")
      try {
        return resolveModule(specifier, target.directory)
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !("code" in error) ||
          ![
            "ENOENT",
            "ENOTDIR",
            "MODULE_NOT_FOUND",
            "ERR_MODULE_NOT_FOUND",
            "ERR_PACKAGE_PATH_NOT_EXPORTED",
            "ERR_UNSUPPORTED_DIR_IMPORT",
          ].includes(String(error.code))
        )
          throw error
      }
    }
    return undefined
  }
  return { server: entry(["server", ""]), tui: entry(["tui"]), rpc: entry(["rpc"]) }
}
```

可以把 Host.resolve 简化理解为：本地目录依次寻找 目录/server 和 目录/index；npm 包依次尝试 包名/server 和 包名。npm 包的第二条路径才会进入常规 package.json exports、包根入口，以及在适用情况下的 main 解析。

因此，有 exports 时应明确提供包根入口，不能假设缺少 exports[.] 时一定会回退到 main。解析器也只会忽略有限几类“找不到入口”的错误，其他异常会继续抛出。

### 找到入口后：校验默认导出

入口文件被找到，只代表模块可以被导入。OpenCode V2 还会检查默认导出是否包含字符串类型的 id，以及 setup 或 effect 函数。否则可能看到：

    Plugin must export a default definition with an id and an effect or setup function.

V2 不会把 V1 的 server() 返回值自动转换成 V2 插件。插件加载可以拆成三个阶段：找到物理入口，导入模块，校验默认导出并注册对应版本的能力。

## 推荐的双版本打包方式

### 1. 准备明确的入口

让构建产物同时包含 dist/index.js 和 dist/server.js。默认导出可以同时包含 V2 定义与 V1 server；V1 和 V2 不必完全拆成两个项目，但最终入口必须清晰。

### 2. 显式声明 exports

在 package.json 中同时导出包根和 ./server：

```json
{
  "name": "opencode-models-discovery",
  "main": "./dist/index.js",
  "exports": {
    ".": { "default": "./dist/index.js" },
    "./server": { "default": "./dist/server.js" }
  },
  "files": ["dist", "README.md", "LICENSE"]
}
```

main 可以保留用于兼容传统工具；exports 则明确写出真正开放的入口。发布前要确认两个构建文件都进入 npm 包。

### 3. 分别验证 npm 和本地调试

发布为 npm 包时使用包名，例如 plugins: ["opencode-models-discovery@1.8.0"]。本地开发时推荐直接指向构建目录，例如 plugins: [{ package: "file:///path/to/opencode-models-discovery/dist" }]。

如果必须指向项目根目录，可以放置 server.js 或 index.js 作为转发入口，再由它导入 dist 中的构建结果。但这只是开发辅助方案，发布包仍应依赖清晰的 exports 配置。

### 4. 用共享 Runtime 避免重复打包

如果 dist/index.js 和 dist/server.js 分别 bundle 全部业务代码，两个入口可能包含大量重复内容。可以把实现集中到一个 Runtime 中，让两个入口只承担薄包装职责：

    dist/runtime.js  # 完整实现，只构建一次
    dist/index.js    # 根入口薄包装
    dist/server.js   # ./server 入口薄包装

例如：

    // src/index.ts
    import { combinedPlugin, ModelDiscoveryPlugin, setupV2 } from "./runtime.js"
    export { ModelDiscoveryPlugin, setupV2 }
    export default combinedPlugin

    // src/server.ts
    import { combinedPlugin } from "./runtime.js"
    export default combinedPlugin

这里有一个容易犯的错误：不能因为文件名叫 server.js，就让它只导出 V1 的 ModelDiscoveryPlugin。当 V2 使用 file:///path/to/dist 时，宿主可能优先探测 server.js，随后校验它的默认导出是否包含 V2 所需的 id 和 setup。因此，server.js 也应导出 combined plugin。

## 排查清单

1. 本地 plugins 路径应该指向的是目录，不要指向具体的.js文件
2. 目标目录下是否存在 server 或 index 对应的构建文件？
3. 构建产物是否被 package.json 的 files 字段排除？
4. npm 包是否同时提供 exports[.] 和 exports[./server]？
5. 默认导出是否包含字符串 id 和 setup/effect？
6. V1 的 server 是否仍然保留并返回旧版需要的 hooks？
7. 本地和 npm 包测试的是否是同一个构建产物？

## 结语

双版本插件的难点有两层：V1/V2 的 API 契约，以及不同来源的入口寻址。只看迁移文档中的默认导出示例，容易误以为只要对象写对就足够；实际加载流程还要先解决“宿主从哪里找到这个对象”。

最稳妥的做法是：为构建产物准备清晰的 server 和根入口，使用 exports 明确暴露两个子路径，本地调试时直接指向构建目录，并分别在 OpenCode V1 和 OpenCode V2 中验证。
