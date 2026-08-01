# Skills

The maybloom stack's agent skills. This directory is their source of truth;
[`docs/skills.md`](../docs/skills.md) describes the family and the philosophy.

| Directory | Job |
|---|---|
| `maybloom-stack-bootstrap/` | Scaffold a new stack monorepo (templates + script) |
| `maybloom-stack-bootstrap-go/` | Stand up a Go service in a repo that already has the contract |
| `maybloom-stack-add-resource/` | Add a resource end-to-end through every layer |
| `maybloom-stack-extend-resource/` | Change a resource that already exists: fields, child tables, links |
| `maybloom-stack-add-rpc/` | Add one non-CRUD operation |
| `maybloom-stack-shared/` | References loaded by the others: cross-cutting files (the language-neutral core, proto conventions, gotchas, tx patterns) and one directory per path under `references/paths/` |

The directories must stay siblings: they reference each other by
relative path (`../maybloom-stack-shared/references/...`), and
`scripts/check-skill-tree.py` fails when one of those links stops
resolving.

## Skills are tasks, references are paths

The two axes are deliberately separate:

- A **skill** is a *task* — bootstrap a monorepo, add a resource, add an
  RPC. Skills are path-neutral and branch to the right reference at the
  point of use.
- A **reference** is a *path* — one leaf of the skill tree, and one
  directory under `maybloom-stack-shared/references/paths/`. The Go
  backend, the TypeScript backend, the Expo interface, the Astro site.

So a new leaf costs one directory, and every skill that already exists
picks it up. Paths live in the shared library rather than inside the skill
that happens to use them first, so a second task skill reaches a pattern
by reading a reference rather than by reaching into a sibling's folder.

## The tree has to stay honest

[`docs/assets/skill-tree.svg`](../docs/assets/skill-tree.svg) is a claim
about coverage, so it is checked rather than trusted:

> A leaf is **validated** only when a reference exists that lets the skills
> work that path without reading a codebase the reader has no access to.
> **Validating** means the docs blueprint it and the first real service is
> still proving it. **Open** means the core permits it and the open-path
> protocol in `core.md` is how it gets reached.

[`docs/assets/skill-tree.json`](../docs/assets/skill-tree.json) holds that
data and `scripts/check-skill-tree.py` enforces it in CI: every validated
leaf must declare a reference directory that exists and is entered through
a `README.md`, every leaf must be drawn in the SVG the way its status
says, every directory under `references/paths/` must belong to a leaf, and
every file left at the top of `references/` must be declared cross-cutting.
Adding a path is therefore three steps that fail loudly if you stop after
one: write the reference, add the leaf to the manifest, draw it on the
tree.

## Install

The repo doubles as a Claude Code [plugin marketplace](https://code.claude.com/docs/en/plugin-marketplaces):
`.claude-plugin/marketplace.json` at the repo root publishes one
`maybloom-stack` plugin whose `skills/` directory is this one. From inside
Claude Code:

```
/plugin marketplace add MaybloomTech/maybloom-stack
/plugin install maybloom-stack@maybloom-stack
```

That installs the whole family in one step — the two triggering skills
plus `maybloom-stack-shared`, which has no `SKILL.md` and ships as plain
files, so the `../maybloom-stack-shared/references/...` links keep
resolving on the installed copy. Installed skills are namespaced
(`maybloom-stack:maybloom-stack-bootstrap`). Pull new releases with
`/plugin marketplace update maybloom-stack`.

To pin a whole team to the skills, commit this to a project's
`.claude/settings.json` instead of installing by hand:

```json
{
  "extraKnownMarketplaces": {
    "maybloom-stack": {
      "source": { "source": "github", "repo": "MaybloomTech/maybloom-stack" }
    }
  },
  "enabledPlugins": { "maybloom-stack@maybloom-stack": true }
}
```

### Working on the skills themselves

Add your clone as a local marketplace so the installed copy comes from the
working tree and edits land in git rather than in a copy nobody reviews:

```
/plugin marketplace add ~/workspace/maybloom-stack
/plugin install maybloom-stack@maybloom-stack
```

After editing, `/plugin marketplace update maybloom-stack` re-syncs the
installed copy from the clone; `/reload-plugins` applies it without
restarting the session.

## Editing rules

- The docs define intent and this directory must match them; update both in
  the same change.
- Nothing here may require reading a codebase the reader has no access to.
  A skill that says "copy the helper from the other repo" has to be rewritten
  to either carry the pattern or describe its shape well enough to rebuild.
- Files ending in `.tmpl` get placeholder substitution and lose the suffix
  when `scaffold.py` runs. Files that would otherwise confuse git or tooling
  in this repo (a template `.gitignore`, for instance) carry the suffix even
  when they hold no placeholders.
