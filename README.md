# The Maybloom Stack

The Maybloom Stack is a Claude Code plugin for building and tending
contract-first software. One install gives you four things: a project
template, agents that build and review work in a loop, a design loop for
screens, and a status line.

## Install

From inside Claude Code:

```
/plugin marketplace add MaybloomTech/maybloom-stack
/plugin install maybloom-stack@maybloom-stack
```

That installs every skill and every agent, namespaced under
`maybloom-stack`. Updating, and pinning a team to the plugin, are covered in
[Updating](./skills/README.md#updating) in `skills/README.md`.

Each use below needs something in place first; [What you need](./docs/quick-start.md#what-you-need) lists it.

## Four uses

**A new project from the template.** A protobuf contract, a Go backend
(TypeScript on request), an Expo client and a docs site, with one example
resource wired through every layer. In a session started in an empty
folder, type:

```
Bootstrap a new maybloom stack project called Orchard.
```

[Quick start](./docs/quick-start.md#a-new-project-from-the-template) has the
walk-through.

**Agents that build and review in a loop.** An architect session writes a
brief, a builder builds it, and a fresh reviewer reviews it round by round.
In a session in your project, type:

```
Help me write a brief for this slice: <what you want built>.
```

[Running a loop](./docs/running-a-loop.md) has the launch command for every
role and one run from card to merged pull request.

**A design loop.** A designer proposes directions and builds one pass on the
design board, a critic judges it from screenshots, and you look last. In a
scaffolded project, type:

```
Run the design loop for the notes list screen.
```

[Design loop](./docs/design-loop.md) has the launch commands and the capture
script.

**A status line.** Your usage windows and their reset countdowns, context
against the session budget, and the prompt cache timer, in the terminal. In
any session, type:

```
Install the status line.
```

[Status line](./docs/status-line.md) shows the output, what the install
changes and what to check when a segment is missing.

## The stack

Every type that crosses a process boundary is defined in Protocol Buffers and
served over Connect-RPC, so both sides of the wire are generated, typed, and
evolve together: a client knows every resource, RPC, and field a service
offers from generated code alone, in whichever language either side is
written. That is the stack's one contract, many paths.

Around that core the stack documents its validated paths: a Go backend on
connect-go (the default), a TypeScript backend on Fastify, one Expo interface
across iOS, Android, and web, and static Astro sites for the public surfaces.
These are defaults of experience, not requirements. The stack is built to keep
opening new paths as they are walked and written down.

![The maybloom skill tree: the contract at the root with two limbs, servers and clients; validated paths lit green — Go (the default) and TypeScript on the servers limb, Expo shipping to iOS, Android and web, Astro for static surfaces; kotlin, python, rust, swiftui and flutter waiting as dashed open paths](./docs/assets/skill-tree.svg)

The stack ships as agent skills rather than a `create-x-app` CLI, because
conventions transfer to codebases that have already drifted and templates do
not. Each skill is one task: `maybloom-stack-bootstrap` scaffolds a monorepo
with one worked example, `maybloom-stack-bootstrap-go` stands up a Go service
in a repo that already has the contract, `maybloom-stack-add-resource` adds a
resource end-to-end, `maybloom-stack-extend-resource` changes one that already
exists, `maybloom-stack-add-rpc` adds one operation, `maybloom-stack-delegate`
says which role and model tier owns which task, and
`maybloom-stack-statusline` installs the status line. `maybloom-stack-shared`
holds the references they load: the language-neutral core, plus one directory
per validated path. Skills are tasks and references are paths, so a new leaf
on the tree costs one directory, and a CI check keeps the picture from claiming
coverage the references do not have.

Seven agents run the delegation model: `builder`, `mechanic`, `reviewer`,
`orchestrator`, `researcher`, `designer` and `critic`. The architect is the
interactive session, not an agent.

## Documents

In reading order. The same pages are on the site.

1. [Overview](./docs/overview.md), what the stack is and the principles behind it
2. [Quick start](./docs/quick-start.md), installing the plugin and the first prompt for each use
3. [Contracts](./docs/contracts.md), the protobuf layer that everything hangs off
4. [Backend: TypeScript](./docs/backend-typescript.md), the Fastify blueprint
5. [Backend: Go](./docs/backend-go.md), the Go blueprint
6. [Interface](./docs/interface.md), the Expo Router client blueprint
7. [Sites](./docs/sites.md), Astro for the public, static surfaces
8. [Choosing a runtime](./docs/choosing.md), when Fastify, when Go, when Astro
9. [Skills](./docs/skills.md), how the stack ships as agent skills
10. [Delegation](./docs/delegation.md), how work on the stack is split between roles and model tiers
11. [Running a loop](./docs/running-a-loop.md), launching the roles and one run from card to merged pull request
12. [Design loop](./docs/design-loop.md), how a screen's look is decided before it is built
13. [Status line](./docs/status-line.md), what each segment shows and how to install it
14. [Adopting the stack](./docs/adopting.md), bringing an existing service onto the contract
15. [Prior art](./docs/prior-art.md), how the stack compares to what exists

## Contributing

[CONTRIBUTING.md](./CONTRIBUTING.md) covers the setup, what CI enforces,
and how a path joins the skill tree. Security issues go through a private
advisory rather than an issue — see [SECURITY.md](./SECURITY.md).

## Status

The TypeScript backend, interface, and sites blueprints describe systems
running in production today. The Go blueprint began as a design grounded in
current Go practice; two services have since walked it, one brought over
from a REST codebase and one built from the scaffold, and the document now
records what they found, including where they chose differently. Anything
still speculative says so in the document that covers it.

All of it is living documentation. The decisions inside a validated path are
the current best answer, not locked ones — they keep changing as the systems
they describe meet new constraints and technologies. Only the contract core
holds still.

The stack was extracted from a working private product, which is not
published and is not needed to use anything here: every pattern the docs
and skills rely on travels with them.

## What is in here

| Directory | Contents |
|---|---|
| `docs/` | The canonical definition. Source of truth for everything else. |
| `site/` | The Astro site that renders `docs/` unchanged. |
| `skills/` | Agent skills that apply the conventions to a real codebase. |
| `agents/` | The builder, mechanic, reviewer, orchestrator, researcher, designer and critic agents the delegation model runs on. |
| `.claude-plugin/` | Marketplace + plugin manifests that make the skills installable via `/plugin`. |

## Running the site

Read the site at **[stack.maybloom.tech](https://stack.maybloom.tech)**, or run
it yourself — every push to `main` publishes the site as a container image:

```sh
docker run --rm -p 8080:80 ghcr.io/maybloomtech/maybloom-stack:latest
```

To work on the site from a checkout:

```bash
pnpm install
pnpm dev        # local dev server
pnpm build      # static build to site/dist/
```

## License

[Apache-2.0](./LICENSE), for the docs, the site, and the skills alike.
