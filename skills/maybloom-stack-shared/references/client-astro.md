# The Astro site path

Public surfaces that change at commit time are Astro packages: static
output, no server, one package per site. They sit on the client limb of
the skill tree next to the Expo interface, but they relate to the
contract differently — most sites never touch it, and that is the point.
This file defines the path so the skills can create and extend a site
without reading any external codebase.

Sections: Detecting a site · Package shape · Conventions · Where the
contract fits · What a site does when a resource is added · Verification
before claiming done · Astro-specific gotchas.

## Detecting a site

A package with `astro.config.mjs` and `src/pages/`, named
`packages/<name>-site`. A stack repo usually carries several — a product
face, a marketing or personal surface, a documentation site — all on the
same conventions and each deployed as its own container.

If the user asks for "a page" and the content is known at build time, it
belongs to a site. If it needs per-user state, auth, or live data, it is
an interface screen or a backend route instead; see *Where the contract
fits* below before reaching for a site.

## Package shape

```
packages/<name>-site/
  astro.config.mjs       site URL + integrations (sitemap when public)
  src/
    content.config.ts    collections + Zod schemas
    layouts/             Layout.astro: head, fonts, theme script
    components/          .astro components, styles scoped in-file
    pages/               file-based routes
    styles/global.css    tokens + base + shared primitives
  public/                favicon and anything served verbatim
  Dockerfile             multi-stage: node build → nginx serve
```

Scripts are uniform across site packages: `dev`, `build`, `preview`,
`typecheck` (`astro check`). The root `package.json` exposes
`dev:<name>-site` and `build:<name>-site` passthroughs so every site is
driven the same way from the repo root.

## Conventions

- **Static output only.** Every site is `astro build` to files, served by
  nginx in a container. A site that needs a server has outgrown being a
  site; that workload belongs to a backend service. This is the rule that
  keeps sites deployable as plain files for years.
- **Content collections for anything repeated.** Writing, projects, and
  documentation are markdown validated by a Zod schema in
  `src/content.config.ts`. The glob loader reads from anywhere in the
  repo, which is how a documentation site can render a top-level `docs/`
  directory directly — the repo docs and the published pages stay the
  same files rather than a copy that drifts.
- **Hand-rolled design, shared DNA.** Sites share the family design
  language (serif display, hairline rules, a light and a dark theme on CSS
  custom properties) but hold their own tokens in their own `global.css`.
  No shared UI package until a third consumer forces one, and no CSS
  framework.
- **Drafts default on.** Content schemas set `draft: true` by default, and
  unpublished entries hide themselves from nav, sitemap, and RSS. Nothing
  publishes by accident.
- **The same deploy shape as everything else.** Multi-stage Dockerfile
  (node build, nginx serve), image tagged with the git SHA, one entry in
  the compose file, one route in the reverse proxy.

## Where the contract fits

A site is a contract-*optional* client, which is what distinguishes it
from the interface. Three cases, in the order to try them:

1. **No contract at all** — the common case. Marketing copy,
   documentation, writing. The site imports nothing generated, and adding
   a resource to the backend changes nothing here.
2. **Build-time consumption** — the site needs data that a service owns
   but that is settled at build time (a public catalogue, a changelog fed
   from a resource). Import the generated client exactly as the interface
   does, call it from a build-time module or a content loader, and let the
   result bake into the output. The contract rules still apply in full:
   generated code is never committed, and the site regenerates with
   everyone else.
3. **Anything live** — per-user state, auth, mutations, data that changes
   between deploys. This is not a site. Say so plainly and route the work
   to an interface screen or a backend route; the boundary is what keeps
   the rest of the conventions true.

Case 2 is the only reason a site appears on the client limb of the tree
at all. Do not add a runtime fetch to a static site to avoid case 3 —
that is the failure this boundary exists to prevent.

## What a site does when a resource is added

Usually nothing, and saying so is the correct outcome of a skill run. A
new backend resource does not imply a new page. Touch a site only when
the user asks for a public surface for that resource, and then decide
between the three cases above before writing anything.

When a page *is* wanted, the work is ordinary Astro: a route under
`src/pages/`, a collection entry if it is one of many, and a component if
the shape repeats. There is no per-layer pipeline here the way there is on
the server — the pipeline stops at the wire.

## Verification before claiming done

- `astro build` completes and writes files to `dist/`.
- `astro check` reports zero errors.
- The new route appears in `dist/` as HTML (and in the sitemap, if the
  site publishes one and the entry is not a draft).
- Nothing in the built output requires a server: no API calls at runtime,
  no environment variable read in the browser that was meant for build.
- If the change touched shared styles or the layout, look at one page in
  both themes rather than trusting the diff.

## Astro-specific gotchas

- **Images through the default service need `sharp`.** Hand-authored SVGs
  and any asset that needs no optimization build fine with
  `passthroughImageService()` in `astro.config.mjs`, which avoids adding a
  native dependency to the build image for nothing.
- **The glob loader's `base` may point outside `src/`.** That is supported
  and is how docs get rendered in place, but relative links inside those
  markdown files resolve against the *published route*, not the file's
  directory — a `./other.md` link that works on GitHub 404s on the site
  unless the route layout matches or the link is rewritten.
- **Set the theme before paint.** The theme script belongs inline in
  `<head>`, reading storage and stamping the attribute on the document
  element, or the first frame renders the wrong skin.
- **Scoped styles are scoped to the component, not the markdown.** Styling
  rendered collection content takes a global rule (a `.prose` block in
  `global.css`) rather than a scoped block in the page component.
- **`draft: true` is a schema default, not a filter.** The queries that
  build nav, sitemap, and feeds each have to honour it; forgetting one is
  how an unpublished entry leaks.
