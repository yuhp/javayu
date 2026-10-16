---
title: "OpenCode 插件交互怎么做？利用 V2 RPC 架构实现 Server 与 TUI 彻底解耦"
description: "OpenCode 插件 V1 到 V2 的第三道关键边界重构：用户界面与后台业务逻辑该如何分工？为什么简单的‘刷新模型’命令不应该污染 Agent 对话上下文？本文深入解析从配置注入型命令、伪造 Session 消息，到原生 TUI Keymap、强类型 RPC 契约与零重启模型覆盖控制台的架构演进。"
publishedAt: 2026-10-16T11:00:00+08:00
lang: zh
tags:
  - OpenCode
  - 架构设计
  - RPC
  - TUI
  - 插件开发
  - TypeScript
cover:
  src: /images/posts/opencode-plugin-rpc-tui-separation/cover.png
  thumbnail: /images/posts/opencode-plugin-rpc-tui-separation/cover-thumb.png
  alt: 图示 OpenCode 插件系统架构中 Server 后端与 TUI 前端通过强类型 RPC 契约进行解耦交互的完整全景图。
translationSlug: opencode-plugin-rpc-tui-separation
---

> **导读**：这是“OpenCode 插件 V1 到 V2：架构演进合集”的第三篇专题文章。在前面两篇我们解决了凭证托管（Integration API）和状态存储（Host Storage）的问题。但当插件需要为开发者提供可视化交互时，一个长久存在的架构矛盾凸显出来：**简单的应用运维操作（如‘刷新模型’、‘编辑覆盖’），为什么会不合逻辑地触发 Agent 的 LLM 对话循环？** 本文以 `opencode-models-discovery` 插件为例，系统复盘三代交互方案的变迁，详解如何利用 OpenCode V2 的 RPC 架构彻底切开 Server 与 TUI 的进程职责边界。

---

## 一个“刷新模型”命令为什么会触发 Agent？

在 OpenCode V1 中，插件与用户的交互通常是通过配置注入来实现的：插件在 `config` hook 中注入 command 定义，再由 Agent 去执行对应的模板。

到了 V2 早期，为了能让用户在界面中触发刷新，我们曾使用过一种过渡方案：通过 Server Command 结合 `session.synthetic()` 把操作执行结果当成一条合成消息丢回当前对话 Session。

然而，这引发了一连串诡异且不符合直觉的用户体验：

```text
用户只想快速刷新模型列表
  ↓
插件向当前 Session 伪造一条上下文消息
  ↓
当前 Agent 对话 Loop 被意外激活
  ↓
甚至诱发非预期的 LLM 续写或工具调用
```

“刷新模型”本质上是一个纯粹的本地/网络运维操作，而不是一次向模型发起的 Prompt 对话请求。**把它硬塞进 Session 对话流，实际上在架构层面严重混淆了‘用户交互界面’与‘Agent 对话上下文’两个截然不同的运行时边界。**

---

## 插件交互的三代演进路径

回顾插件的交互架构，经历了三次本质性的代际跃迁：

```text
第一代 (V1)：配置注入 command → Agent Prompt 模板

第二代 (V2 早期)：Agent Tool / Server Command → session.synthetic() 伪造消息

第三代 (当前稳定)：TUI Keymap 原生层 → 强类型 RPC → Server Handler → 原生 Toast/Dialog
```

当前方案的关键突破在于：**TUI 不再作为 Agent 对话的附庸，而是拥有了独立的原生交互生命周期；通过强类型 RPC 直接驱动后台能力，彻底切断了对 Session 对话流的不必要污染。**

---

## Server 侧：唯一的业务状态源（Single Source of Truth）

在彻底解耦的架构中，所有涉及外部网络请求、身份凭据与核心 Registry 的职责被严格收敛至 Server Plugin：

- 读取并解析当前宿主的 Provider Registry；
- 解析并处理 discovery 过滤与命名规则；
- 通过 Integration API 安全获取 Provider 凭据；
- 通过 Host Storage 读写缓存与持久化模型覆盖；
- 发起远端 Provider `/v1/models` 请求；
- 维护内存级 inventory 并在变更时原子生效；
- 触发 `provider.transform()` 与 `provider.reload()`；
- 统一注册对外暴露的 Agent Tools 与 RPC Handlers。

