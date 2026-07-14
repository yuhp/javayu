# javayu.com

A bilingual personal blog built with Astro. Chinese and English are published as independent, static pages under `/zh/` and `/en/`.

## Local development

```sh
npm install
npm run dev
npm run build
```

The root URL redirects to `/zh/`. Write new posts in `src/content/posts/zh/` or `src/content/posts/en/`. Each post requires the frontmatter defined in `src/content.config.ts`.

Use the same `translationSlug` for a Chinese and English counterpart. The article page will link to its available translation automatically.

## Giscus comments

1. Make the comments repository public and enable GitHub Discussions.
2. Install the [Giscus GitHub App](https://github.com/apps/giscus) for that repository.
3. Create a Discussions category, then configure Giscus at [giscus.app](https://giscus.app/).
4. In Cloudflare Pages, add the four environment variables listed in `.env.example`.

Comments remain safely disabled until all four values exist. The configuration uses `pathname`, so each language version gets a distinct discussion thread.

## Cloudflare Pages deployment

Connect this Git repository in Cloudflare Pages and use these build settings:

| Setting | Value |
| --- | --- |
| Framework preset | Astro |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node.js version | `22` |

Add the `www.javayu.com` and `javayu.com` custom domains in the Pages dashboard, then choose one canonical domain and redirect the other to it. The Astro site URL is configured as `https://www.javayu.com`.

## Content license

Unless otherwise noted, the blog content is licensed under [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/).
