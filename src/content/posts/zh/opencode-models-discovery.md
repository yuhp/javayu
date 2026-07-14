---
title: "不再手写模型列表：opencode-models-discovery"
description: 一个在 OpenCode 启动时自动发现并合并 OpenAI 兼容 provider 模型列表的插件。
publishedAt: 2026-07-12
lang: zh
tags:
  - OpenCode
  - LLM
  - 开源
translationSlug: opencode-models-discovery
---

在 OpenCode 中接入本地模型、LLM 网关或 OpenAI 兼容服务时，模型列表往往不是固定的。

上游账户切换、模型新增或下线，都会让 provider 暴露的模型发生变化。如果每次都手动维护 `opencode.json`，不仅麻烦，也很容易让配置过期。

[opencode-models-discovery](https://github.com/yuhp/opencode-models-discovery) 是一个 OpenCode 插件：它会在 OpenCode 启动时读取 provider 的模型列表，并自动合并到当前运行的 provider 配置中。

## 创立背景

项目最初参考并受到 [opencode-lmstudio](https://github.com/nicktasios/opencode-lmstudio) 启发。开发这个插件，最初只是因为工作需要：当时需要为公司的 OpenCode 环境接入本地 LLM 路由和网关服务，但上游账户切换或失效会让可用模型列表不断变化。反复手写 `opencode.json` 既耗时，也容易漏掉或写错模型 ID。

因此，项目从一开始就定位为面向任意 OpenAI 兼容 provider 的通用插件，只想先做好一件事：OpenCode 启动时，自动发现 provider 当前暴露的模型。

## 一份推荐配置

下面以 OpenRouter 为例。插件会发现当前可用模型，使用更易读的显示名称，并从 models.dev 为能够安全匹配的模型补齐能力信息。

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-models-discovery@latest"],
  "provider": {
    "openrouter": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "OpenRouter",
      "options": {
        "baseURL": "https://openrouter.ai/api/v1",
        "modelsDiscovery": {
          "enabled": true,
          "smartModelName": true,
          "modelInfoFormat": "models.dev"
        }
      }
    }
  }
}
```

API Key 不必重复写入配置。通过 OpenCode `/connect` 为同名的 `openrouter` provider 保存凭据后，插件会在模型发现时复用它。

## 不只是读取 `/v1/models`

随着日常使用和社区反馈，插件逐步增加了几项实用能力：

- 对任意 OpenAI 兼容 provider 自动发现模型。
- 在 provider 层级独立配置发现开关、模型列表 endpoint 与筛选规则。
- 适配非标准模型列表接口，例如 `/models`。
- 支持 LiteLLM 和 models.dev 的可选模型能力增强。
- 复用 OpenCode `/connect` 凭据，避免在 `opencode.json` 中重复保存密钥。
- 提供 `/models-discovery:config` 和 `/models-discovery:migrate`，协助完成配置和旧配置迁移。

模型元数据增强默认不会访问外部服务。只有显式设置 `modelInfoFormat: "models.dev"` 后，插件才会查询 models.dev；匹配不确定或请求失败时，基础模型发现仍会完成，插件不会猜测模型能力。

## 从真实需求中演进

从 provider 级配置、非标准 endpoint、`/connect` 凭据复用，到 LiteLLM、models.dev 和 LLM 辅助配置，这个插件并非按预设路线图开发，而是在真实使用场景和用户反馈中一步步形成现在的样子。

感谢每一位使用插件、提交 issue、PR 或建议的用户。你们的反馈是 `opencode-models-discovery` 持续改进的重要动力。

项目采用 MIT 协议，完整文档与源码见 [GitHub](https://github.com/yuhp/opencode-models-discovery)。

> `opencode-models-discovery` 是独立社区项目，与 OpenCode 团队没有隶属或合作关系；models.dev 元数据增强使用其公开索引，本项目与 models.dev 也不存在隶属、认可或赞助关系。

## GitHub Star 历史

[![Star History Chart](https://api.star-history.com/chart?repos=yuhp/opencode-models-discovery&type=date&legend=top-left&sealed_token=KOQGKBZHW83kO8-zjAcs-kZ_EPquNV3Iv3WyFgBM_2OiJoo0tumFta-MLS0H_3pAHMtfCd0aElRfRdADRkeIKwmXXBCR19Uiu0DGLjIBOpua9HUhY4oXVuSVQsgUv-WMEzLaAydWz3Ed1k4UT9q0LOY1E4B9a5bWbREs37WBER3sFHHRw4r1UCKsxGl7)](https://www.star-history.com/?repos=yuhp%2Fopencode-models-discovery&type=date&legend=top-left)