无论是终端启动、配置文件热重载、凭证切换，还是由 Agent 工具或 TUI 触发的刷新，在 Server 侧均复用同一个幂等的核心控制器：

```typescript
const refreshFromCurrentConfig = async (force?: boolean) => {
  // 1. 同步当前 Provider 设定与活跃 Integration 连接
  // 2. 通过 Integration API 解析凭据
  // 3. 执行模型发现与元数据增强（Enrichment）
  // 4. 合并用户持久化 Overrides
  // 5. 原子替换内存 inventory 并通知宿主 reload providers
}
```

这确保了无论触发源来自哪里，核心业务逻辑永远只有一份实现，彻底消除了多端逻辑漂移的可能。

---

## RPC：Server 与 TUI 之间的强类型法定契约

在 `v2.0.0-rc.1` 中，进程间通信通过 `src/v2/rpc.ts` 定义的契约严格规范，涵盖了状态查询、刷新、缓存管理与模型覆盖全生命周期：

```typescript
export const DiscoveryRpcDefinition = Rpc.define({
  id: "opencode.models-discovery",
  methods: {
    status: { /* 获取 Provider 及模型详情，标注覆盖状态 */ },
    refresh: { /* 触发增量或全量强制刷新 */ },
    cacheInspect: { /* 查看缓存条目、TTL 与命中状态 */ },
    cacheClear: { /* 清理指定 Provider 或全部缓存 */ },
    overrideList: { /* 查询当前所有模型覆盖记录 */ },
    overrideSet: { /* 校验并保存单模型覆盖 patch */ },
    overrideDelete: { /* 删除指定模型覆盖并恢复默认元数据 */ },
  },
})
```

Server 侧注册业务实现：

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

TUI 侧创建强类型 Client 实例：

```typescript
const rpc = context.client.rpc(DiscoveryRpcDefinition)

const result = await rpc.refresh(
  { force: true },
  { location },
)
```

**RPC 的核心价值绝不仅是解决进程间数据传输，更关键在于确立了单向依赖与调用边界**：TUI 只能请求明确定义的接口并接收结构化响应，它完全无权也无需知道 Server 内部是如何加密凭证、管理物理缓存或与 Provider 通信的。

---

## TUI 侧：只专注人体工程学交互

在解耦之后，`src/tui.ts` 变得极其纯粹，仅专注于交互与视图渲染：

1. 注册 Slash Command 与 Command Palette 快捷项；
2. 收集用户交互输入（例如是否强制刷新、过滤关键词等）；
3. 发起非阻塞的异步 RPC 调用；
4. 通过宿主原生 Toast、Select、Confirm 与 Alert 对话框优雅呈现反馈。

以最常用的刷新命令为例：

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

**代码里没有发起任何 HTTP 网络请求，没有嗅探任何密钥，也没有直接侵入 Storage**。所有复杂的后台行为均委托给 Server 处理，TUI 只扮演轻量级的表现层。

---

## Discovery Console：RPC 驱动的多级交互与零重启模型覆盖

在 `v2.0.0-rc.1` 中，基于原生 TUI 与 RPC 契约，插件交付了完整的交互式控制台 `/models-discovery-console`：

```text
Models Discovery Console
  ├─ Browse Models
  │    ├─ Provider list
  │    ├─ Model list（被自定义覆盖的模型显式标有 * 号，如 "claude-3-5-sonnet *"）
  │    └─ Model details & Actions
  │         ├─ Edit override（修改 Name / Context Limit / Output Limit / Reasoning 等）
  │         └─ Delete override（清除自定义覆盖，原子恢复远端发现原貌）
  │
  └─ Cache Operations
       ├─ Inspect Cache Status（查看各 Provider 缓存命中与保鲜期）
       ├─ Force Refresh（强制绕过缓存全量发现）
       ├─ Clear Provider Cache（清理单个 Provider 缓存）
       └─ Clear All Discovery Caches（一键清空全部发现缓存，不误伤 Overrides）
```

