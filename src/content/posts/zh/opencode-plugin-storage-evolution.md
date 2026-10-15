---
title: "OpenCode 插件状态存在哪？从 XDG 文件缓存到宿主 Storage"
description: "OpenCode 插件 V1 到 V2 的第二道关键边界重构：插件的持久化状态到底该存在哪？本文深入剖析从 V1 插件自行维护 XDG 目录、JSON 文件与原子重命名，到 V2 宿主提供 Storage 抽象、插件仅定义业务策略与双生命周期模型隔离的安全演进。"
publishedAt: 2026-10-15T16:00:00+08:00
lang: zh
tags:
  - OpenCode
  - 架构设计
  - 存储设计
  - 插件开发
  - TypeScript
cover:
  src: /images/posts/opencode-plugin-storage-evolution/cover.png
  thumbnail: /images/posts/opencode-plugin-storage-evolution/cover-thumb.png
  alt: 图示 OpenCode 插件存储机制从 V1 插件自行维护 XDG 本地文件演进到 V2 宿主接管统一 Storage 抽象与生命周期隔离。
translationSlug: opencode-plugin-storage-evolution
---

> **导读**：这是“OpenCode 插件 V1 到 V2：架构演进合集”的第二篇专题文章。在上一篇厘清了凭证的归属边界之后，另一个直接影响插件稳定性的问题浮出水面：**插件的持久化状态到底应该存放在哪里？** 在 V1 中，插件被迫兼任“小型存储引擎”，自行计算目录、读写 JSON 并保障写入原子性；而在 V2 中，宿主通过 `ctx.storage` 提供了统一且可替换的存储抽象。本文以 `opencode-models-discovery` 插件为例，系统解析从 XDG 磁盘文件到 Host Storage 的演进全貌，以及如何实现短期发现缓存与长期模型覆盖的物理隔离。

---

## 从 XDG 文件缓存到 Host Storage

在插件早期，为了减少对 Provider `/v1/models` 端点的重复调用，通常需要把模型列表缓存到本地。然而在两代架构之间，状态存储的职责分配发生了一次根本性的倒置：

文中所述的 V2 Host Storage 缓存机制随插件 `v1.9.0` 引入，而在 `v2.0.0-rc.1` 中，基于 Host Storage 的持久化模型覆盖（Persistent Model Overrides）与物理隔离测试也已正式落地。

---

## V1：插件自己兼任一套小型文件存储

在 OpenCode V1 中，discovery cache 通常存放在操作系统的 XDG 数据目录下，路径类似：

```text
$XDG_DATA_HOME/opencode-models-discovery/providers/
  provider-<encoded-provider-id>.json
```

这意味着插件除了要专注于模型发现本身的业务逻辑，还必须全程承担底层文件系统的全部脏活累活：

- 计算不同操作系统规范下的数据目录；
- 递归创建 `providers` 目录并管理读写权限；
- 读取并反序列化 JSON；
- 校验数据版本与 Provider identity 身份；
- 计算并判断 TTL 有效期；
- 写入临时文件，并通过原子 `rename` 规避并发损坏；
- 捕捉并清理崩溃遗留的临时碎片。

典型的底层写入流程如下：

```typescript
await fs.mkdir(path.dirname(statePath), { recursive: true, mode: 0o700 })
await fs.writeFile(temporaryPath, JSON.stringify(state, null, 2), {
  encoding: "utf8",
  mode: 0o600,
})
await fs.rename(temporaryPath, statePath)
```

这种做法虽然在初期能跑通，但本质上让一个上层插件硬生生实现了一套微型文件数据库，给插件代码引入了过度的复杂度与运维脆弱性。

---

## 状态混杂：V1 缓存把什么揉在了一起？

在 V1 中，每个 Provider 的持久化状态文件结构通常是高度聚合的：

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

这里混合了几类**生命周期完全不同**的数据：

- **远端发现的原始模型**（网络瞬时产物，短生命周期）；
- **过滤与增强（Enrichment）后的模型**（计算衍生状态，随业务逻辑变化）；
- **用户针对单个模型的 Override**（用户自定义偏好，属于强持久化配置）；
- **Provider Endpoint 与缓存身份信息**。

