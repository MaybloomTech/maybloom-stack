---
title: Delegation
description: How work on the stack is split between model tiers, and why
order: 9
---

# Delegation

A stack repo is built by more than one model. The strongest tier writes
the plan and the parts a mistake would not show up in; a cheaper tier
builds screens against a brief; the cheapest does the chores. The split
is not about capability alone. Every tool call replays a session's whole
context, so a screen slice run by the strongest model at 300K tokens
costs more than the slice is worth, and a session that has read the
plan, the design doc and the codebase is exactly the one that should not
be spending its context on a dependency bump.

The plugin ships the model as one skill and two agents:

| Piece | Job |
|---|---|
| `maybloom-stack-delegate` | The roster, the rules, the brief template, the section a repo's `CLAUDE.md` has to carry |
| `maybloom-stack:builder` | Sonnet-class; one slice against a fixed brief, with its tests; stops at 120 turns |
| `maybloom-stack:mechanic` | Haiku-class; one chore in config, CI or tooling; stops at 60 turns |

The architect is the interactive session, never an agent. It writes the
briefs, lands the foundations, owns every server slice and everything
that touches auth, session or privacy, and reviews what the other tiers
produce. That is deliberate: the paths where a mistake is silent are the
ones no subagent edits, and the brief is written by whoever can answer
the builder's questions.

## Three ideas the rules rest on

**The brief is the interface.** A builder gets one document, the brief,
and it is the whole task: acceptance criteria, the data it reads and
invalidates, the design refs, the files to touch, what is out of scope.
The agent carries the standing rules and the budget, so the brief says
only what the slice is. A builder that finds the brief wrong stops and
reports; it never guesses, because a guess that compiles is the
expensive kind.

**The contract is the stop.** When the proto lacks a field or an RPC the
slice needs, the builder records the gap and finishes with what exists.
Nobody works around the contract on either side of the wire, because the
contract is the only coupling the compiler checks; a client that fakes a
field it wishes the server had is coupling the wire cannot see. The
architect fixes the proto in a server slice, and the builder continues.

**Review climbs a tier.** A builder's PR is reviewed by an architect; an
architect's PR by a second architect at higher effort; a mechanic's by an
architect skim. The high-effort review fans out to twenty agents and is
for foundations and security, not for a screen.

## Budgets are enforced, not requested

A subagent cannot compact and nobody watches its meter, so the agents
carry their limit in frontmatter (`maxTurns`) rather than in prose. A
slice that outgrows the budget is a fresh session, not a longer call.
Splitting a slice in halves does not make it agent-sized: each half
still replays the plan, the conventions and the codebase it touches, and
in practice each half runs as long as the whole would have.

## What a repo supplies

The agents are generic; the repo supplies what they cannot know, in a
`## Delegation` section of its `CLAUDE.md`: the protected paths, where
commands run from, and the checks each tier runs at the end. Bootstrap
writes the section into every new repo; one that predates it adds the
section by hand. A repo that needs a different builder ships its own
`.claude/agents/builder.md`, which shadows the plugin's; the name and the
report shape stay, so the architect's review does not learn a second
format.

The full rules, the brief template and the `CLAUDE.md` section are in the
[skill itself](../skills/maybloom-stack-delegate/SKILL.md).
