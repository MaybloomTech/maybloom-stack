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

## Sites and the contract

Most sites never touch the protos, and that is fine. The reason sites sit
on the client limb of the stack rather than off to one side is that a
static page can still be built *from* the contract: a site can read the
generated code, or the descriptors behind it, at build time and render
what it finds. Documentation of a service — every resource, every RPC,
every field, with the comments the protos carry — is a page protobuf
decided the contents of, served as plain files. Examples on that page can
be written against the generated client and typechecked with the rest of
the site, so they stop compiling rather than quietly going stale when the
contract moves.

A site may also call a service at build time for data that is settled by
then, such as a public catalogue, and bake the result into the output.

`maybloom-stack-bootstrap` scaffolds a working example of the first kind:
a `docs-site` package that renders the contract's own reference from a
descriptor set produced by `buf build`. It reads the descriptor rather than
the generated TypeScript because proto comments survive into generated code
only as JSDoc, which nothing can read at runtime — so the comments a team
writes on their fields are the prose on the published page.

None of this softens the boundary above. The distinction is *when* the
contract is read, not whether: at build time a site is still a pile of
files, and the moment a page needs the wire at runtime it has become an
interface screen. What the contract buys a site is the same thing it buys
everywhere else — the page cannot describe a service that no longer looks
like that, because the build breaks first.