### 1. 彻底的数据脱敏与安全浏览
模型浏览界面严格消费 `status` RPC 的脱敏产物：展示 Provider 名称、模型 ID、上下文窗口上限、视觉/推理能力标志，但**任何 API Key、Authorization 头或敏感内部字段均被彻底阻断在 Server 端**。

### 2. 零重启响应闭环（Zero-restart Reactive Loop）
当开发者在 TUI 菜单中选择 **Edit override** 并调整了模型的 Context Limit 时：

1. TUI 收集用户输入参数，调用 `rpc.overrideSet()`；
2. Server 端严格校验白名单字段并防范注入，持久化写入 `ctx.storage`；
3. Server 调用 `ctx.provider.reload()`，宿主立即重放 transforms；
4. 宿主内部的活跃 Provider Registry 瞬间刷新；
5. TUI 原地重新拉取 `status`，界面上该模型名称后即时出现 `*` 标识，新配置毫秒级生效！

**开发者全程无需重启 OpenCode 进程，无需退出交互终端，更无需重新连接 Provider**，体验丝滑流畅。

---

## 为什么这一进程边界设计极大地降低了维护成本？

1. **彻底根除逻辑重复（DRY 原则）**：
   如果 TUI 直接写网络请求和缓存判定，那么 Agent Tool、启动初始化和 TUI 交互就会产生三套互相冲突的实现。集中于 Server 后，逻辑单点闭环。
2. **凭据零扩散（Zero Credential Leakage）**：
   解析出的明文密钥仅在 Server 的网络请求瞬间短暂驻留内存，绝不通过 RPC 透传给前端展示层。
3. **消除状态分裂隐患**：
   内存 inventory、Storage 缓存和 Provider drafts 均由 Server 权威裁定，TUI 端从不缓存第二份过期的状态镜像。
4. **单元测试与集成测试清晰解耦**：
   Server 模块可以脱离终端环境做高并发、断网、防注入与持久化自动化测试；TUI 模块则只需 Mock RPC 契约即可独立测试各类 UI 交互与异常分支。

---

## 原生 TUI 命令与 Agent Tool 的互补协作

需要特别强调的是：**引入 TUI 原生交互并不意味着废弃 Agent Tool**。它们在现代 CLI 中是定位互补的两种通道：

```text
Agent Tool ──┐
             ├─> Server 核心领域控制器（唯一业务实现）
TUI RPC  ────┘
```

- **Agent Tool**：专供 Agent 在多轮思考、自主排障与自动化脚本中由模型自主调用；
- **TUI Command / RPC**：专供人类开发者在终端中即时主动操作、直接查看反馈。

两者共享同一套 Server 领域能力，但各自拥有独立的输入输出契约。

---

## 结语：交互层不应持有业务状态

回顾 OpenCode 插件三代架构的变迁，最重要的工程认知可以总结为：

```text
TUI 前端：负责‘如何展示、如何与人交互’
Server 后端：负责‘做什么业务、如何保证安全、状态持久化在哪里’
```

当我们在终端输入 `/models-discovery-refresh` 时，TUI 发出的仅仅是一条结构化的契约请求。真正的凭证解析、存储缓存、网络请求与 Registry 变更均在后台受控完成，反馈以原生 Toast 返回，绝不向用户的当前对话注入冗余的虚假文本。

这正是 OpenCode V2 架构体系最强大的地方：**让 TUI 成为后台服务的现代化客户端，而非另一份混杂了业务逻辑的脆弱单体。**

---

## 项目与发布资源

本文探讨的 RPC 契约定义、TUI 原生命令交互以及零重启 Discovery Console 源码均已开源验证：

- **GitHub Release**：[`opencode-models-discovery v2.0.0-rc.1`](https://github.com/yuhp/opencode-models-discovery/releases/tag/v2.0.0-rc.1)（包含完整的 Server/TUI RPC 实现与零重启控制台）
- **npm Package**：[`opencode-models-discovery@2.0.0-rc.1`](https://www.npmjs.com/package/opencode-models-discovery/v/2.0.0-rc.1)（面向 OpenCode V1/V2 的统一双模分发包）
