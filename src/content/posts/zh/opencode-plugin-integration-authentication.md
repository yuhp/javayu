---
title: "OpenCode 插件凭证归谁管？从凭证文件嗅探到宿主 Integration API"
description: "OpenCode 插件 V1 到 V2 的第一道关键边界重构：凭证归谁管理？本文深入剖析从 V1 嗅探 XDG auth.json 凭证文件与环境变量回退，到 V2 基于 Integration Connection API、密钥生命周期隔离与严防 Overrides 凭证后门的安全架构实践。"
publishedAt: 2026-10-15T10:00:00+08:00
lang: zh
tags:
  - OpenCode
  - 安全架构
  - 凭证管理
  - 插件开发
  - TypeScript
cover:
  src: /images/posts/opencode-plugin-integration-authentication/cover.png
  thumbnail: /images/posts/opencode-plugin-integration-authentication/cover-thumb.png
  alt: 图示 OpenCode 插件凭证流向从 V1 读取文件明文演进到 V2 通过 Integration API 与严格脱敏守卫的安全流向。
translationSlug: opencode-plugin-integration-authentication
---

> **导读**：这是“OpenCode 插件 V1 到 V2：架构演进合集”的第一篇专题文章。在插件架构重构中，最敏感也最关键的变革莫过于**安全凭证的责任归属**。在 V1 中，插件通常自行承担寻找、读取并解析宿主认证文件的“全能”职责；而在 V2 中，宿主通过 Integration 模块全面收敛了凭证的生命周期。本文以 `opencode-models-discovery` 插件为例，系统复盘从文件硬编码到 Integration API 的演化细节，以及如何通过字段白名单与防御性脱敏杜绝凭证泄露。

---

## 从凭证文件嗅探到宿主 Integration API

最初，模型发现插件只需要获取 Provider 的 API key 并请求模型列表。然而在两代架构之间，凭证处理方式发生了根本性的分水岭：

文中所述的 Integration 认证机制随插件 `v1.10.0` 落地，并在 `v2.0.0-rc.1` 中正式确立为 OpenCode V2 唯一受支持的稳定凭证通道。

---

## V1：插件自行寻找认证信息

在 OpenCode V1 中，模型发现通常需要获取 Provider API key。插件为了保证兼容性，往往需要自行维护一套复杂的探测优先级：

```text
provider.<id>.options.apiKey
  ↓
OpenCode resolved provider
  ↓
OPENCODE_AUTH_CONTENT
  ↓
$XDG_DATA_HOME/opencode/auth.json
```

在具体实现中，插件甚至需要根据 XDG 规范和当前的宿主客户端拼装认证文件路径：

```typescript
function getHostAuthFile(): string | undefined {
  if (!xdgData) return undefined

  const hostClient = detectHostClient()
  return path.join(xdgData, hostClient, "auth.json")
}
```

随后直接从磁盘读取并反序列化 JSON：

```typescript
const auths = JSON.parse(await fs.readFile(file, "utf8"))
return auths[providerName]
```

这段逻辑在 V1 早期是实用的兼容方案，但从架构上看，它迫使插件知道了过多宿主的私有实现细节：

- 认证文件存放在操作系统的哪个物理目录；
- 认证文件的具体名称与序列化格式；
- 宿主是 OpenCode 还是 Mimocode，两者的路径如何区分；
- 认证对象内部的明文字段结构；
- 环境变量 `OPENCODE_AUTH_CONTENT` 的回退解析逻辑。

---

## 文件强依赖的反模式与安全隐患

直接读取认证文件不仅脆弱（路径或格式稍有变化便会静默失效），更严重的是它模糊了**宿主与插件的安全信任边界**：

```text
宿主负责保存凭证
  VS
插件负责猜测凭证存在哪里
```

这种模式会导致以下典型问题：

1. **宿主存储变更即崩溃**：宿主一旦重构存储实现（如引入 Keychain 或加密数据库），插件直接静默失效；
2. **多宿主兼容包袱沉重**：插件需要维护兼容多个宿主、多个历史版本文件格式的死代码；
3. **私有文件沦为非正式契约**：磁盘文件变成了未经版本控制的事实 API；
4. **插件承担不必要风险**：插件需要编写大量文件 IO、权限容错及明文解析代码；
5. **多进程并发竞争**：在 Server 与 TUI 分离的架构下，不同进程可能各自并发访问认证文件。

---

## V2：基于 Integration API 的声明式连接

OpenCode 官方在 V2 中对凭证机制的升级非常值得肯定。它彻底摒弃了以往直接将 `auth.json` 暴露在磁盘上的明文文件模式，改为由宿主在核心内部对敏感凭证进行统一的加密托管与生命周期管理。

这一重构不仅极大提升了宿主层面的安全基线，避免了本地明文密钥被意外读取或泄漏，更关键的是——它为插件生态提供了一套设计优美、公开且类型完备的 Integration Connection API：

```typescript
const connection = await ctx.integration.connection.active(integrationID)
const credential = connection
  ? await ctx.integration.connection.resolve(connection)
  : undefined
```

在插件启动的 `setup` 阶段，插件仅需为支持的 Provider 声明其所需的 Integration 方法：

```typescript
await ctx.integration.transform((draft) => {
  draft.method.update({
    integrationID,
    method: { type: "key", label: "API key" },
  })
})
```

在后续模型刷新时，插件只需调用公开 API 获取当前活跃凭证，**全程无需接触任何底层宿主文件与存储细节**。

---

## 生产级凭证解析优先级

在生产级实现（`src/v2/credential-resolver.ts`）中，V2 架构建立了一套明确且安全的收敛链路：

