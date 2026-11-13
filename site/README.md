# stack-site

The documentation site for the maybloom stack, published at
[stack.maybloom.tech](https://stack.maybloom.tech). It renders the markdown in
`docs/` at the repo root through an Astro content collection, so reading the
docs on GitHub and reading them on the site means reading the same files. Edit
`docs/*.md` and the site follows.

## Routes

| Route | Source |
|---|---|
| `/` | Landing: the plugin and its install commands, the four uses with what each needs and the first prompt for each (from `docs/quick-start.md`), the skill tree (the diagram, or a list built from `docs/assets/skill-tree.json` on narrow screens), the document index |
| `/docs/<slug>` | One page per file in `docs/` |

## Commands

From the repo root:

```
pnpm dev        # local dev server
pnpm build      # static build to site/dist/
pnpm typecheck  # astro check
```

Frontmatter contract for `docs/*.md`: `title`, `description`, and `order`
(drives the sidebar and prev/next). See `src/content.config.ts`. The four
start pages (`quick-start`, `running-a-loop`, `design-loop`, `status-line`)
are ordinary files in that collection, served at `/docs/<slug>` like the rest.

## Analytics

Off unless both `PUBLIC_ANALYTICS_SCRIPT_URL` and `PUBLIC_ANALYTICS_SITE_ID`
are set at build time. Nothing is committed, so a fork builds a site that
reports to nobody.

## Deploying

The `Dockerfile` at the repo root produces a static nginx image:

```
docker build -t maybloom-stack-site .
docker run --rm -p 8080:80 maybloom-stack-site
```

Where that image goes is up to whoever runs it.
