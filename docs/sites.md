---
title: Sites
description: Astro for the public, static surfaces
order: 6
---

# Sites

Public surfaces that change at commit time are Astro packages, one per site,
named `packages/<name>-site`. A stack repo typically carries several (a
product face, marketing or personal surfaces, and this documentation
site), all on the same conventions.

## Conventions

- **Static output only.** Every site is `astro build` to files, served by
  nginx in a container. A site that needs a server has outgrown being a
  site; that workload belongs to a backend service.
- **Content collections for anything repeated.** Writing, projects, and
  documentation are markdown files validated by a Zod schema in
  `src/content.config.ts`. The glob loader can read from anywhere in the
  repo, which is how this documentation site renders `docs/` directly: the
  repo docs and the website are the same files.
- **Hand-rolled design, shared DNA.** Sites share the family design language
  (serif display, mono eyebrows, hairline rules, a light and a dark theme on
  CSS custom properties) but hold their own tokens in their own
  `global.css`. There is no shared UI package until a third consumer forces
  one, and no CSS framework.
- **Drafts default on.** Content schemas set `draft: true` by default, and
  unpublished sections hide themselves from nav, sitemap, and RSS. Nothing
  publishes by accident.
- **The same deploy shape as everything else.** Multi-stage Dockerfile
  (node build, nginx serve), image tagged with the git SHA, pushed to the
  registry, one entry in the compose file, one route in the Caddyfile.

## Package shape

```
packages/<name>-site/
  astro.config.mjs       site URL + integrations (sitemap when public)
  src/
    content.config.ts    collections + schemas
    layouts/             Layout.astro: head, fonts, theme script
    components/          .astro components, styles scoped in-file
    pages/               file-based routes
    styles/global.css    tokens + base + shared primitives
```

Scripts are uniform across site packages: `dev`, `build`, `preview`,
`typecheck` (`astro check`). The root package.json exposes
`dev:<name>-site` and `build:<name>-site` passthroughs.

## What sites are for

Marketing, documentation, writing, and any page whose content is known at
build time. The moment a page needs per-user state, live data, or auth, it
is an interface screen or a backend route instead. This boundary is what
keeps the sites deployable as plain files forever.