模型发现缓存是临时的、TTL 驱动的，甚至随时可以清空重拉；而用户配置的 Overrides 是长期的、高价值的，绝不应随意被刷新丢弃。将生命周期迥异的数据打包存放在同一个物理文件中，必然导致数据清理、模型升级和版本迁移变得极其脆弱。

---

## V2：宿主提供 Storage，插件定义缓存语义

OpenCode V2 官方对持久化体系的重构同样值得充分赞赏。它不再将数据持久化的底层细节推给插件开发者，而是由宿主在核心层面提供高度可靠、统一托管的存储服务 `ctx.storage`：

```typescript
ctx.storage.get(key)
ctx.storage.set(key, value)
ctx.storage.remove(key)
```

在插件端，我们只需设计一个非常轻量、纯粹的适配层，即可将宿主存储能力对接进通用缓存策略：

```typescript
export function createV2StorageCache(storage) {
  return {
    get: storage.get,
    set: storage.set,
    remove: storage.remove,
  }
}
```

这层适配器**完全不需要关心**：

- 数据物理保存在哪个文件目录或数据库中；
- 宿主底层使用的是文件系统、SQLite 还是内存键值对；
- 宿主如何实现跨进程生命周期保护与并发锁；
- 宿主如何在多个插件之间实现存储隔离与资源配额。

它仅仅将宿主的 Storage 原语映射为业务所需的标准接口，做到了极致解耦。

---

## 后端与策略的彻底解耦

在 V2 架构中，一个极为重要的工程重构是**将“存储后端”与“缓存语义策略”彻底分离开来**：

```text
src/v2/storage-cache.ts
  → 仅作为宿主 Storage 的通用适配器

src/core/discovery-cache.ts
  → 纯领域逻辑：负责 Cache Key 生成、Identity 比对、TTL 判定与防御性脱敏
```

具体的业务缓存策略包括：

### 1. 强隔离命名空间
```typescript
export function discoveryCacheKey(namespace: string, providerID: string): string {
  return `${namespace}:provider:${encodeURIComponent(providerID)}`
}
```
V2 使用显式的专属命名空间，防止与第三方插件或历史 V1 磁盘缓存产生键名冲突。

### 2. Provider Identity 完整性校验
缓存绝不能仅仅按 `providerID` 简单盲取，还必须校验以下关键维度：
- Provider ID
- Base URL
- Models endpoint
- Model info format 与 endpoint

一旦用户修改了自定义 Base URL 或元数据增强参数，旧缓存将立即被判定为身份失效，绝不会将脏数据透传给上层。

### 3. 自主控制的 TTL 判定
```typescript
isDiscoveryCacheFresh(fetchedAt, ttlSeconds)
```
缓存的保鲜期属于插件的领域业务策略，由插件统一决策，而不受交互界面或底层存储的硬编码绑架。

### 4. 递归敏感字段清洗（Sanitization）
缓存写入前必须经过深度脱敏：
```typescript
if (/^(api[-_]?key|authorization|token|password|secret|credentials?)$/i.test(key)) {
  continue
}
```
即便 Provider 上游响应意外夹带了敏感凭证或身份鉴权串，也绝不会进入本地持久化存储。

---

## V2 缓存的高容错运行闭环

在 V2 中，一次标准的缓存读写流程遵循严格的分层容错防御：

```text
refresh 触发
  ↓
根据 Provider Identity 计算确定性 Cache Key
  ↓
调用 ctx.storage.get()
  ↓
[若缓存新鲜]：直接复用 rawModels 与 enrichment 结果
[若缓存过期]：向 Provider 发起远端发现请求
[若 force=true]：主动绕过缓存强制拉取
  ↓
通过共享 discovery pipeline 完成过滤与增强
  ↓
异步执行 ctx.storage.set()
  ↓
原子替换内存 inventory
```

**关键设计原则**：缓存写入或读取失败绝不能阻断整个模型发现主流程。缓存在架构中扮演的是“性能提升与断网韧性兜底”角色，而不是模型发现的唯一依赖。

---

## 进程解耦：跨进程操作统一收归 Server

在 Server 与 TUI 物理分离的现代架构下，缓存操作严格受到控制：

```text
TUI 前端界面
  ↓ (强类型 RPC: cacheInspect / cacheClear)
Server 后端服务
  ↓
ctx.storage
```

