# Skills

The maybloom stack's agent skills. This directory is their source of truth;
[`docs/skills.md`](../docs/skills.md) describes the family and the philosophy.

| Directory | Job |
|---|---|
| `maybloom-stack-bootstrap/` | Scaffold a new stack monorepo (templates + script) |
| `maybloom-stack-add-resource/` | Add a resource end-to-end through every layer |
| `maybloom-stack-shared/` | Cross-cutting references loaded by the others: the language-neutral core, proto conventions, gotchas, tx patterns, the Go backend path |

The three directories must stay siblings: they reference each other by
relative path (`../maybloom-stack-shared/references/...`).

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
