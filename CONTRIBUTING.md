# Contributing

Issues and pull requests land here. This is the source of truth — there is
no upstream repository to port changes to, and none of the private system
the stack was extracted from is needed to work on it. If you find a
document or skill that only makes sense to someone who can read that
private codebase, that is a defect worth reporting on its own.

## The one rule that orders everything else

**Documents define intent, skills follow.** When the docs, the skills, and
a real implementation disagree, `docs/` is what the stack means, the
implementation is what is currently true, and the skills trail the
documents rather than leading them. A change to how the stack works starts
in `docs/`; the skill change comes with it or after it, never instead of
it. [Open-sourcing](./docs/open-sourcing.md) explains why.

## Getting set up

```
pnpm install        # Node 24, pnpm 10
pnpm dev            # the documentation site, rendering docs/ in place
pnpm build          # static output
pnpm typecheck      # astro check
```

`docs/` is rendered by `site/` directly rather than copied, so editing a
document updates the site with no sync step. Links between documents are
written the way they work in the repo (`./contracts.md`) and are rewritten
to their published routes at build time.

## What CI enforces

Three checks run on every pull request, and all three are mechanical:

- **Validate commit messages** and **Validate PR title** — both
  [Conventional Commits](https://www.conventionalcommits.org). The PR
  title matters because merges are squashed and the title becomes the
  commit subject on `main`.
- **Validate skill tree coverage** — `scripts/check-skill-tree.py`, which
  holds `docs/assets/skill-tree.json`, the drawn SVG, and the skills'
  reference directories to each other. Run it locally before pushing:

  ```
  python3 scripts/check-skill-tree.py
  ```

## Adding a path to the skill tree

The tree is a claim about coverage, and the checker exists to stop it
overstating. A leaf is **validated** only when a reference exists that
lets the skills work that path without reading a codebase the reader has
no access to. So adding one means three things together:

1. Write the reference at
   `skills/maybloom-stack-shared/references/paths/<leaf>/README.md`.
2. Add the leaf to `docs/assets/skill-tree.json`.
3. Draw it in `docs/assets/skill-tree.svg`, with the class its status
   calls for.

An **open** path is the opposite case and must carry no reference
directory — the checker fails a leaf that claims one, because a path with
a reference is at least validating. Open paths are documented in prose
instead, in the last section of
[Choosing a runtime](./docs/choosing.md).

## Changing a skill

Skills are read by an agent, not by a person, and the difference matters:

- The `description` in the frontmatter is the whole triggering surface.
  It has to say when the skill applies *and when a sibling applies
  instead*, because the agent picks between them on that text alone.
- Skills cite references by relative path, and CI verifies every one of
  those links resolves. A skill that sends an agent to a file that moved
  is worse than one that says nothing.
- A skill that has never been run against a test prompt is unproven.
  Prefer changes you have exercised.

## Style

Prose is plain and specific. Say what something costs and what is not yet
known rather than rounding up to confidence the work has not earned —
several documents carry explicit "this has not been run" passages, and
they are load-bearing, not hedging. If you are unsure whether something
belongs, open an issue and ask before writing at length.
