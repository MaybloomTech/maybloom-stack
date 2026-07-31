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
| `maybloom-stack-bootstrap` | New monorepo, run once per project | 50 full file templates + a scaffold script |
| `maybloom-stack-add-resource` | Nth resource, end-to-end through every layer | Instructions + per-layer references |
| `maybloom-stack-shared` | Cross-cutting reference: gotchas, proto conventions, transaction patterns | Prose, loaded by the others |
| `maybloom-stack-extend-resource` | Fields and sub-tables on an existing resource | Planned |
| `maybloom-stack-add-rpc` | A single non-CRUD RPC | Planned |
| `maybloom-stack-bootstrap-go` | A Go service in an existing stack repo | Planned, follows the [Go blueprint](./backend-go.md) |

Bootstrap ships a complete working monorepo with one example resource wired
through every layer, so `pnpm install` ends with a running CRUD loop. The
example resource is a teaching specimen: its files carry comments explaining
the pattern they demonstrate, and add-resource treats them as the live
exemplar to imitate.

Add-resource is deliberately not a code generator. It walks the pipeline in
order (proto, schema, adapter, store, handlers, wiring, interface) with a
reference document per layer, and relies on the compiler as the checklist:
the service implementation object refuses to compile until every declared
RPC has a handler.

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
documents. Operator machines symlink them into `~/.claude/skills/` (the
setup command is in `skills/README.md`), so the installed copy and the repo
are one copy.

A skill that tells the agent to go read code the reader has no access to is
a defect rather than a shortcut, for the reason described in
[open-sourcing](./open-sourcing.md): every pattern a skill relies on has to
travel with it.
