// @ts-check
import { unified } from '@astrojs/markdown-remark';
import sitemap from '@astrojs/sitemap';
import { defineConfig, passthroughImageService } from 'astro/config';

/**
 * Rewrite `./contracts.md` to `/docs/contracts` in rendered docs.
 *
 * The docs collection reads the repo's own `docs/` directory in place, so
 * every document has two readers: GitHub, where a relative link resolves
 * next to the file, and this site, where the same document is served at
 * `/docs/<slug>`. A relative link resolves against the published route
 * rather than the file's directory, so the GitHub-correct form 404s here.
 * The markdown keeps the form that works in the repo and this fixes it at
 * build time, which is the only place that knows the route layout.
 */
function rehypeDocLinks() {
  const relative = /^\.\/([\w-]+)\.md(#.*)?$/;
  /** @param {import('hast').Root} tree */
  return (tree) => {
    /** @param {import('hast').Nodes} node */
    const walk = (node) => {
      if (node.type === 'element' && node.tagName === 'a') {
        const href = node.properties.href;
        const match = typeof href === 'string' ? href.match(relative) : null;
        if (match) node.properties.href = `/docs/${match[1]}${match[2] ?? ''}`;
      }
      if ('children' in node) for (const child of node.children) walk(child);
    };
    walk(tree);
  };
}

export default defineConfig({
  site: 'https://stack.maybloom.tech',
  integrations: [sitemap()],
  image: {
    // Doc images are hand-authored SVGs; copy them through untouched
    // instead of requiring the sharp optimizer's native binary.
    service: passthroughImageService(),
  },
  markdown: {
    processor: unified({ rehypePlugins: [rehypeDocLinks] }),
    shikiConfig: {
      // One dark code theme for both site themes; pre blocks keep a dark
      // panel in Studio (light) mode on purpose, like a terminal would.
      theme: 'github-dark-default',
    },
  },
});
