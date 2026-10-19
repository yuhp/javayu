---
title: "opencode-models-discovery v2.0.0 正式发布"
description: "opencode-models-discovery v2.0.0 正式发布！本篇不仅是一次重大版本发布公告与从 V1 到 V2 的完整迁移指南，也是“OpenCode 插件 V1 到 V2 架构演进”系列的收官全景合集。全面详解原生 V2 支持、宿主 Integration 凭证托管、Host Storage 状态持久化、强类型 Server/TUI RPC 解耦及零重启控制台等重构实践。"
publishedAt: 2026-10-18T10:00:00+08:00
lang: zh
tags:
  - OpenCode
  - 开源发布
  - 架构设计
  - 插件开发
  - TypeScript
cover:
  src: /images/posts/opencode-models-discovery-v2-release/cover.png
  thumbnail: /images/posts/opencode-models-discovery-v2-release/cover-thumb.png
  alt: opencode-models-discovery v2.0.0 正式发布与 OpenCode V2 原生架构演进全景图。
translationSlug: opencode-models-discovery-v2-release
---

> **导读**：经过多轮架构重构与 RC 验证，`opencode-models-discovery` **v2.0.0 正式版**现已发布！这不仅是一次版本号的跃升，也是过去一周我们在博客中连载的“**OpenCode 插件 V1 到 V2 架构演进系列**”的最终落地成果。本文既是新版本的正式 Release 公告与迁移指南，也是整个架构专题的**全景导读合集**。

---

## 概述：重新定义宿主与插件的协作边界

OpenCode V2 带来了全新的插件运行时，也重新定义了宿主与插件之间的权责边界。

今天，`opencode-models-discovery` v2.0.0 正式发布。

这不只是一次版本号升级，也不只是把几个旧 API 替换成新 API。对 `opencode-models-discovery` 来说，v2.0.0 完成了一次围绕**凭证**、**状态**和**交互边界**的系统级架构重构：

- **OpenCode V2 成为主线稳定集成**，充分享受新版运行时的各项原生能力；
- **OpenCode V1 保留为独立的 Legacy 兼容适配器**，旧版配置与环境开箱即用；
- **凭证彻底交给 OpenCode V2 Integration 模块管理**，告别明文 `auth.json` 嗅探；
- **缓存和模型元数据覆盖统一由宿主 Storage 持久化**，告别 XDG 文件系统的散落管理；
- **Server 专注业务状态，TUI 通过强类型 RPC 负责界面呈现与用户交互**，交互不再污染 Agent 上下文；
- **模型发现、刷新、缓存与模型覆盖形成闭环**，支持无缝运行热重载；
- **宿主配置更新、凭证建立与 Integration 切换自动触发模型更新**，无需重启服务。

---

## 一、`opencode-models-discovery` 是什么？

`opencode-models-discovery` 是一个面向 OpenAI-compatible Provider 的 OpenCode 插件。

它可以从各大 Provider 的模型接口中自动探测发现可用模型，并将规格化后的模型信息注入 OpenCode 的 Provider Registry。除了基础的模型 ID，插件还可以根据远端接口格式与本地规则自动补充模型友好名称、上下文限制（Context Limit）、输出上限（Max Output）、推理与思维链能力（Reasoning / Thinking）、工具调用（Tool Calling）以及其他高级元数据。

它广泛适用于：

- **OpenAI-compatible API 网关**（如 One API、New API 等）；
- **本地模型服务**（如 vLLM、SGLang、Ollama、LM Studio 兼容服务）；
- **自建模型路由与聚合代理**；
- **同时暴露多个动态模型的统一 Provider**；
- **需要频繁切换或热更新模型列表的开发与评测环境**。

在 v2.0.0 中，模型发现不再只是启动阶段的一次静态配置注入，而是深植于 OpenCode V2 Provider Registry 体系中的动态弹性能力。

---

## 二、v2.0.0 核心特性与架构升级

### 1. OpenCode V2 成为主线稳定集成

`opencode-models-discovery` v2.0.0 以 OpenCode V2 为第一优先级开发和测试目标，全面采用 V2 原生契约：

- `plugins` / `providers` 全新声明式配置结构；
- Provider Registry 与 Provider Transform 管道；
- Integration 凭证管理与安全上下文；
- Host Storage 隔离存储服务；
- 原生 TUI 菜单命令与交互窗格；
- Server 与 TUI 间的类型化 RPC 链路；
- 暴露给自动化流的原生 Agent Tools。

同时，**OpenCode V1 适配器被完整封装并保留**。使用 V1 遗留配置的用户无需被迫立即迁移，依然可以在同一安装包下平稳运行。

---

### 2. 使用 Integration API 接管凭证所有权

