# The Astro site path

Public surfaces that change at commit time are Astro packages: static
output, no server, one package per site. They sit on the client limb of
the skill tree next to the Expo interface, but they relate to the contract
differently: a site may ignore it entirely, or read it at build time to
decide what it displays — documentation generated from the protos,
examples compiled against the generated client — without ever calling a
service at runtime. This file defines the path so the skills can create
and extend a site without reading any external codebase.

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

A site is a contract-*optional* client. When it does use the contract, it
most often uses it as **source material** rather than as a wire: the page
is static, and protobuf is what decided what it displays. Four cases, in
the order to try them:

1. **No contract at all** — the common case. Marketing copy, writing, an
   about page. The site imports nothing generated, and adding a resource
   to the backend changes nothing here.
2. **The contract as content** — the site reads the generated code, or the
   descriptors behind it, at build time and renders from it: API
   documentation, a reference page listing every resource, RPC, and field
   a service offers, an explorer, a record of how the wire surface has
   moved. No service is called. This is the strongest form, because the
   page cannot describe a contract that no longer exists — a change that
   would make the documentation wrong breaks the build instead of
   publishing something false.

   `maybloom-stack-bootstrap` scaffolds a working example of this as
   `packages/docs-site`. Read it before building one from scratch; the
   mechanics are in *Rendering the contract* below.
3. **Generated clients in examples** — sample code on the page is written
   against the generated client and typechecked or exercised with the rest
   of the site. Examples cannot drift from the contract, because they stop
   compiling when it moves. Keep them in real source files that
   `astro check` or a test covers and pull them into the page, rather than
   as fenced blocks in prose that nothing verifies.
4. **A service call at build time** — data a service owns that is settled
   at build time (a public catalogue, a published index). Import the
   generated client exactly as the interface does, call it from a
   build-time module or a content loader, and let the result bake into the
   output.

In cases 2–4 the contract rules apply in full: generated code is never
committed, the site regenerates with everyone else, and codegen runs
before the site builds. A build that cannot reach the contract must fail
loudly rather than emit an empty page.

Anything else — per-user state, auth, mutations, data that changes between
deploys — is not a site. Say so plainly and route the work to an interface
screen or a backend route. Do not add a runtime fetch to a static site to
dodge that boundary; it is the boundary that keeps the rest of these
conventions true.

## Rendering the contract

The mechanics of case 2, because two of them are easy to get wrong and one
of them only fails at build time.

**Read the descriptor set, not the generated code.** Proto comments survive
into generated TypeScript only as JSDoc, which nothing can read at runtime.
`buf build --as-file-descriptor-set` keeps them in `SourceCodeInfo`, so the
descriptor set is the only source that carries both the shape and the
prose. Generate it into a gitignored directory the way every other edge is
generated:

```
buf build --as-file-descriptor-set -o packages/<name>-site/src/generated/descriptor.json
```

**Import it, don't read it from disk.** `new URL("./x", import.meta.url)`
points at the *bundled chunk* once the site is built, not at the source
file, so a filesystem read works in dev and then fails during the build
with a confusing ENOENT. A plain `import descriptor from
"./generated/descriptor.json"` is resolved at bundle time and cannot drift.
Parse it with `fromJson(FileDescriptorSetSchema, ...)` from protobuf-es.

**Comments come from paths into the descriptor.** `SourceCodeInfo` locates
each comment by a path: `[4, i]` is the i-th message, `[4, i, 2, j]` its
j-th field, `[6, i]` the i-th service, `[6, i, 2, j]` its j-th method. Index
the locations into a map keyed by the joined path and look each element up
as you walk. Those numbers are field numbers in `descriptor.proto` itself,
so they are as stable as the wire format.

Filter to the repo's own package prefix, or the pages will document
`google.protobuf.Timestamp` alongside the resources.

An RPC or field with no comment should render as visibly undocumented
rather than blank: the fix belongs in the proto, where every other consumer
of the contract sees it too.

## What a site does when a resource is added

It depends on which case above the site is in, and answering "nothing" is
often the correct outcome of a skill run.

- **Cases 1 and 4**: usually nothing. A new backend resource does not
  imply a new page. Touch the site only when the user asks for a public
  surface for that resource.
- **Cases 2 and 3**: nothing to write, but the page changes anyway — the
  new resource appears in the generated code the site renders, so the work
  is regenerating and rebuilding, not authoring. Check the built output
  once: a resource that shows up in documentation with an empty or
  placeholder description is a proto missing its field comments, and that
  is worth fixing in the proto rather than papering over in the site.

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
