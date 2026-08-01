---
title: "Star History 凉凉？5 分钟部署一套属于自己的 GitHub 星标统计服务"
description: "GitHub 收紧 stargazers API 后，使用 Cloudflare Worker、KV 与自有 GitHub Token，私有化部署明暗主题兼容的 GitHub 星标历史 SVG 服务。"
publishedAt: 2026-08-02
lang: zh
tags:
  - star-history
  - GitHub
  - Cloudflare Worker
  - 开源
  - Serverless
translationSlug: starfolio-worker
---

不少开源项目的 README 曾经都有一张熟悉的 Star History 星标增长曲线。但从 2026 年 7 月起，许多原本正常显示的图表陆续失效：不是项目没有 Star，也不是 Star History 服务停止运行，而是 GitHub 改变了获取星标历史数据的权限规则。

[starfolio-worker](https://github.com/yuhp/starfolio-worker) 是我为这个变化做的一个轻量替代方案。它运行在自己的 Cloudflare 账户中，按计划从 GitHub 获取数据、生成 SVG 并缓存；README 只读取生成后的公开图片。部署完成后，不再需要把 GitHub Token 交给第三方图表服务。

## 为什么以前的嵌入方式不再可靠

星标总数是公开数据，但一条增长曲线还需要知道“谁在什么时候 Star 了仓库”。这来自 GitHub 的 `GET /repos/{owner}/{repo}/stargazers` 接口，并通过 `application/vnd.github.star+json` 响应头取得每条记录的 `starred_at` 时间戳。

GitHub 现已将这个接口限制为仓库的**管理员和协作者**。因此，即使仓库是公开的，第三方图表服务的服务器也不再能代表任意项目读取完整的星标时间数据；使用者必须提供一个能访问目标仓库的 GitHub Token。

这带来了一个比“图表坏了”更重要的问题：现在可用的 Token 不再只是过去那种无 scope 的只读凭证。

## 为读取星标历史，具体需要什么 Token

Token 所属的 GitHub 用户首先必须是每个目标仓库的管理员或协作者。在此基础上，根据仓库归属范围选择一种 Token：

| 使用场景 | Token 配置 |
| --- | --- |
| 仓库都在同一个个人账户或组织下 | 创建 Fine-grained personal access token；将 **Resource owner** 设为该账户或组织，**Repository access** 选中需要统计的仓库；授予 **Metadata: Read-only** 与 **Contents: Read and write**。 |
| 需要统计多个 owner / 组织下的仓库 | 创建 Classic personal access token，并授予 **`public_repo`** scope。 |

两个细节很容易忽略：无 scope 的旧 Token 已不能使用；只给 Fine-grained Token 授予 `Metadata: Read-only` 也不够。当前的 stargazers 接口需要内容写权限来验证调用者的协作者访问能力。

这也是为什么这次变化很难靠“再创建一个只读 Token”轻松解决。Fine-grained Token 可以被限制到指定 owner 和仓库，是单一组织场景下更可控的选择；但当一张图需要跨多个 owner 的仓库时，Classic Token 的覆盖范围会更大。

## Token 泄露意味着什么

GitHub Token 是 Bearer Credential：任何拿到它的人都可以以对应 GitHub 用户的身份调用被授权的 API。

Fine-grained Token 的范围可以缩小到指定仓库，但 `Contents: Read and write` 仍不是无害权限。具体影响取决于仓库角色、分支保护和 Token 的额外授权；在没有充分保护的分支上，它可能允许修改仓库内容。Classic `public_repo` 的作用范围通常更广，风险也随之扩大。

这不是说所有第三方服务都会滥用凭证，而是权限模型已经变了：把这样一个 Token 放进公开 README 的加密参数中，或者交给外部服务器解密并实时使用，需要额外信任对方的实现、运维和日志边界。

更稳妥的做法是将 Token 保存在自己可控制的 Secret 系统中，配合最小仓库范围、合理有效期和分支保护。下面的部署方案正是这样做的。

## Starfolio Worker 如何工作

整套服务由 Cloudflare Worker、KV 和 Cron Trigger 组成：

1. Worker 每小时读取 `src/projects.js` 中配置的仓库。
2. 它先读取仓库创建时间和当前 Star 总数，再从 stargazers 接口取得采样的时间戳。
3. 服务把累计 Star 数分成 15 个等距区间，只请求各区间边界所在的页面；加上仓库创建时的 0 Star 与当前总数两个端点，便能绘制平滑曲线。
4. 浅色和深色两份 SVG 一并写入 Cloudflare KV。
5. README 或浏览器请求图表时，Worker 只从 KV 返回已生成的静态 SVG，不会实时请求 GitHub API。

因此，每个仓库刷新一次最多大约 15 次 GitHub API 请求，而普通图表访问只需要一次 KV 读取。首次部署尚未生成缓存时，接口会返回 `503` 和 `Retry-After: 10`，同时在后台启动刷新；后续请求即可得到 SVG。若刷新暂时失败，已有的上一版图表会继续提供服务。

Token 以 Cloudflare Worker Secret 的形式保存，既不进入源码，也不会通过图表接口返回给访问者。

## 五分钟部署

完整的 Cloudflare 与 GitHub Actions 配置见项目的 [部署说明](https://github.com/yuhp/starfolio-worker/blob/main/docs/deploy.md)。核心步骤如下：

### 1. 配置要统计的仓库

在 `src/projects.js` 中，把 URL 路径映射为 GitHub 的 `owner/repository`：

```js
export const projects = {
  "opencode-models-discovery": "yuhp/opencode-models-discovery",
  "another-project": "owner/repository",
};
```

### 2. 创建 Cloudflare KV 与部署凭证

在 Cloudflare 创建一个 KV Namespace，并在 GitHub 仓库中配置：

- Secrets：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、`STAR_HISTORY_TOKEN`
- Variables：`CLOUDFLARE_WORKER_NAME`、`CLOUDFLARE_KV_NAMESPACE_ID`

`STAR_HISTORY_TOKEN` 会在单独的同步工作流中写入 Worker 的 `GITHUB_TOKEN` Secret；它不会被提交到仓库，也不会出现在生成的部署配置中。

### 3. 发布并验证

推送到 `main`，或手动运行 **Deploy Worker** 工作流。首次配置或轮换 Token 后，再运行一次 **Sync Star Token** 工作流。

部署成功后，先检查健康接口：

```bash
curl https://<worker-name>.<account-subdomain>.workers.dev/
```

再请求一个已配置项目的图表。第一次可能返回 `503`，等待十秒后重试：

```bash
curl -I "https://<worker-name>.<account-subdomain>.workers.dev/star-history/opencode-models-discovery?theme=dark"
```

## 在 README 中自动适配深色与浅色主题

`<picture>` 可以根据读者的系统主题自动切换 SVG。将域名和项目名换成自己的即可：

下面是 `opencode-models-discovery` 当前由 Starfolio Worker 生成的两份实际图表：

**浅色主题**

[![opencode-models-discovery 的浅色 Star History 图表](https://sh.yuhp.dev/star-history/opencode-models-discovery?theme=light)](https://sh.yuhp.dev/star-history/opencode-models-discovery?theme=light)

**深色主题**

[![opencode-models-discovery 的深色 Star History 图表](https://sh.yuhp.dev/star-history/opencode-models-discovery?theme=dark)](https://sh.yuhp.dev/star-history/opencode-models-discovery?theme=dark)

```html
<a href="https://github.com/yuhp/opencode-models-discovery">
  <picture>
    <source
      media="(prefers-color-scheme: dark)"
      srcset="https://sh.yuhp.dev/star-history/opencode-models-discovery?theme=dark"
    />
    <source
      media="(prefers-color-scheme: light)"
      srcset="https://sh.yuhp.dev/star-history/opencode-models-discovery?theme=light"
    />
    <img
      alt="Star History Chart"
      src="https://sh.yuhp.dev/star-history/opencode-models-discovery?theme=light"
    />
  </picture>
</a>
```

它与原来的 Star History `<picture>` 写法兼容，只是图像地址改成了自己的 Worker：深色主题访问 `?theme=dark`，浅色主题访问 `?theme=light`。外层链接也可以换成项目主页、项目 Releases 页或你的图表服务地址。

## 重新把凭证放回自己的边界内

GitHub 的权限调整没有让 Star History 消失，但它改变了实时图表服务可以安全获得数据的方式。自部署不能消除 stargazers 接口本身的权限要求，却能避免把可写 Token 交给外部图表服务。

将 Token 置于自己的 Cloudflare Secret、预先生成并缓存 SVG，再用最小范围和短有效期管理凭证，可以在保持 README 图表体验的同时，把信任边界留在自己手中。
