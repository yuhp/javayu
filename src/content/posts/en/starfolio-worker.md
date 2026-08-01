---
title: "Star History Broke — Build Your Own GitHub Star Chart Service in 5 Minutes"
description: "Deploy a private GitHub star-history SVG service with Cloudflare Worker, KV, and your own GitHub token after GitHub restricted access to stargazer timestamps."
publishedAt: 2026-08-02
lang: en
tags:
  - star-history
  - GitHub
  - Cloudflare Worker
  - Open Source
  - Serverless
translationSlug: starfolio-worker
---

Many open-source READMEs used to carry the same familiar Star History growth chart. Since July 2026, though, many of those charts have stopped loading. The projects still have stars and Star History has not shut down. What changed is GitHub's permission model for the data used to reconstruct a star-history curve.

[starfolio-worker](https://github.com/yuhp/starfolio-worker) is a small alternative I built for that change. It runs in your own Cloudflare account, fetches data from GitHub on a schedule, renders SVGs, and caches them. A README then reads a public generated image; it does not need to hand a GitHub token to a third-party chart service.

## Why the old embed approach no longer works reliably

A public star count is not enough to draw a growth curve. The curve needs to know *when* people starred a repository. That information comes from GitHub's `GET /repos/{owner}/{repo}/stargazers` endpoint, using the `application/vnd.github.star+json` media type to include each `starred_at` timestamp.

GitHub now restricts that endpoint to a repository's **admins and collaborators**. A public repository therefore does not mean that a third-party chart server can still retrieve its full star-timestamp history. To build a live chart, the repository owner must provide a GitHub token that can access the repository.

That makes the problem more consequential than a broken image: the token that works today is no longer the old no-scope, read-only credential.

## Exactly which token is required

The GitHub user who owns the token must first be an admin or collaborator of every tracked repository. Then choose a token type based on where the repositories live:

| Scenario | Token configuration |
| --- | --- |
| Repositories under one personal account or organization | Create a fine-grained personal access token. Set the **Resource owner**, select the repositories to track, and grant **Metadata: Read-only** and **Contents: Read and write**. |
| Repositories across multiple owners or organizations | Create a classic personal access token with the **`public_repo`** scope. |

Two details are easy to miss: old no-scope tokens no longer work, and a fine-grained token with only `Metadata: Read-only` is also insufficient. The stargazers endpoint now requires contents-write permission to verify a caller's collaborator access.

Fine-grained tokens can be constrained to selected repositories and are the more controllable choice for a single owner. A chart that spans multiple owners, however, needs the wider reach of a classic token.

## What a leaked token can mean

A GitHub token is a bearer credential: whoever obtains it can call GitHub APIs as the corresponding user, within its authorized scope.

A fine-grained token can be narrowed to specific repositories, but `Contents: Read and write` is still meaningful access. The precise impact depends on the user's repository role, branch protection, and any additional token permissions; on insufficiently protected branches, it can allow repository content to be changed. A classic `public_repo` token normally reaches more repositories, and expands the potential impact accordingly.

This is not an accusation that every third-party service will misuse a credential. It is a change in the trust model. Putting a token in an encrypted parameter in a public README, or handing it to an external server to decrypt and use on demand, asks you to trust that service's implementation, operations, and logging boundary.

A safer default is to keep the token in a secret system you control, use the smallest practical repository scope and lifetime, and protect your branches. That is the boundary this deployment keeps.

## How Starfolio Worker works

The service consists of a Cloudflare Worker, KV, and a Cron Trigger:

1. Every hour, the Worker reads the repositories configured in `src/projects.js`.
2. It fetches each repository's creation date and current star count, then retrieves sampled stargazer timestamps.
3. It splits the cumulative star count into 15 evenly spaced segments and requests only the pages that contain the segment boundaries. Together with the repository's zero-star creation point and current total, these points form a smooth curve.
4. It renders and writes both light and dark SVG variants to Cloudflare KV.
5. README and browser requests read the completed static SVG from KV instead of calling the GitHub API in real time.

Each refresh needs at most about 15 GitHub API requests per repository, while normal chart requests take one KV read. On a first request before the cache exists, the endpoint returns `503` with `Retry-After: 10` and begins a background refresh. If a later refresh fails, the last successful chart remains available.

The token is stored as a Cloudflare Worker Secret: it is not committed to source control and is never returned from the chart endpoint.

## Deploy it in five minutes

The repository's [deployment guide](https://github.com/yuhp/starfolio-worker/blob/main/docs/deploy.md) has the full Cloudflare and GitHub Actions setup. The essential steps are below.

### 1. Configure the repositories

Map URL paths to GitHub `owner/repository` names in `src/projects.js`:

```js
export const projects = {
  "opencode-models-discovery": "yuhp/opencode-models-discovery",
  "another-project": "owner/repository",
};
```

### 2. Create KV and configure deployment credentials

Create a Cloudflare KV Namespace, then add these values in the GitHub repository:

- Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `STAR_HISTORY_TOKEN`
- Variables: `CLOUDFLARE_WORKER_NAME` and `CLOUDFLARE_KV_NAMESPACE_ID`

`STAR_HISTORY_TOKEN` is copied into the Worker's `GITHUB_TOKEN` Secret by a dedicated synchronization workflow. It is neither committed to the repository nor included in generated deployment configuration.

### 3. Deploy and verify

Push to `main`, or run the **Deploy Worker** workflow manually. After the first setup or a token rotation, run **Sync Star Token** once as well.

Check the health endpoint after deployment:

```bash
curl https://<worker-name>.<account-subdomain>.workers.dev/
```

Then request a configured chart. The first request can return `503`; wait ten seconds and retry:

```bash
curl -I "https://<worker-name>.<account-subdomain>.workers.dev/star-history/opencode-models-discovery?theme=dark"
```

## Embed a chart that follows light and dark mode

Use `<picture>` to select the correct SVG for the reader's system theme. Replace the domain and project name with your own:

Here are the two live Starfolio Worker charts for `opencode-models-discovery`:

**Light theme**

[![Light Star History chart for opencode-models-discovery](https://sh.yuhp.dev/star-history/opencode-models-discovery?theme=light)](https://sh.yuhp.dev/star-history/opencode-models-discovery?theme=light)

**Dark theme**

[![Dark Star History chart for opencode-models-discovery](https://sh.yuhp.dev/star-history/opencode-models-discovery?theme=dark)](https://sh.yuhp.dev/star-history/opencode-models-discovery?theme=dark)

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

This follows the same `<picture>` pattern as the previous Star History embed, but points at your Worker instead: `?theme=dark` serves the dark chart and `?theme=light` serves the light one. The outer link can point to the repository, its releases page, or the chart service itself.

## Bring the credential back inside your own boundary

GitHub's policy change has not made Star History disappear, but it has changed how a live chart service can safely acquire its data. Self-hosting does not remove the stargazers endpoint's permission requirements. It does keep a write-capable token out of a third-party chart service.

Keep the token in your Cloudflare Secret, generate and cache SVGs ahead of time, and manage the credential with a minimal scope and short lifetime. That preserves the README experience while keeping the trust boundary in your own hands.
