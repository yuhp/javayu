import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ base: './src/content/posts', pattern: '**/*.md' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date().optional(),
    lang: z.enum(['zh', 'en']),
    tags: z.array(z.string()).default([]),
    translationSlug: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { posts };
