---
name: maybloom-stack-delegate
description: Use when planning, briefing, reviewing or delegating work on a maybloom stack repo (a proto + Connect-RPC monorepo, from `maybloom-stack-bootstrap` or following its conventions) — deciding which model tier owns a task (architect, builder, mechanic), writing a slice brief for a builder, choosing between an `Agent` call and a fresh session, setting the review effort for a PR, or answering "who should do this". Triggers on "write a brief", "delegate this slice", "spawn a builder", "which tier", "is this a mechanic job", "how do we review this", "what are the delegation rules". The builder and mechanic agents it describes ship with this plugin (`maybloom-stack:builder`, `maybloom-stack:mechanic`); the architect is the interactive session, never an agent.
---

# maybloom-stack-delegate

How work on a stack repo is split between model tiers, and the rules
that keep the split cheap and safe. The tiers exist because every tool
call replays a session's whole context: a screen slice run by the
strongest model at 300K tokens costs more than the slice is worth, and a
security change run by the cheapest model costs more than that. One tier
per session or `Agent` call; a task takes the lowest tier that can own it.

## The roster

| Tier | Model | Owns |
|---|---|---|
| **Architect** | The strongest tier available (Opus-class; the safety-review tier for auth, session and privacy) | Plans and slice briefs; the foundations (transport, session, data layer, stream client, error model); **every server slice** (the proto is the contract, and the contract is architect work); anything touching authn / authz / privacy; `/code-review` of every builder PR. |
| **Builder** | Sonnet-class (`maybloom-stack:builder`) | Screen and feature slices against a fixed brief, and their tests. |
| **Mechanic** | Haiku-class (`maybloom-stack:mechanic`) | CI, Docker, compose, the proxy, `app.json` / `eas.json`, biome / tsconfig, dependency bumps, lint fixes, rename sweeps, inventories, README and changelog chores. Never product code. |

A project may add tiers above these (a design tier that decides screens
one slice ahead, for instance) in its own `CLAUDE.md`; it does not remove
any.

## The rules

1. **A brief precedes a builder.** A builder that finds the brief wrong
   stops and reports; it never guesses.
2. **Contract gaps stop the builder.** When the proto lacks a field or RPC
   the slice needs, the builder records the gap and finishes with what
   exists. The architect fixes the proto in a server slice. Nobody works
   around the contract on either side of the wire, because the contract is
   the only coupling the compiler checks.
3. **Protected paths are architect-only, no subagents.** Each repo lists
   them under `## Delegation` in its `CLAUDE.md`: auth, session, transport,
   push, permissions, and whatever else a mistake in would not show up in a
   test. The shipped agents refuse to edit them and report what they needed.
4. **Review climbs a tier.** Builder PR → architect `/code-review medium` →
   the maintainer. Architect PR → a second architect review
   (`/code-review high`) → the maintainer. Mechanic PR → architect skim.
   `high` fans out to ~20 agents; it is for foundations and security, not
   for a screen slice.
5. **In Claude Code:** an architect session writes the brief and lands
   foundations itself. Builder work is **a fresh builder session per
   slice**; `Agent` with `subagent_type: maybloom-stack:builder` only for a
   slice the plan marks under ~500 lines, the brief as the whole prompt.
   Mechanic chores are `Agent` with `subagent_type: maybloom-stack:mechanic`.
   Parallel builders only where the plan marks slices independent; a
   multi-agent `Workflow` only when the maintainer opts in.
6. **Every subagent has a budget** and stops at it: the builder at 120
   turns or ~150K context, the mechanic at 60 or ~100K. The agents carry
   the limit as `maxTurns`, so it is enforced rather than requested. A
   subagent cannot compact and nobody watches its meter; a slice that
   outgrows the budget is a session, not a longer `Agent` call. Splitting
   a slice in halves does not make it `Agent`-sized: each half still
   replays the plan, the conventions and the codebase it touches.

## The brief

A brief is the interface between the architect and the builder, and the
whole prompt of a builder call. It states only the slice; the agents
carry the standing rules, the tool set and the budget. In this order:

```markdown
# <slice id> — <one line>

## Acceptance criteria
- [ ] <observable behaviour, one per line, testable>

## Data
- Queries / hooks: <which existing ones to use; which to add and their keys>
- Invalidations: <what a mutation invalidates>
- Contract: <the RPCs and messages this slice reads or writes; "no change">

## Design refs
- <screen, state, token or component names; the design doc section>

## Files to touch
- <path> — <what changes>

## Out of scope
- <what the builder must not do, including the next slice>

## Checks
- <the builder checks from CLAUDE.md § Delegation, or "the defaults">
```

A brief that needs a section it cannot fill is not ready; the gap is
architect work first.

## Session hygiene

One session per slice. At the end of a slice update the status note the
project keeps (a memory file or a plan row), then the maintainer merges
and starts a fresh session; compaction is for mid-slice overflow only,
since it carries every invoked skill and the summary forward. To orient,
grep a plan row rather than reading the section, and list only the
branches that matter.

## What the repo has to say

The agents are generic; the repo supplies what they cannot know, in a
`## Delegation` section of its `CLAUDE.md`. `maybloom-stack-bootstrap`
writes the section; a repo that predates it adds one by hand. Four
items, nothing else:

```markdown
## Delegation (the `maybloom-stack-delegate` skill has the roster and rules)

- **Protected paths** (architect-only, no subagents): <list>
- **Commands run from:** <the repo root; or per-package exceptions>
- **Builder checks:** <the typecheck, lint and test commands, in order>
- **Mechanic checks:** <the lint command, or "the CI job the chore touches">
```

A repo that needs a different builder or mechanic ships its own
`.claude/agents/<name>.md`; a project-level agent shadows the plugin's.
Keep the name and the report shape, so the architect's review does not
have to learn a second format.
