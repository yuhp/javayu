---
title: "从 Config Hook 到 Server/TUI：OpenCode 插件 V1 到 V2 的架构演进"
description: "OpenCode V1 到 V2 绝不仅是 API 换名，而是插件与宿主之间责任边界的彻底重构。本文以实际模型发现插件的演进为切入点，系统拆解从 Config Hook、文件认证与 XDG 缓存，到 Provider Transforms、Host Storage、Integration API 与 Server/TUI RPC 的完整架构跃迁。"
publishedAt: 2026-10-09
lang: zh
tags:
  - OpenCode
  - 架构设计
  - 插件开发
  - TypeScript
  - 开源
cover:
  src: /images/posts/opencode-plugin-v1-v2-architecture/cover.png
  thumbnail: /images/posts/opencode-plugin-v1-v2-architecture/cover-thumb.png
  alt: 图示 OpenCode 插件从 V1 的配置 Hook 与文件系统单体架构演进到 V2 的 Provider Transforms、Host Storage 与 Server/TUI 分离架构。
translationSlug: opencode-plugin-v1-v2-architecture
---

> **导读**：随着 OpenCode 2.0 的发布，插件开发者面临的绝不仅是简单的 API 迁移，而是一次宿主与插件责任边界的重塑。在 V1 时代，插件往往扮演“全能单体”，兼顾查找配置、读取认证文件、维护本地缓存与直接修改运行时。到了 V2，宿主收敛了凭证、存储与进程通信边界，插件则全面转向基于 Provider Registry、Host Storage 与 Server/TUI 分离的协作架构。本文以模型发现插件的演化全流程为蓝本，系统还原这次架构变迁背后的底层逻辑与工程实践。

---

## 一次不只是 API 迁移的重构

最初，模型发现插件只需要在 OpenCode 启动时读取 Provider 配置，请求 `/v1/models`，再把结果写回配置对象。

到了 OpenCode V2，问题开始发生本质变化：内置 Provider 与 Model 信息有了专门的模块处理；内部集成模块（Integration）原生接管认证，摆脱了 `auth.json` 形式的明文凭证存储；宿主也提供了良好设计的统一存储服务 `ctx.storage`。与此同时，TUI 交互与后台状态也有了清晰的进程解耦边界。

因此，V2 重构的本质**不是把几个旧 API 替换成新 API，而是重新划分插件与宿主之间的责任边界**。

---

## V1：配置 Hook、文件系统和单体运行时

V1 插件的入口是一个 Server Plugin 函数，返回 `config` 和 `event` hooks：

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

典型执行链路如下：

```text
OpenCode 启动
  ↓
config hook
  ↓
读取 provider.<id>.options
  ↓
读取 auth store 和插件缓存
  ↓
请求 /v1/models
  ↓
修改 config.provider.<id>.models
```

这种模型虽然直接，但在设计上强迫插件承担了过多的宿主级职责：

- 深度理解并耦合 V1 配置对象的具体字段层级；
- 自行寻找并反序列化宿主的认证文件；
- 在本地维护 XDG 规范的文件缓存与过期逻辑；
- 直接就地修改全局启动配置；
- 注入配置型命令；
- 在同一个运行时单体里混杂网络发现、持久化状态与终端交互。

---

## V2：Provider Registry 驱动

OpenCode V2 插件使用 `Plugin.define({ id, setup })`，通过宿主注入的上下文访问 Provider Registry：

```typescript
export default Plugin.define({
  id: "opencode.models-discovery",
  setup: setupV2,
})
```

V2 的基本生命周期演变为：

```text
setup
  ↓
ctx.provider.list()
  ↓
注册可重放的 provider transform
  ↓
refresh：请求、过滤、增强模型
  ↓
替换内存 inventory
  ↓
ctx.provider.reload()
  ↓
宿主重放 transform，更新 Provider Registry
```

V2 不再允许插件直接篡改用户配置文件，也不建议把耗时的网络请求塞进 transform 回调。网络请求、认证与缓存属于 `refresh` 阶段；`transform` 回调仅负责纯函数式地将内存中的最新 inventory 映射为宿主的 Provider drafts。

