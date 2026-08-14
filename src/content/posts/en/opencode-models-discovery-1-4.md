---
title: "opencode-models-discovery 1.4.0: Continuing to Improve Model Metadata Injection"
description: "From vLLM and persisted caching to metadata enrichment for LM Studio, Bifrost, and OmniRoute, opencode-models-discovery 1.4.0 makes dynamic model discovery in OpenCode faster, more complete, and easier to customize."
publishedAt: 2026-08-14
lang: en
tags:
  - OpenCode
  - LLM
  - Local models
  - Open source
draft: true
translationSlug: opencode-models-discovery-1-4
---

A little over a month ago, [opencode-models-discovery](https://github.com/yuhp/opencode-models-discovery) officially released `v1.0.0`.

Thanks to community contributions and feedback, the project has now reached `v1.4.0`.

From `v1.0.0` to `v1.4.0`, the work has focused mainly on enriching model metadata for different providers, alongside persisted caching and timeout controls that improve the day-to-day experience.

## Enable Model Metadata Injection Through Explicit Configuration

Many OpenAI-compatible services return only model IDs from `/v1/models`. For OpenCode, though, an ID is only the starting point: context windows, output limits, image and audio modalities, tool calling, reasoning, structured output, and pricing all affect how a model is presented and what it can actually do.

There is no single standard for these OpenAI-compatible extensions. Different services place the information in different endpoints, fields, and formats. Blindly guessing could assign unsupported capabilities to a model; reading only standard fields would still leave users to write substantial per-model configuration by hand.

`opencode-models-discovery` therefore keeps a clear boundary: base discovery always uses the generic model-list interface; provider-specific extension fields are read and mapped only when a provider explicitly enables the corresponding format. If metadata cannot be retrieved or matched safely, discovery still succeeds and unknown capabilities remain unknown.

## From 1.0.0 to 1.4.0: Four New Metadata Enrichment Modes

`1.0.0` already supported enriching model capabilities through the public `models.dev` index or LiteLLM's model-information endpoint. By `1.4.0`, four more provider-selectable enrichment modes had been added:

- **`vllm`** reads the non-standard `max_model_len` from `/v1/models` to populate context and output limits. Base discovery remains available when the field is absent.
- **`lmstudio`** reads LM Studio's native `/api/v1/models` inventory after standard discovery, adding display names, vision, tool use, reasoning, variants, and context information. LM Studio does not report an independent output limit, so the plugin does not mistakenly use the context length as one.
- **`bifrost`** interprets inline metadata in Bifrost's `/v1/models` response, mapping token limits, input and output modalities, and pricing, while normalizing values such as `SPEECH` into forms OpenCode recognizes.
- **`omniroute`** interprets inline metadata in OmniRoute's `/v1/models` response, adding context and token limits, modalities, attachments, reasoning, tool calling, structured output, and temperature support. If input modalities are absent, `capabilities.vision` serves as a fallback for image input.

Here is an LM Studio 0.4.0+ example. The plugin discovers models through the standard interface, then reads the native inventory to enrich their capabilities:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-models-discovery@latest"],
  "provider": {
    "lmstudio": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "LM Studio (local)",
      "options": {
        "baseURL": "http://127.0.0.1:1234/v1",
        "modelsDiscovery": {
          "enabled": true,
          "modelInfoFormat": "lmstudio"
        }
      }
    }
  }
}
```

As of `v1.4.0`, the available metadata formats are `bifrost`, `litellm`, `lmstudio`, `models.dev`, `omniroute`, and `vllm`. They are configured independently per provider, so the same OpenCode configuration can use the right source for a local LM Studio instance, a remote gateway, and other compatible services.

### Enrichment Modes at a Glance

The following table lists the gateways, runtimes, and metadata providers that can enrich raw model-list data. Apart from `models.dev`, each format applies to an OpenAI-compatible provider you have already configured. The plugin does not detect a gateway and enable an enrichment mode automatically; choose it explicitly with `modelInfoFormat`.

| Configuration value | Gateway / data source | Metadata source | Key information enriched |
| --- | --- | --- | --- |
| `bifrost` | Bifrost AI Gateway | Inline | Context and input/output limits, modalities, input/output pricing; normalized names when `smartModelName` is enabled |
| `litellm` | LiteLLM Proxy or a compatible model-information service | External | Token limits, reasoning support, and reasoning-effort variants; non-chat models are skipped by default |
| `lmstudio` | LM Studio 0.4.0+ | External | Display names, context, vision, tool use, reasoning, and reasoning variants |
| `omniroute` | OmniRoute | Inline | Context and token limits, modalities, attachments, reasoning, tool calling, structured output, and temperature support |
| `vllm` | vLLM or a compatible service that exposes vLLM fields | Inline | Context and output limits; it does not infer modalities, tool use, or reasoning capabilities |
| `models.dev` | The public models.dev metadata index, for models that can be matched safely | External | Token limits, attachments, reasoning, tool calling, structured output, temperature, modalities, and more |

In every mode, missing fields, failed requests, or uncertain matches preserve the base discovery result rather than causing the plugin to guess at capabilities.

## Use Persisted Caching to Speed Up OpenCode Startup

A model-list request to a local service is usually quick. But discovery can become noticeable at startup when a configuration uses remote gateways, multiple providers, or additional metadata endpoints.

`v1.2.0` therefore added a provider-level persisted cache. Once enabled, the plugin stores model configurations after successful filtering and metadata enrichment. On later startups within the TTL, it injects the cached result directly—without calling the model-list endpoint, resolving credentials, or repeating metadata enrichment.

```json
{
  "modelsDiscovery": {
    "enabled": true,
    "cache": {
      "enabled": true,
      "ttlSeconds": 86400
    }
  }
}
```

The cache is isolated per provider and validates the provider ID, normalized base URL, model endpoint, configuration schema version, and TTL. Cache files live in the plugin's own XDG data directory and never contain API keys, authentication headers, or OpenCode/MiMoCode authentication data. Expired, damaged, unreadable, or unwritable entries automatically fall back to live discovery instead of blocking startup.

The cache can also retain durable overrides for individual models—useful for preserving a small number of manually verified capabilities or variants. These are stored separately from plugin-generated cache data, so a refresh does not overwrite your customizations.

## Let Us Wait for Providers That Respond More Slowly

Some local servers respond slowly immediately after startup, and some gateway model catalogs take longer than the default wait. `v1.3.1` added a provider-level `timeoutMs` setting, with a default of `3000` milliseconds:

```json
{
  "modelsDiscovery": {
    "timeoutMs": 15000
  }
}
```

The setting applies to both the provider's model-list request and provider-specific metadata requests. OpenCode normally allows `5000` milliseconds for discovery during startup. Only when a provider configures a larger `timeoutMs` does the plugin raise that wait budget, giving a genuinely slower discovery request time to finish before startup continues while avoiding an unlimited wait for every provider.

## Explicit Configuration Entries Are No Longer Overwritten

Dynamic discovery answers “which models exist?”, but users may still want to add preferences to a particular model—for example, a high-reasoning-effort variant or provider-specific `options`.

Previously, when a model was both discovered and present under `provider.<id>.models`, parts of the explicit configuration could cause its discovered name, limits, modalities, or capability metadata to be lost. `v1.4.0` changes the assembly order: matching explicit model configuration is now merged recursively on top of the configuration obtained through discovery or the cache.

```json
{
  "provider": {
    "gateway": {
      "models": {
        "example-model": {
          "variants": {
            "high": {
              "reasoningEffort": "high"
            }
          }
        }
      }
    }
  }
}
```

Nested objects are merged; arrays and scalar values are replaced by the explicit value. The discovered model ID remains authoritative. Explicit models that were not discovered can still exist independently. The same rules apply whether a model comes from live discovery or a valid cache, and explicit configuration is never written into the plugin cache.

In short, automatic discovery and manual control are no longer an either/or choice: the plugin maintains the public facts that change, while you maintain the small set of differences that are genuinely yours.

## A Clearer Model Assembly Pipeline

From `1.0` to `1.4`, the project has developed the following predictable processing order:

```text
Live model discovery (with optional provider-specific metadata enrichment)
  or a valid cache (which already contains prior discovery, filtering, and enrichment results)
  → saved plugin-managed per-model overrides
  → matching explicit provider.<id>.models configuration
  → undiscovered explicit models retained as standalone models
```

The purpose of this order is not to make configuration more complex, but to clarify each data source's responsibility: providers define which models currently exist; optional enrichment supplies capabilities known to the provider; and user overrides and explicit configuration express the final choices.

If your service exposes only standard `/v1/models`, base discovery is enough. If it is vLLM, LM Studio, Bifrost, or OmniRoute, enable the corresponding format as needed. There is no reason to enable every enrichment mode just to make a configuration look complete.

Complete configuration guidance, cache details, and community provider examples are available in the [GitHub repository](https://github.com/yuhp/opencode-models-discovery). The project remains MIT licensed, and issues, pull requests, and configuration examples based on real use cases are welcome.
