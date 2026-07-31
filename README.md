# The Maybloom Stack

A schema-first monorepo stack for small, durable product systems. Its core
is one decision: every type that crosses a process boundary is defined in
Protocol Buffers and served over Connect-RPC, so both sides of the wire are
generated, typed, and evolve together — a client knows every resource, RPC,
and field a service offers from generated code alone, in whichever language
either side is written.

Around that core the stack documents its validated paths: a TypeScript
backend on Fastify (the default), a Go backend on connect-go, one Expo
interface across iOS, Android, and web, and static Astro sites for the
public surfaces. These are defaults of experience, not requirements —
Connect speaks many languages, and the stack is built to keep opening new
paths as they are walked and written down.

![The maybloom skill tree: the contract at the root with two limbs, servers and clients; validated paths lit green — TypeScript (the default), Expo shipping to iOS, Android and web, Astro for static surfaces; Go amber and validating; kotlin, python and swiftui waiting as dashed open paths](./docs/assets/skill-tree.svg)

Read it at **[stack.maybloom.tech](https://stack.maybloom.tech)**.

## The documents

1. [Overview](./docs/overview.md), what the stack is and the principles behind it
2. [Contracts](./docs/contracts.md), the protobuf layer that everything hangs off
3. [Backend: TypeScript](./docs/backend-typescript.md), the Fastify blueprint
4. [Backend: Go](./docs/backend-go.md), the Go blueprint
5. [Interface](./docs/interface.md), the Expo Router client blueprint
6. [Sites](./docs/sites.md), Astro for the public, static surfaces
7. [Choosing a runtime](./docs/choosing.md), when Fastify, when Go, when Astro
8. [Skills](./docs/skills.md), how the stack ships as agent skills
9. [Open-sourcing](./docs/open-sourcing.md), how this repo relates to the system it came from
10. [Prior art](./docs/prior-art.md), how the stack compares to what exists

## What is in here

| Directory | Contents |
|---|---|
| `docs/` | The canonical definition. Source of truth for everything else. |
| `site/` | The Astro site that renders `docs/` unchanged. |
| `skills/` | Agent skills that apply the conventions to a real codebase. |
| `.claude-plugin/` | Marketplace + plugin manifests that make the skills installable via `/plugin`. |

## Using the skills

The stack ships as agent skills rather than a `create-x-app` CLI, because
conventions transfer to codebases that have already drifted and templates do
not. Three skills exist today: `maybloom-stack-bootstrap` scaffolds a whole
monorepo with one worked example resource, `maybloom-stack-add-resource` adds
the Nth resource end-to-end through every layer, and `maybloom-stack-shared`
holds the cross-cutting references the other two load — including the
language-neutral core reference that lets the skills work with client or
server technologies beyond the validated defaults.

The repo is itself a Claude Code plugin marketplace, so installing the
skills is two commands inside Claude Code:

```
/plugin marketplace add MaybloomTech/maybloom-stack
/plugin install maybloom-stack@maybloom-stack
```

`/plugin marketplace update maybloom-stack` pulls new releases. See
[`skills/README.md`](./skills/README.md) for team-wide pinning via
`.claude/settings.json` and the contributor flow.

## Running the site

```bash
pnpm install
pnpm dev        # local dev server
pnpm build      # static build to site/dist/
```

## Status

The TypeScript backend, interface, and sites blueprints describe systems
running in production today. The Go blueprint is a design grounded in current
Go practice, and the first Go service will validate it. Anything still
speculative says so in the document that covers it.

All of it is living documentation. The decisions inside a validated path are
the current best answer, not locked ones — they keep changing as the systems
they describe meet new constraints and technologies. Only the contract core
holds still.

The stack was extracted from a working private product, which is not
published. [Open-sourcing](./docs/open-sourcing.md) explains what that means
for the docs you are reading.

## License

[Apache-2.0](./LICENSE), for the docs, the site, and the skills alike.
