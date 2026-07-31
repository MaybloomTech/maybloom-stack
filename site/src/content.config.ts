import { glob } from 'astro/loaders';
// Astro 6 deprecates the `z` re-export from astro:content (removed in 7) and
// points at `astro/zod`, which is astro's own instance.
import { z } from 'astro/zod';
import { defineCollection } from 'astro:content';

/**
 * The stack docs live in docs/ at the repo root, so reading them on GitHub and
 * reading them on the site are the same files. A README.md would be a
 * repo-facing index rather than a page, so it stays out of the collection;
 * `order` drives the sidebar and prev/next.
 */
const stack = defineCollection({
  loader: glob({ pattern: ['**/*.md', '!README.md'], base: '../docs' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    order: z.number(),
  }),
});

export const collections = { stack };
