# The Maybloom Stack

A schema-first monorepo stack for small, durable product systems. Protocol
Buffers define every boundary, code generation owns the edges, and people
write the three layers in the middle. The backend is TypeScript by default and
Go when the workload asks for it, the interface is one Expo app across iOS,
Android, and web, and the public surfaces are static Astro sites.

```
proto  →  schema  →  adapter  →  store  →  handlers  →  wiring
                                                  ↓
                                        api / queries / screen
```

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

## Using the skills

The stack ships as agent skills rather than a `create-x-app` CLI, because
conventions transfer to codebases that have already drifted and templates do
not. Three skills exist today: `maybloom-stack-bootstrap` scaffolds a whole
monorepo with one worked example resource, `maybloom-stack-add-resource` adds
the Nth resource end-to-end through every layer, and `maybloom-stack-shared`
holds the cross-cutting references the other two load.

Claude Code discovers skills in `~/.claude/skills/`. From a clone of this
repo:

```bash
for s in maybloom-stack-bootstrap maybloom-stack-add-resource maybloom-stack-shared; do
  ln -sfn "$(pwd)/skills/$s" ~/.claude/skills/"$s"
done
```

Symlinks rather than copies, so `git pull` updates the installed skills. See
[`skills/README.md`](./skills/README.md) for the details.

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

The stack was extracted from a working private product, which is not
published. [Open-sourcing](./docs/open-sourcing.md) explains what that means
for the docs you are reading.

## License

[Apache-2.0](./LICENSE), for the docs, the site, and the skills alike.