1. 用户在配置文件中显式配置的 `providers.<id>.settings.apiKey`；
2. 宿主已解析好的 `provider.apiKey`；
3. 用户在 settings 中显式绑定的 `integrationID` 对应连接；
4. 插件根据 Provider ID 自动推导的标准默认 Integration ID；
5. Provider ID 本身命名的回退连接；
6. 若上述均无凭证，则以无鉴权方式尝试请求本地/私有服务（如 Ollama 或 LocalAI）。

针对不同类型的连接，凭证解析器做到了强类型适配：

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

## 凭证生命周期的极简压缩

对比两代架构的凭证生命周期，差异显而易见：

### V1 时代（漫长且充满泄漏暴露面）
```text
插件定位物理文件
  ↓
读取本地磁盘文件
  ↓
解析出全局凭证大对象
  ↓
提取指定 provider key
  ↓
持久持有并用于请求
```

### V2 时代（即取即用、阅后即焚）
```text
宿主统一管理连接安全
  ↓
插件调用 active() 与 resolve()
  ↓
仅在当前 Discovery 请求上下文中瞬时消费 credential
  ↓
请求结束即释放，内存不长期驻留 secret
```

这并非简单的函数调用置换，而是把**凭证的存储、更新、加解密与保护职责完整归还给宿主**。

---

## 严格划定数据安全红线：Secret 绝不能去哪

在 V2 架构中，已解析的 Secret 仅允许在当前 Discovery HTTP 请求中瞬时存在，**严禁进入任何持久化与展示层**：

### 绝对禁止携带 Secret 的区域：
- ❌ **Host Storage**（包括本地 discovery-cache 与 model overrides）；
- ❌ **Provider Model Draft**（写入 Registry 的模型草案）；
- ❌ **RPC 返回值**（跨进程通信包）；
- ❌ **状态汇总输出**（如 `models_discovery_status` CLI 输出）；
- ❌ **TUI 界面元素**（Dialog、Toast、Console 列表）；
- ❌ **日志与错误堆栈**。

### 允许暴露给上层与 UI 的模型状态元数据：
- ✅ Provider ID 与 Model ID
- ✅ API 实际请求 Model ID
- ✅ Context Limits（输入/输出上下文上限）
- ✅ Capabilities（如视觉、工具调用等）
- ✅ Variants 与 Reasoning 配置

---

## 模型覆盖（Overrides）严禁作为凭证后门

在 `v2.0.0-rc.1` 中，插件支持了持久化模型覆盖（Persistent Model Overrides），允许用户在 TUI 中微调模型参数。这一灵活能力也带来了新的攻击面：**必须防止恶意或误操作将 API Key 或 Authorization 请求头持久化写入 overrides 中**。

为此，`src/v2/overrides.ts` 设立了严密的主动防御与敏感字段正则守卫：

```typescript
const SENSITIVE_KEYS = /(?:api[_-]?key|authorization|headers?|token|password|secret|credential)/i
```

任何写入请求（无论是顶层属性还是嵌套的 `compatibility` 对象），一旦键名命中敏感正则，立即拦截并抛出硬错误：

```text
Error: Override field is not allowed: patch.apiKey
```

同时，写入白名单受到严格约束，仅放行：`name`、`limit`、`capabilities`、`reasoning`、`attachment`、`cost`、`compatibility`、`variants`。

这确保了无论是远端发现、本地缓存还是用户自定义覆盖，**整个持久化存储层始终保持 100% Credential-Free**。

---

## V1 与 V2 的兼容性边界隔离

在维护双模插件的过程中，V2 适配器严格切断了对以下 V1 遗留特性的回退：

- 不读取 V1 `auth.json` 磁盘文件；
- 不读取 `OPENCODE_AUTH_CONTENT` 环境变量；
- 不侵入宿主内部未公开的私有数据结构。

这种物理隔离确保了 V1 与 V2 虽能共存于同一个 npm 包中，但其认证链路互不污染。两代适配器共享的仅是**如何拿已解析好的 Key 发起模型列表请求**的纯领域逻辑，而非**如何钻进宿主内部找 Key**。

---

## 结语：宿主拥有凭证，插件消费凭证

OpenCode V2 在安全架构上的进步是显而易见的：**从早期简单粗暴的明文文件落盘，进化为由宿主内部专业托管凭证状态**，这不仅是一次 API 升级，更是一次成熟开发者工具应有的安全基线跃升。

现代插件体系的最佳安全实践正在于明晰职责边界：

- **宿主（Host）**：负责凭证的安全加密、多租户管理、用户授权、动态切换与物理存储；
- **插件（Plugin）**：负责声明所需的鉴权类型，并在调用外部服务时安全消费凭证。

一旦插件开始拼接物理路径、反序列化宿主私有文件或读取未受控的环境变量，就意味着它正在与宿主的实现细节强行耦合。OpenCode V2 提供的这套凭证治理模式，为 CLI 插件生态树立了一个兼顾安全性与工程优雅性的好标杆。

---

## 项目与发布资源

本文探讨的凭证管理实践与防御性脱敏代码均已开源并在实际版本中交付验证：

- **GitHub Release**：[`opencode-models-discovery v2.0.0-rc.1`](https://github.com/yuhp/opencode-models-discovery/releases/tag/v2.0.0-rc.1)（包含完整的 Integration 认证模块与模型覆盖防御守卫）
- **npm Package**：[`opencode-models-discovery@2.0.0-rc.1`](https://www.npmjs.com/package/opencode-models-discovery/v/2.0.0-rc.1)（面向 OpenCode V1/V2 的双模平滑升级分发包）