在旧版插件中，插件通常需要自行探寻 API Key：读取配置、解析环境变量、甚至拼接宿主的 XDG 目录强行解包 `auth.json`。这不仅将宿主内部实现细节硬编码到了插件内部，更埋下了敏感凭据泄漏和跨版本失效的隐患。

在 OpenCode V2 中，`opencode-models-discovery` 通过宿主提供的 `Integration API` 获取当前连接与上下文凭据：

```text
OpenCode 宿主统一管理连接状态与凭证
        ↓
插件通过 ctx.integrations 获取当前有效 credential
        ↓
仅在本次 discovery 远端 HTTP 请求时充当传输凭据
        ↓
凭证绝不进入持久化缓存、模型列表、RPC 载荷或日志
```

开发者可以使用 OpenCode 原生的 `/connect` 交互式命令绑定 Provider，再也不必将明文密钥持久化在 `opencode.json` 中：

```text
/connect
```

当连接建立、密钥轮换或凭证状态变化时，插件通过订阅宿主事件自动执行静默重测，整个过程对用户完全透明且安全。

---

### 3. 宿主 Storage 统一持久化缓存与模型覆盖

旧版插件在本地维护文件缓存时，往往要自己处理目录建构、并发锁、JSON 损坏修复以及 TTL 清理逻辑。

OpenCode V2 提供了安全可靠的宿主级存储设施 `ctx.storage`。插件从此不再关心数据最终落盘在哪，而是专注于定义数据的语义与生命周期：

```text
discovery cache（模型探测缓存）
  → 远端模型列表的临时镜像
  → 短期、具备 TTL、可由用户或系统随时清空

model override（用户模型覆盖）
  → 开发者手动校正或自定义的模型元数据（上下文、Thinking、别名等）
  → 长期、命名空间隔离、不可随临时缓存清空
```

覆盖配置采用独立的存储命名空间：
```text
overrides:<providerID>:<modelID>
```

用户在控制台修改了某个模型的元数据后，即刻落盘。即使用户点击“清空该 Provider 缓存”，也不会破坏之前辛辛苦苦调整的模型覆盖项。同时，持久化层内置了严格的敏感字段过滤白名单，任何 API Key 或 Header 均被阻隔在外。

---

### 4. 运行时配置与凭证变更即时响应

OpenCode V2 会严密监控 `opencode.json` / `opencode.jsonc` 的变动，并触发 `config.updated` 事件。插件捕获后在内存中热更新 Provider 配置并触发同步，无需杀死并重启 OpenCode 进程。

此外，插件对如下宿主认证事件提供了一等公民支持：
- `credential.updated`：凭证密文或属性发生修改；
- `credential.switched`：多账号之间切换了活跃凭据；
- `integration.updated`：Provider 接入点或高级设置调整。

如果在刷新过程中 Provider 遭遇短暂的网络抖动或网关 502，插件内置了**防抖与上一次有效 Inventory 兜底机制**，绝不会因为一次瞬间失联而将当前会话正在使用的模型列表清空。

---

### 5. 原生 TUI 控制台、RPC 链路与 Agent Tools

v2.0.0 为开发者与 AI Agent 提供了双重交互维度：

```text
开发者交互（TUI 原生命令）：
/models-discovery-refresh
/models-discovery-console

Agent 自动化调用（Agent Tools）：
models_discovery_refresh
models_discovery_status
```

其中 `/models-discovery-console` 是一套零重启的交互式管理面板：
- 浏览各 Provider 状态与模型清单；
- 查阅各模型详细参数（Context、Max Output、Capabilities）；
- 一键检查缓存状态、强制发起增量或全量刷新；
- 独立清空单 Provider 缓存或全局探测缓存；
- **直接在终端内编辑模型元数据覆盖，保存即刻生效，无需重启宿主**。

---

## 三、如何开始使用？

### 1. 安装与 V2 基础配置

