# Contributing

Issues and pull requests land here. This is the source of truth — there is
no upstream repository to port changes to, and none of the private system
the stack was extracted from is needed to work on it. If you find a
document or skill that only makes sense to someone who can read that
private codebase, that is a defect worth reporting on its own.

Participation is governed by the [Code of Conduct](./CODE_OF_CONDUCT.md).

## The one rule that orders everything else

**Documents define intent, skills follow.** When the docs, the skills, and
a real implementation disagree, `docs/` is what the stack means, the
implementation is what is currently true, and the skills trail the
documents rather than leading them. A change to how the stack works starts
in `docs/`; the skill change comes with it or after it, never instead of
it.

The rule exists because the stack still has a private reference
implementation, which is a failure mode worth naming: documentation that
describes a system only its authors can see. Nothing here may require
reading that codebase. A document or skill that says "copy the helper from
the other repo" is a defect, and gets rewritten to either carry the pattern
itself or describe its shape well enough to rebuild from scratch.

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

These checks run on pull requests, and all of them are mechanical:

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
- **Lint the scaffolded workflows** (the Templates workflow, on pull
  requests that touch the bootstrap skill) — scaffolds both backends,
  fails if a placeholder survives in `.github/`, and runs actionlint
  (with shellcheck) over the workflows a new project would receive. To
  run it locally, with Docker:

  ```
  for backend in go typescript; do
    out="$(mktemp -d)/orchard"
    python3 skills/maybloom-stack-bootstrap/scripts/scaffold.py \
      --name Orchard --slug orchard --org @orchard-tech \
      --out "$out" --backend "$backend"
    grep -rn '__[A-Z][A-Z_]*__' "$out/.github" && echo "placeholder left"
    (cd "$out" && git init -q &&
      docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.12)
  done
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

## Maintainers' chores

Some pins in the bootstrap templates are floors a new project starts
from, and they go stale on their own:

- **The Go module pins.** `skills/maybloom-stack-bootstrap/templates/backend-go/go.mod.tmpl`
  and the `go.sum` beside it ship the versions a fresh scaffold builds
  with, so `go generate .` works with no `go get`. Per release: scaffold a
  throwaway project, in its `go/` run `go get -u ./...` (or raise the pins
  by hand) and `go mod tidy`, confirm `go generate . && go build ./... &&
  go test ./...`, and copy `go.mod`'s versions and `go.sum` back into the
  templates. The post-scaffold checklist runs `go mod tidy`, so a stale
  floor costs a download, not a broken build. The Go patch itself is
  pinned in four places that must agree: `go.mod.tmpl`'s `go` line,
  `root-go/go.work.tmpl`'s, `backend-go/Dockerfile.tmpl`'s `FROM
  golang:<patch>-alpine` and `GO_IMAGE` in `root-go/scripts/go`; raise
  them together (the image and the wrapper set
  `GOTOOLCHAIN=local`, so a mismatch fails the build rather than
  downloading a toolchain).
- **The pnpm catalog.** `templates/root/pnpm-workspace.yaml` is the
  same floor for the TypeScript side; the bootstrap skill's checklist
  refreshes it the same way.
- **The workflow pins.** The scaffolded workflows
  (`templates/root/.github/workflows/` and the `root-go` and
  `root-typescript` ones beside it) pin every action to a commit SHA with
  the release in a comment. A scaffolded project's Dependabot moves its
  own copies; nothing moves the templates'. Per release, raise each pin to
  the action's latest release (`gh api repos/<owner>/<action>/releases/latest`
  for the tag, `gh api repos/<owner>/<action>/commits/<tag>` for the SHA),
  the same action to the same SHA in every file, and `govulncheck@`
  in the Go `ci.yml.tmpl` to the latest `golang.org/x/vuln`. The `root-go`
  and `root-typescript` workflows are near copies of each other (the pins,
  the `changes` job and the `latest` job appear in both), so a change to
  one is made to the other in the same commit. The Templates workflow runs
  actionlint over a fresh scaffold of both paths, so a pin to a missing
  input fails there.

## Style

Prose is plain and specific. Say what something costs and what is not yet
known rather than rounding up to confidence the work has not earned —
several documents carry explicit "this has not been run" passages, and
they are load-bearing, not hedging. If you are unsure whether something
belongs, open an issue and ask before writing at length.