---

## 单一入口与双适配器分工（Combined Entrypoint）

在兼容两代 OpenCode 的过程中，我们没有拆分为两个独立的 npm 包，而是通过统一的包入口实现了对两代宿主的平滑分发：

```text
OpenCode V1 -> default.server(input, options)
OpenCode V2 -> default.id + default.setup(ctx)
```

项目内部的物理工程边界保持了高度清晰：

- `src/core/`：宿主无关的模型发现流程、名称过滤、元数据增强（Enrichment）与缓存策略；
- `src/v2/`：OpenCode V2 主线稳定适配器（Provider Transforms、Host Storage、Integration、TUI/RPC）；
- `src/plugin/`：OpenCode V1 遗留兼容适配器（配置 Hook、XDG 文件状态、遗留命令）；
- `src/runtime.ts`：将两者结合为一个对外的统一导出，打包为 `dist/runtime.js`。

当插件运行在 V1 时，控制台会显式提示当前运行于 Legacy Adapter；而所有新的生命周期、存储与交互能力均优先面向 V2 开发。

---

## V1 与 V2 全维度架构对比

| 维度 | OpenCode V1 | OpenCode V2 |
|---|---|---|
| **集成定位** | 遗留兼容适配器（Legacy Support） | 主线稳定集成（Primary & Stable） |
| **配置读取** | 插件参数和 `config` hook | `ctx.provider.list()` |
| **Provider 配置** | `provider.<id>.options` | `providers.<id>.settings` |
| **模型注入** | 直接修改配置对象 | `ctx.provider.transform()` |
| **用户覆盖 (Override)** | 混合在 XDG provider state 中 | 独立的 Host Storage `overrides:<id>:<model>` |
| **更新生效** | 配置重新构建 | inventory 替换 + `provider.reload()` |
| **认证机制** | `apiKey`、resolved provider、`auth.json` 回退 | `ctx.integration.connection` |
| **缓存机制** | XDG 下的私有 JSON 文件 | 宿主统一管理的 `ctx.storage` |
| **命令形态** | 配置注入型 command | 原生 TUI Keymap command |
| **进程模型** | Server 插件单体运行 | Server Plugin + TUI Plugin |
| **交互通信** | 同一插件运行时或 session 消息 | Server/TUI 强类型 RPC |

---

## 三条关键的责任边界重塑

### 1. 凭证边界

- **V1 时代**：插件拥有“寻找凭证”的责任，需要感知宿主认证存储路径及反序列化格式。
- **V2 时代**：宿主牢牢掌控凭证，插件只负责安全消费 `ctx.integration` 提供的 credential。

### 2. 状态边界

- **V1 时代**：插件拥有“存到哪个物理文件”的责任，必须自行处理目录创建、原子写入与 TTL 校验。
- **V2 时代**：宿主通过 `ctx.storage` 提供稳定后端，插件仅维护缓存 key、identity 与失效语义。

### 3. 进程边界

- **V1 时代**：后台逻辑、配置注入与终端交互杂糅在一个进程中。
- **V2 时代**：**TUI 与 Server 彻底解耦**：
  - **TUI 端**：负责 Keymap 命令、输入对话框、Toast 提示与 RPC Client 调用；
  - **Server 端**：负责模型发现、集成认证、缓存管理、Provider Registry 与 RPC Handler。

---

## 核心工作流：一次 Refresh 的完整链路

在架构定型后，一次手动的模型刷新遵循严格的单向数据流与分层防御：

```text
用户输入 /models-discovery-refresh
  ↓
TUI Keymap command 触发
  ↓
RPC 调用 refresh({ force })
  ↓
Server 端执行 refreshFromCurrentConfig()
  ↓
Integration API 安全解析 API key
  ↓
ctx.storage 读取或更新 discovery cache
  ↓
请求 Provider 远端 /v1/models（网络抖动时保留上次已知有效模型）
  ↓
从 ctx.storage 读取持久化 overrides (overrides:<providerID>:<modelID>)
  ↓
合并用户自定义覆盖并原子替换内存 inventory
  ↓
触发 provider.transform 并在完成后执行 provider.reload()
  ↓
RPC 向 TUI 返回执行摘要
  ↓
TUI Toast 呈现最新状态
```

