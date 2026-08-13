## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

## Content authoring

- Covers are optional. When a post declares `cover`, it must provide a dedicated `cover.thumbnail` for the homepage; do not reuse the full-size article cover as its thumbnail.
- Store both assets under `public/images/posts/<post-slug>/` and use absolute site paths in frontmatter.
- Homepage thumbnails must use a legible 16:9 crop at the rendered `168×95` size. They may use a different crop from the article cover and must not contain essential unreadable text.
- Translation counterparts may share cover and thumbnail assets, but each must provide localized, accurate `cover.alt` text.
