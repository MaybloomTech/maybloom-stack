// @ts-check
import sitemap from '@astrojs/sitemap';
import { defineConfig, passthroughImageService } from 'astro/config';

export default defineConfig({
  site: 'https://stack.maybloom.tech',
  integrations: [sitemap()],
  image: {
    // Doc images are hand-authored SVGs; copy them through untouched
    // instead of requiring the sharp optimizer's native binary.
    service: passthroughImageService(),
  },
  markdown: {
    shikiConfig: {
      // One dark code theme for both site themes; pre blocks keep a dark
      // panel in Studio (light) mode on purpose, like a terminal would.
      theme: 'github-dark-default',
    },
  },
});