这一链路的优势在于：**任何 UI 交互均无权直接接触敏感凭证、磁盘存储与 Registry 核心**；当远端发生瞬时网络故障时保留 `previousInventory`，避免单次网络抖动直接清空可用模型列表。

---

## 模型覆盖与热重载链路（Zero-restart Loop）

除了自上而下的远端自动发现，V2 架构还闭环了用户自定义模型元数据的热重载链路：

```text
用户在 /models-discovery-console 中编辑模型（如修改 limits 或开启 reasoning）
  ↓
TUI 调用 RPC overrideSet({ providerID, modelID, patch })
  ↓
Server 严格校验字段（过滤并拒绝任何敏感凭证字段）
  ↓
Server 写入 ctx.storage ("overrides:<providerID>:<modelID>")
  ↓
应用 patch 到内存 inventory 并调用 ctx.provider.reload()
  ↓
宿主重放 provider.transform，更新当前 Provider Registry
  ↓
TUI 原地重新获取状态并更新界面视图（被覆盖模型显式标有 * 号）
```

用户在微调上下文长度或推理配置时，**完全不需要重启 OpenCode 服务或退出交互终端**，真正实现了即改即生效的闭环。

---

## 从演进历史看架构形态的成型

回顾整体迭代路径，架构的演进呈现出清晰的节奏感：

1. **v1.6：建立 V2 探索支持**。引入 V2 Provider Discovery 原型，并通过 Combined Entrypoint 建立 V1/V2 双版本平滑共存的基础。
2. **v1.7：稳定生命周期**。重点攻克动态配置重载、防止 Transform 重复注册、生命周期事件监听与清理逻辑，奠定 V2 运行稳定性。
3. **v1.8：抽取共享核心**。重构核心模块，让两代适配器彻底共享底层过滤算法、模型命名规范、元数据增强与投影逻辑。
4. **v1.9：接入 Host Storage**。将缓存完全迁离插件私有文件系统，接入宿主托管的 Storage 抽象，实现存储后端与业务逻辑解耦。
5. **v1.10：Integration、RPC 和 TUI 完整落地**。打通基于 Integration API 的无明文认证通道与统一 RPC 契约，完成原生 TUI 刷新、交互式模型浏览与 Discovery Console。
6. **v2.0.0-rc.1：V2 主线落地与 V1 维护隔离**。正式确立 OpenCode V2 为主线稳定实现，V1 转入遗留维护模式；交付持久化模型覆盖，建立端到端断网容灾与双版本隔离回归套件。

---

## 结语：插件到底应该负责什么？

回看 V1，插件的设计思路往往是“把所有事情包揽在自己手中”：自己翻目录找凭证、自己管理缓存文件、自己覆写全局配置、自己硬编码控制台输出。

而 V2 所倡导的现代插件架构，则明确了宿主与领域逻辑的分野：

- **宿主负责基建**：统一接管认证分发、安全存储、Provider Registry 和进程间 RPC 通道；
- **插件专注领域**：专注发现什么模型、如何进行合规过滤、如何补充关键元数据；
- **TUI 负责体验**：专注将复杂后台能力提炼为符合人体工程学的交互界面。

这也是从 OpenCode V1 迁移到 V2 最重要的心智模型转变：**不要只停留在 API 签名的增删，先重新理清每一项能力到底应当归谁所有。**

---

## 项目与发布资源

本文探讨的完整架构与工程落地代码均已开源并在真实生产环境中运行：

- **GitHub Release**：[`opencode-models-discovery v2.0.0-rc.1`](https://github.com/yuhp/opencode-models-discovery/releases/tag/v2.0.0-rc.1)（包含完整的变更日志、源码归档与架构演进说明）
- **npm Package**：[`opencode-models-discovery@2.0.0-rc.1`](https://www.npmjs.com/package/opencode-models-discovery/v/2.0.0-rc.1)（支持 OpenCode V1 / V2 的双版本平滑共存分发包）

