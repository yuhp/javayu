---
title: "Stop Maintaining Model Lists by Hand: opencode-models-discovery"
description: An OpenCode plugin that discovers and merges models from OpenAI-compatible providers at startup.
publishedAt: 2026-07-12
lang: en
tags:
  - OpenCode
  - LLM
  - Open source
translationSlug: opencode-models-discovery
---

When OpenCode is connected to local models, LLM gateways, or OpenAI-compatible services, the available model list is rarely static.

Upstream account changes, newly added models, and model removals can all change what a provider exposes. Maintaining those models manually in `opencode.json` is repetitive and easy to get wrong.

[opencode-models-discovery](https://github.com/yuhp/opencode-models-discovery) is an OpenCode plugin that reads a provider's model list at startup and merges the discovered models into the active provider configuration.

## Why I Built It

The project was inspired by and initially informed by [opencode-lmstudio](https://github.com/nicktasios/opencode-lmstudio). It began as a work need: our OpenCode environment had to connect to local LLM routing and gateway services, where available models could change when upstream accounts changed or became unavailable. Repeatedly editing `opencode.json` was time-consuming and prone to missing or mistyping model IDs.

From the beginning, though, the goal was a general plugin for any OpenAI-compatible provider: let OpenCode discover the models a provider currently exposes at startup.

## A Recommended Configuration

Here is an OpenRouter example. The plugin discovers available models, uses more readable display names, and enriches models that can be matched safely with capability metadata from models.dev.

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

You do not need to duplicate the API key in the configuration. Save credentials for the same `openrouter` provider through OpenCode's `/connect`, and the plugin will reuse them during model discovery.

## More Than `/v1/models`

As the plugin saw more daily use and community feedback, it gained several practical capabilities:

- Automatically discover models from any OpenAI-compatible provider.
- Configure discovery, model-list endpoints, and filters independently at the provider level.
- Support non-standard model-list endpoints such as `/models`.
- Optionally enrich model capabilities through LiteLLM or models.dev.
- Reuse OpenCode `/connect` credentials instead of duplicating secrets in `opencode.json`.
- Provide `/models-discovery:config` and `/models-discovery:migrate` to help configure the plugin and migrate legacy settings.

Metadata enrichment does not contact external services by default. The plugin fetches models.dev only when `modelInfoFormat: "models.dev"` is explicitly configured. If metadata cannot be fetched or matched safely, base model discovery still succeeds and the plugin does not guess at model capabilities.

## Built From Real Use

Provider-level configuration, non-standard endpoints, `/connect` credential reuse, LiteLLM and models.dev enrichment, and LLM-assisted configuration were not part of a fixed roadmap. They emerged from real usage and community feedback.

Thank you to everyone who uses the plugin, files issues, submits pull requests, or shares suggestions. Your feedback is the most important reason `opencode-models-discovery` keeps improving.

The project is licensed under MIT. Find the source code and complete documentation on [GitHub](https://github.com/yuhp/opencode-models-discovery).

> `opencode-models-discovery` is an independent community project and is not affiliated with or endorsed by the OpenCode team. Its optional models.dev enrichment uses the public models.dev index; this project is not affiliated with, endorsed by, or sponsored by models.dev.

## Star History

[![Star History Chart](https://api.star-history.com/chart?repos=yuhp/opencode-models-discovery&type=date&legend=top-left&sealed_token=KOQGKBZHW83kO8-zjAcs-kZ_EPquNV3Iv3WyFgBM_2OiJoo0tumFta-MLS0H_3pAHMtfCd0aElRfRdADRkeIKwmXXBCR19Uiu0DGLjIBOpua9HUhY4oXVuSVQsgUv-WMEzLaAydWz3Ed1k4UT9q0LOY1E4B9a5bWbREs37WBER3sFHHRw4r1UCKsxGl7)](https://www.star-history.com/?repos=yuhp%2Fopencode-models-discovery&type=date&legend=top-left)