TUI 界面无权直接绕过 Server 访问 `ctx.storage`。所有与缓存相关的判定、查看（`cacheInspect`）以及清空（`cacheClear`）操作全部收归 Server 单点管理，消除了多进程同时读写篡改状态的并发隐患。

---

## 双生命周期模型：Cache 与 Override 的物理隔离

在 `v2.0.0-rc.1` 中，基于 Host Storage 的模型覆盖（Model Overrides）正式闭环落地，并严格贯彻了**按生命周期分层存储**的原则：

```text
opencode.models-discovery.v2:provider:<id>
  → 远端发现结果：短生命周期、可失效、可随时安全清空

overrides:<providerID>:<modelID>
  → 用户持久化覆盖：长生命周期、版本化结构体、不可随缓存清理误删
```

### 1. 版本化 Schema 与前缀检索
每个模型覆盖在 `ctx.storage` 中单独存为一条版本化记录：

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

通过明确的前缀格式（`overrides:<providerID>:<modelID>`），Server 能够高效调用宿主的 `storage.scan({ prefix })` 批量检索，互不干扰。

### 2. 清理隔离：清空缓存绝不误伤用户配置
模型发现缓存经常需要被用户按需重置。而在实现中，`cacheClear` 仅匹配和删除 `opencode.models-discovery.v2:provider:` 前缀的键，绝不会触碰任何 `overrides:` 命名空间下的记录。测试套件（`test/v2/cache-rpc.test.ts`）对此进行了严格防退化断言：**无论执行多少次 Clear All Discovery Caches，用户自定义的 Overrides 纹丝不动**。

### 3. 数据写入强校验与白名单机制
写入 Host Storage 的 Override 必须通过严格校验：
- 白名单受限于：`name`、`limit`、`capabilities`、`reasoning`、`attachment`、`cost`、`compatibility`、`variants`；
- 上下文上限 `limit.context` / `limit.output` 必须为合法正整数；
- 严禁任何敏感凭证字段；
- 读取时自动过滤损坏格式，确保系统鲁棒性。

---

## V1 与 V2 存储的物理隔离保障

V1 磁盘文件与 V2 Host Storage 的数据模型完全不同：

```text
V1：Provider state + models + rawModels + overrides（单文件打包，存放在 XDG 目录）
V2：独立的 discovery cache 与 overrides:<providerID>:<modelID>（由宿主 Storage 接管）
```

在 `v2.0.0-rc.1` 中，`test/v1-v2-isolation.test.ts` 构建了专门的隔离性断言：
1. **命名空间与路径物理隔离**：V2 缓存使用独立的命名空间，V1 使用专属 XDG 目录，彼此完全互不干扰；
2. **模型识别隔离**：V1 的存储读取器绝对不会将 V2 的 `overrides:*` 键识别为 V1 格式。

因此，V2 没有背负强行迁移并解析 V1 旧格式文件的历史包袱，既保持了核心精炼，又杜绝了升级过程中的隐性 Bug。

---

## 结语：存储后端属于宿主，缓存策略属于插件

一个健壮的现代插件体系，其状态边界必须清晰划分：

- **宿主（Host）**：提供安全、高可用、可插拔的 Storage 基础设施，管好持久化与并发锁；
- **插件（Plugin）**：决定存什么业务实体、何时失效、如何比对版本并确保数据脱敏；
- **状态分层**：将短期可再生的缓存与长期不可丢失的用户配置在存储层彻底物理隔离。

V1 的思考局限在“我的文件该写到哪里”，而 V2 引导我们思考“这份状态的真正属主是谁，生命周期有多长”。理解了这一点，插件状态管理的重构也就水到渠成。

---

## 项目与发布资源

本文介绍的 Host Storage 适配、双生命周期隔离及模型覆盖存储机制均已在开源项目中经过严密测试与交付：

- **GitHub Release**：[`opencode-models-discovery v2.0.0-rc.1`](https://github.com/yuhp/opencode-models-discovery/releases/tag/v2.0.0-rc.1)（包含完整的 Host Storage 适配器、双生命周期隔离与自动化测试）
- **npm Package**：[`opencode-models-discovery@2.0.0-rc.1`](https://www.npmjs.com/package/opencode-models-discovery/v/2.0.0-rc.1)（面向 OpenCode V1/V2 的双模平滑共存分发包）
