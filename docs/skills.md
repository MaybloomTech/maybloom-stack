---
title: Skills
description: How the stack ships as agent skills
order: 8
---

# Skills

The stack's distribution format is a set of agent skills: structured
instructions plus file templates that a coding agent executes to scaffold a
project or extend one. This replaces the traditional framework CLI
(`create-x-app`) with something better suited to how the stack is actually
used: an agent that reads conventions and applies them to a specific
situation, rather than a generator that stamps one shape.

## The skill family

| Skill | Job | Style |
|---|---|---|
| `maybloom-stack-bootstrap` | New monorepo, run once per project | 60 full file templates + a scaffold script |
| `maybloom-stack-add-resource` | Nth resource, end-to-end through every layer, on either backend | Instructions + per-layer references |
| `maybloom-stack-shared` | Reference library: cross-cutting files (the language-neutral core, gotchas, proto conventions, transaction patterns) plus one directory per validated path | Prose, loaded by the others |
| `maybloom-stack-extend-resource` | Fields, child tables, and links on an existing resource | Instructions; leans on the shared wire and transaction references |
| `maybloom-stack-add-rpc` | A single non-CRUD RPC, on either backend | Instructions |
| `maybloom-stack-bootstrap-go` | Scaffold a Go service in an existing stack repo | Instructions + a module skeleton reference, following the [Go blueprint](./backend-go.md) |
| `maybloom-stack-delegate` | Split the work between model tiers: the roster, the rules, the brief template; ships with the `builder` and `mechanic` agents | Instructions, see [Delegation](./delegation.md) |

Bootstrap ships a complete working monorepo with one example resource wired
through every layer, so `pnpm install` ends with a running CRUD loop. The
example resource is a teaching specimen: its files carry comments explaining
the pattern they demonstrate, and add-resource treats them as the live
exemplar to imitate.

It also ships a docs site, which is the teaching specimen for the other
kind of client — one that never calls the service. It compiles the protos
to a descriptor set at build time and renders what it finds: the service,
its RPCs, and a page per message with every field, its number, and the
comment written in the proto. A static page whose contents protobuf
decided, and the reason the scaffold's proto comments are written as
documentation rather than as notes to self.

Add-resource is deliberately not a code generator. It walks the pipeline in
order (proto, schema, adapter, store, handlers, wiring, interface) with a
reference document per layer, and relies on the compiler as the checklist:
the service implementation object refuses to compile until every declared
RPC has a handler.

Add-resource is also backend-neutral. The pipeline it walks is the same
whether the service is TypeScript or Go; the path reference for each
backend carries the per-layer patterns (goose migration, sqlc queries, Go
adapter/store/handlers, the generated handler interface as the
exhaustiveness check), so the skill operates on a connect-go service
without reading any codebase outside the skill tree.

The other three skills split the work add-resource is the wrong shape for.
Extend-resource changes a resource that already exists, where the RPC
surface usually stays put and the risk moves to wire compatibility and to
rows already in the database. Add-rpc adds one operation, which is the
right home for a rule about who may do something — a state change guarded
by an RPC can enforce it, a field the client writes cannot. Bootstrap-go
stands up the `go/` module the way bootstrap stamps the monorepo, once per
Go service, and hands back to add-resource for everything after.

## Skills are tasks, references are paths

The family has two axes and keeps them separate. A **skill** is a task —
bootstrap a monorepo, add a resource, add an RPC — and is written to be
path-neutral, branching to the right reference at the point of use. A
**reference** is a path: one leaf of the skill tree, and one directory in
the shared library — the TypeScript backend, the Go backend, the Expo
interface, the Astro site. A new leaf therefore costs one directory, and
every skill that already exists picks it up.

Paths live in the shared library rather than inside whichever skill used
them first. That is why add-resource carries only the recipe for the task
it performs, while the per-layer patterns for a backend sit under
`references/paths/`: the next task skill reaches them by reading a
reference rather than by reaching into another skill's folder.

That gives the tree a definition rather than a vibe:

> A leaf is **validated** only when a reference exists that lets the skills
> work that path without reading a codebase the reader has no access to.
> **Validating** means these docs blueprint it and the first real service
> is still proving it. **Open** means the core permits it and the
> open-path protocol is how it gets reached.

The picture is hand-drawn, so it is checked rather than trusted:
`docs/assets/skill-tree.json` carries the data behind it and a CI job
fails when the tree, the manifest, and the reference files disagree —
when a leaf is drawn solid with nothing behind it, or a reference is added
that nobody put on the tree. Adding a path is three steps that fail loudly
if you stop after one: write the reference, add the leaf, draw it.

## Open paths and preferences

The skills distinguish the stack's core from its validated paths, the way
[the overview](./overview.md) does. The shared reference `core.md` carries
the language-neutral rules — the contract conventions, the layer
vocabulary on both sides of the wire, what is core and what is merely the
default — so the skills can operate on implementations these docs don't
blueprint yet. On an open path, the project's own code plays the role the
per-layer references play on a validated one: the skills read it, imitate
its idiom for everything the core doesn't govern, and enforce only the
contract.

Preferences are meant to accumulate. When a user states or demonstrates a
choice — a client framework, a server language, code sources they want to
keep using — the skills suggest recording it in the project's `CLAUDE.md`
so future sessions inherit the decision instead of re-asking. And when an
open path has been walked far enough, its patterns graduate: first into a
reference file in the project, eventually into these docs and skills.
That is the skill tree opening up.

## Why skills instead of a CLI

- **Conventions transfer, templates date.** A generator encodes one moment;
  a skill encodes the reasoning, so an agent can apply it to a codebase that
  has since drifted, or to a resource with an unusual shape.
- **The teaching lives in the output.** Scaffolded files explain themselves,
  which is what a two-person team needs when they return to a layer six
  months later.
- **The failure mode is better.** A generator that half-runs leaves a broken
  tree; a skill's verification section makes the agent prove each layer
  (typecheck, boot log, exercised RPC) before claiming done.

## Consistency contract

Three artifacts describe the stack: these docs, the skills, and the
reference implementation. The rule when they disagree: the docs define
intent, the reference implementation defines current truth, and the skills
must match the docs. Skill releases follow doc changes, never lead them.

The skills live in `skills/` at the repo root, versioned and reviewed like
any other part of the stack, and published under the same license as these
documents. They install as a Claude Code plugin: the repo doubles as a
plugin marketplace (`.claude-plugin/marketplace.json`), so
`/plugin marketplace add MaybloomTech/maybloom-stack` followed by
`/plugin install maybloom-stack@maybloom-stack` puts the whole family —
including the shared references the skills load by relative path — on a
machine, and `/plugin marketplace update` pulls releases. The exact
commands, the team-pinning settings, and the contributor flow (a clone
added as a local marketplace) are in `skills/README.md`.

A skill that tells the agent to go read code the reader has no access to is
a defect rather than a shortcut, for the reason described in
[open-sourcing](./open-sourcing.md): every pattern a skill relies on has to
travel with it.
