# Skills

The maybloom stack's agent skills. This directory is their source of truth;
[`docs/skills.md`](../docs/skills.md) describes the family and the philosophy.

| Directory | Job |
|---|---|
| `maybloom-stack-bootstrap/` | Scaffold a new stack monorepo (templates + script) |
| `maybloom-stack-add-resource/` | Add a resource end-to-end through every layer |
| `maybloom-stack-shared/` | Cross-cutting references loaded by the others |

The three directories must stay siblings: they reference each other by
relative path (`../maybloom-stack-shared/references/...`).

## Install

Claude Code discovers skills in `~/.claude/skills/`. Symlink them from a clone
of this repo so the installed copy and the repo stay one copy:

```bash
for s in maybloom-stack-bootstrap maybloom-stack-add-resource maybloom-stack-shared; do
  ln -sfn "$(pwd)/skills/$s" ~/.claude/skills/"$s"
done
```

Run it from the repo root. `git pull` then updates the installed skills, and
edits made while using them land in git rather than in a copy nobody reviews.

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
