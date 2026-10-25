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

These checks run on pull requests, and all of them are mechanical.
`.claude/settings.json` allows the two scripts below, an agent launch
from this checkout (`claude -p --plugin-dir . --agent maybloom-stack:<role>`)
the `gh pr` reads and the tracker's `show`, `ls` and `comment` without a
prompt, so a non-interactive review session can run them. Claude Code
reads the file only in a trusted workspace; a session in a fresh clone
gets it through `--settings`. A `*` in a rule there spans spaces, so
keep a new rule as narrow as the command it is for. The deny rules stop
a nested launch from widening its own permissions (`--permission-mode`,
`--settings`, `--allowedTools` and the like); deny wins over allow.

- **Validate PR title** —
  [Conventional Commits](https://www.conventionalcommits.org). Merges are
  squashed and the title becomes the commit subject on `main`, so it is
  the only message checked; the branch's own commits are not.
- **Validate skill tree coverage** — `scripts/check-skill-tree.py`, which
  holds `docs/assets/skill-tree.json`, the drawn SVG, and the skills'
  reference directories to each other. Run it locally before pushing:

  ```
  python3 scripts/check-skill-tree.py
  ```
- **Check the plugin version** — `scripts/check-plugin-version.py`,
  which fails a pull request that changes `skills/`, `agents/`,
  `templates/` or `.claude-plugin/` without raising the plugin's version
  (see [Releasing the plugin](#releasing-the-plugin)). It runs on main
  too, after each merge. Run it locally against the branch's base, after
  committing the bump (it reads committed `HEAD`, as CI does):

  ```
  git fetch origin    # on a fork, fetch upstream and pass upstream/main
  python3 scripts/check-plugin-version.py origin/main
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

## Releasing the plugin

Every merge that changes what the plugin ships is a release. Claude Code
updates an installed plugin only when its version changes, so a merge
that leaves the version alone never reaches the people who already have
the plugin: `claude plugin update` reports the old version as the latest,
and auto-update does nothing.

So a pull request that touches `skills/`, `agents/`, `templates/` or
`.claude-plugin/` raises `version` in `.claude-plugin/plugin.json`, and
the same value in the plugin's entry in `.claude-plugin/marketplace.json`
(the check holds the two equal). The scaffold's templates live under
`skills/maybloom-stack-bootstrap/templates/`, so `skills/` covers them;
`templates/` stands for a top-level one, which the repo does not have
yet. Claude Code only needs the version to differ; requiring it to go up
is this repository's rule, for the semver signal. The version is
`MAJOR.MINOR.PATCH`, with no pre-release suffix. Semver, read for a
plugin:

- **patch** for fixes to a skill, an agent or a template that change no
  behaviour a user relies on;
- **minor** for anything new or changed in behaviour: a skill, an agent,
  a reference, a scaffolded file;
- **major** for a change that breaks a project already scaffolded or a
  skill's documented interface.

When two pull requests in flight bump from the same base, they usually
pick the same new version, and then the second merges cleanly over the
first: its check ran before the first merged, and its changes would ship
under a version users already have. So if main moved after the check
ran, update the branch from main before merging. That push reruns the
check, which fails until the version is raised again. The run on main
after each merge catches a slip, but only after it has landed.

A pull request that touches only `docs/`, `site/` or the repository's
own workflows needs no bump, with one exception: the plugin installs the
whole repository, and some skills send agents to a `docs/` page (the
bootstrap skill reads `docs/choosing.md`, the bootstrap-go skill
`docs/adopting.md`, the shared gotchas `docs/interface.md`). When such a
page changes what a skill tells an agent to do, bump the version so the
change ships.

The check lists the shipped directories (`SHIPPED` in
`scripts/check-plugin-version.py`) rather than everything outside
`docs/` and `site/`. When the plugin gains a new top-level component,
such as `hooks/`, `commands/`, `output-styles/` or `.mcp.json`, add it
to `SHIPPED` in the same pull request.

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