在工作区或全局的 `opencode.json` 中声明插件与 Provider：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    "opencode-models-discovery@2.0.0"
  ],
  "providers": {
    "gateway": {
      "name": "Gateway",
      "package": "@opencode-ai/ai/providers/openai-compatible",
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

默认请求端点为 `/v1/models`。如网关或自建端点位于特定路径，可通过 `endpoint` 显式指定：

```json
{
  "modelsDiscovery": {
    "enabled": true,
    "endpoint": "/custom/api/models"
  }
}
```

### 2. 通过 `/connect` 快速配置凭证

推荐通过 OpenCode V2 原生流程管理凭证：

1. 保持 `settings` 内不写入明文 `apiKey`；
2. 在终端键入 `/connect`；
3. 选中对应 Provider 并填入安全 API Key；
4. 插件将自动感知该凭据并触发模型拉取。

如果处于只读内网环境或无需校验，亦可直接使用环境变量插值：

```json
{
  "settings": {
    "baseURL": "https://gateway.example.com/v1",
    "apiKey": "{env:GATEWAY_API_KEY}"
  }
}
```

---

## 四、从 OpenCode V1 迁移到 V2

对于老用户，V1 与 V2 核心字段演进对比如下：

| 特性维度 | OpenCode V1 (Legacy) | OpenCode V2 (Native) |
|---|---|---|
| **插件列表声明** | `plugin: []` | `plugins: []` |
| **Provider 字典** | `provider: {}` | `providers: {}` |
| **驱动包名称** | `provider.<id>.npm` | `providers.<id>.package` |
| **配置承载节点** | `provider.<id>.options` | `providers.<id>.settings` |
| **插件配置挂载** | `options.modelsDiscovery` | `settings.modelsDiscovery` |
| **状态与缓存存储** | 插件自行管理 XDG 文件系统 | 宿主 `ctx.storage` 托管 |
| **鉴权凭据来源** | 解析明文 `auth.json` 文件 | 宿主 Integration API / `/connect` |
| **数据接入形态** | 侵入式配置 Hook 覆写 | Provider Registry 与 Transform 流水线 |
| **控制台交互** | 伪造 Session 消息 / 阻塞命令 | 原生 TUI Keymap 与强类型 RPC 契约 |

### 升级注意事项

1. 在 V2 配置中，`modelsDiscovery.enabled` 需显式声明为 `true`；
2. V1 的 XDG 物理缓存文件不会也无需自动迁移到 V2（首次启动即会由宿主 Storage 自动重建）；
3. 宿主推荐基线版本为 OpenCode `2.0.26` 及以上，以享受最完善的 TUI RPC 与 Storage 支持。

---

## 五、演进全景：架构系列专题合集导读

`opencode-models-discovery` 的这次版本重构，也是我们深入研究 OpenCode V2 内部架构的实战沉淀。如果你对这次重构背后的设计哲学、遇到的踩坑经历和底层实现细节感兴趣，推荐按顺序阅读本博客的**“OpenCode 插件 V1 到 V2 架构演进”**系列专题：

1. **[序篇 · 插件是怎么加载的？深度解析 OpenCode 2 的加载机制与调试指南](/zh/posts/opencode2-plugin-loading/)**  
   *从源码视角追踪插件从包解析、动态 import 到在宿主容器中被调用的全流程，附多环境排错自查清单。*

2. **[总览篇 · 从 Config Hook 到 Server/TUI：OpenCode 插件 V1 到 V2 的架构演进](/zh/posts/opencode-plugin-v1-v2-architecture/)**  
   *全景鸟瞰 V1 到 V2 的三大关键断层：配置挂载、凭证所有权与交互模式的范式转移。*

3. **[专题一 · 凭证归谁管？从凭证文件嗅探到宿主 Integration API](/zh/posts/opencode-plugin-integration-authentication/)**  
   *为什么插件不该私自去读 `auth.json`？详解如何借助 V2 Integration API 实现零明文泄露的高安全鉴权。*

4. **[专题二 · 状态存在哪？从 XDG 文件缓存到宿主 Storage](/zh/posts/opencode-plugin-storage-evolution/)**  
   *告别手工维护 XDG 目录与并发锁。解析短生命周期的 discovery 缓存与长生命周期的 model override 如何在 Host Storage 中实现优雅隔离。*

5. **[专题三 · 交互怎么做？利用 V2 RPC 架构实现 Server 与 TUI 彻底解耦](/zh/posts/opencode-plugin-rpc-tui-separation/)**  
   *一个“刷新模型”命令为什么绝不该唤醒 Agent？系统复盘三代交互设计，讲解强类型 RPC 契约与零重启 TUI 控制台的落地细节。*

---

## 六、写在最后与开源地址

`opencode-models-discovery` v2.0.0 的目标，绝不仅仅是“让一个功能在新的版本上跑起来”，而是探索并践行**现代 AI CLI 工具生态中插件的标准工程形态**。

当凭证由宿主守护、状态由宿主固化、交互经由 RPC 解耦，插件得以卸下沉重的“基础设施包袱”，全身心聚焦于模型发现与元数据赋能本身。

- **GitHub 仓库**：[https://github.com/yuhp/opencode-models-discovery](https://github.com/yuhp/opencode-models-discovery)
- **npm 包主页**：[https://www.npmjs.com/package/opencode-models-discovery](https://www.npmjs.com/package/opencode-models-discovery)

欢迎大家在 OpenCode 环境中安装体验！如有任何建议、问题或 Provider 兼容性反馈，欢迎在 GitHub 提交 Issue 与 Pull Request。
