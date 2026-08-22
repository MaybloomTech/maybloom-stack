---
title: Open-sourcing
description: How this repository relates to the private system the stack came from
order: 9
---

# Open-sourcing

This repository is the stack: the documents, the site that renders them, and
the agent skills that apply them. It is not the product the stack was extracted
from, which stays private.

That separation is the subject of this document, because the mechanism you pick
for it decides how much friction the arrangement costs you every day after.

## What stays private

The application keeps its protos, backend, interface, infrastructure, and
deployment topology. None of it is a dependency of anything here.

Deployment is deliberately absent rather than merely omitted. This repo ships a
Dockerfile that builds a static image of the site and says nothing about where
that image is pushed or how it is served, because registry addresses, compose
files, and reverse-proxy configuration describe somebody's machines rather than
the stack.

## Why a standalone repository

The first instinct is to keep the stack inside the private monorepo and publish
a subset of it. Three mechanisms do that, and all three were weighed before
this repo existed.

**A state mirror.** CI on the private side rsyncs an allowlist of paths into
the public repo and commits the result as one generated commit. Cheap, leaks no
history, costs nothing in daily work. Its weakness is that the public history
is meaningless and outside contributions have to be ported back by hand.

**`git subtree`.** Real files in one clone, pushed out with `git subtree push`.
Mechanically better than a submodule in every respect. It does carry private
commit messages into the public repo, and it binds to a single directory
prefix, which is awkward when the published set is scattered across the tree.

**A git submodule.** Attractive in theory, expensive in practice. Submodules
check out a detached HEAD by default, so an ordinary edit-and-commit can be
erased by the next `git submodule update`. Every change becomes two commits in
two repositories, and forgetting the inner push leaves the parent pointing at a
commit nobody else can fetch. A plain `git clone` yields an empty directory,
which then fails somewhere downstream in the package manager rather than at
checkout, where it would have been obvious.

All three answer the question "how do we publish part of a repository". The
better question turned out to be whether the stack was part of that repository
at all. It was not. Nothing in the product imported it, nothing in it imported
the product, and the documents had already been written to describe the stack
rather than the application. The entire coupling was two convenience scripts
and a shared TypeScript version.

So the stack moved out whole. No sync mechanism, no allowlist to maintain, no
deploy credential in CI, no second copy that can drift. Publishing became
`git push`.

The rule generalizes. Reach for a mirror when what you want to publish is
genuinely entangled with something private. Reach for a repository when it is
not, and measure the entanglement before assuming it exists.

## The consistency contract

The stack still has a private reference implementation, which creates a failure
mode worth naming: documentation that describes a system only its authors can
see.

Two rules keep it honest.

Nothing here may require reading the private codebase. A document or skill that
says "copy the helper from the other repo" is a defect, and gets rewritten to
either carry the pattern itself or describe its shape well enough to rebuild
from scratch.

When the documents, the skills, and the reference implementation disagree, the
documents define intent, the reference implementation defines current truth,
and the skills follow the documents. Skill changes trail doc changes rather
than leading them.

## Contributions

Issues and pull requests land here, on the public repository, which is the
source of truth. There is no upstream to port them to.

## Licensing

Apache-2.0 across the docs, the site, and the skills. A single license for the
whole repository is easier to reason about than a split between code and prose,
and the patent grant matters more for the skills than a documentation-only
license would.

## Going public

Publishing is `git push`, but four settings only become available or only
start mattering the moment the repository is visible. They are listed here
because each is easy to forget and awkward to notice missing.

**Branch protection on `main`.** GitHub gates protection rules behind a
paid plan for private repositories, so this cannot be applied in advance;
it is the first thing to do after flipping visibility. All three checks
already run on every pull request and are named exactly as they appear
below:

```sh
gh api -X PUT repos/MaybloomTech/maybloom-stack/branches/main/protection \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "Validate commit messages",
      "Validate PR title",
      "Validate skill tree coverage"
    ]
  },
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "enforce_admins": true,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "restrictions": null
}
JSON
```

Zero required approvals is deliberate rather than an oversight: a single
maintainer cannot approve their own pull request, and a rule that cannot
be satisfied is a rule that gets disabled. The checks are what actually
gate the merge, and `enforce_admins` keeps them binding on the maintainer
too.

**Private vulnerability reporting.** `SECURITY.md` tells people to open a
private advisory, which only works if the feature is switched on:

```sh
gh api -X PUT repos/MaybloomTech/maybloom-stack/private-vulnerability-reporting
```

**Dependabot.** `.github/dependabot.yml` is already in the repository and
starts running once the repository can reach the service. Its commit
prefixes are set so its pull requests pass the Conventional Commits
checks; if that ever stops being true, the symptom is every Dependabot PR
failing on its title.

**The published image's visibility.** A package's visibility is tracked
separately from the repository's, so a public repo can still publish a
package nobody else can pull. After the first successful `Publish image`
run, open the package from the repository's Packages section and confirm it
is public; the symptom otherwise is `docker pull` failing with an
authentication error for everyone but the maintainer.

**The marketplace instructions.** The `/plugin` install lines in
`skills/README.md` clone this repository by URL. They only work for anyone
other than the maintainer once it is public, so they are worth trying from
a fresh machine as the last step.
