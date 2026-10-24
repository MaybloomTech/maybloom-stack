---
title: Delegation
description: How work on the stack is split between roles and model tiers, and why
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

## The roles

Six roles do the work, and all of them answer to one party that is not
a role: the **project owner**, the person who owns the decisions, plans
with the architect and answers the questions the roles file. No agent
fills that part, and the skills never name a person for it.

| Role | Job | Launched as |
|---|---|---|
| **Architect** | Plans with the owner; turns open work into ready, well-scoped items with briefs; owns the contract, the foundations and every protected path; reviews builder PRs | The interactive session, never an agent |
| **Orchestrator** | Drives one run (a PR closing one item or a bundle) through the review loop: dispatches the builder, requests each review round, keeps the round series, applies the stop rule, files the questions the owner must answer | `maybloom-stack:orchestrator`, a session |
| **Builder** | One slice against a fixed brief, with its tests; checks the brief's acceptance criteria in the PR body; opens the PR on the item's branch | `maybloom-stack:builder`, a session or an `Agent` call in its own worktree |
| **Mechanic** | One chore: CI, Docker, config, dependencies, renames; never product code | `maybloom-stack:mechanic`, an `Agent` call |
| **Reviewer** | A fresh session per round: reads the PR body, the items it closes, the repo's guidance and the rubric, posts findings and a verdict; never edits code | `maybloom-stack:reviewer`, a session |
| **Researcher** | One question about what exists outside the repo: prior art, a library or service choice, whether a dependency is still maintained; returns a fixed-shape report with sources, the claims it verified marked; never edits the repo, files nothing | `maybloom-stack:researcher`, an `Agent` call |

The orchestrator is the only role that reaches the owner outside the
tracker, and only with a question it cannot settle from the series. Until
a runner automates it, the owner (or an architect session) does the
orchestrator's job by hand; the agent definition is the same either way.

The researcher is the mechanic's counterpart for the world outside the
repo: it reads and reports, never edits. Research used to
happen in the architect's own session, which spends the most expensive
context on reading READMEs, and the comparison the owner decides a new
dependency from had no role producing it. The researcher runs on the
Opus tier rather than the cheapest one because a sloppy survey misleads
a decision, and only as an `Agent` call because a question fits one
call and the summary has to come back to whoever asked. Claude Code's
own search agents cover the inside of the repo; the researcher owns the
outside.

The architect is deliberately not an agent. The paths where a mistake is
silent are the ones no subagent edits, and the brief is written by
whoever can answer the builder's questions. The reviewer is deliberately
never the session that wrote the code: a review from the session that
holds the builder's reasoning confirms the reasoning instead of the
change.

## Three ideas the rules rest on

**The brief is the interface.** A builder gets one document, the brief,
and it is the whole task: acceptance criteria, the data it reads and
invalidates, the design refs, the files to touch, what is out of scope,
and the branch it works on. The agent carries the standing rules and the
budget, so the brief says only what the slice is. A builder that finds
the brief wrong stops and reports; it never guesses, because a guess that
compiles is the expensive kind.

**The contract is the stop.** When the proto lacks a field or an RPC the
slice needs, the builder records the gap and finishes with what exists.
Nobody works around the contract on either side of the wire, because the
contract is the only coupling the compiler checks; a client that fakes a
field it wishes the server had is coupling the wire cannot see. The
architect fixes the proto in a server slice, and the builder continues.

**Review climbs a tier.** A builder's PR is reviewed above the builder's
tier; an architect's PR by a second, higher-effort review; a mechanic's
by a skim. The high-effort review fans out to twenty agents and is for
foundations and security, not for a screen. Severity is about realistic
breakage of what ships: a guard that an unlikely spelling dodges is
polish with a doc line, not a blocker.

## One item, one branch, one PR

A run's branch starts with the tracker id of the item it closes, a slash
and a short slug (`PROJ-123/short-slug`, the id as the tracker prints it,
no `#`), and the PR body names every item it closes. A runner joins PR
and item by that id, so it is the one convention the roles cannot vary.

The builder answers each review round in the same fixed shape: a
`[builder] Ready for round <n+1>, head <sha>` comment with one line per
finding of round n (`R<n>-<i>: fixed <sha>`, `disputed: <reason>`, `deferred:
<item>`, `not addressed: <why>`). A runner counts dispositions from
those lines without reading prose, and the reviewer of the next round
knows which fixes to confirm. A builder session then waits for the next
round in a `/loop` of its own, until the series diverges or a round
approves its head.

Before the PR opens, the builder goes through the brief's acceptance
criteria and lists each one in the PR body as met or not met, with the
evidence for it, and review round 1 checks that list first. This is the
cheapest place to catch a builder that has drifted from the brief.
Catching it in round 1 saves a quality review of the wrong thing.
Builders dispatched as `Agent` calls each get a worktree of their own,
so parallel slices never share a checkout.

The orchestrator types every comment it posts as `action`, `question`,
`handoff` or `error`, so a runner reads the state of the run from the
item without reading prose. It claims the item at the start and releases
it at the hand-off, so two runs never pick up the same one, and it reads
the item again before every round instead of trusting what it read at
the start. Each round's row records the builder's and the reviewer's
session ids, so the cost rolls up per item and per role from the
session logs. A launched session that stays silent past a fixed time is
re-posted, not waited on. When the deep review passes, the orchestrator
writes one short learning for the repo's learnings file, on a fixed
line (`[orchestrator] action: learning: <file> — <line>`, or `learning:
none`). A builder session waits for that line and commits it before the
merge, so the next brief can cite it. A builder dispatched as an `Agent`
call has already returned by then, so the orchestrator dispatches one
more for that commit. A run that dies before its hand-off leaves the
item claimed. The owner releases it with an `[orchestrator] handoff:
released by owner` comment.

## Budgets are enforced, not requested

A subagent cannot compact and nobody watches its meter, so the agents
carry their limit in frontmatter (`maxTurns`) rather than in prose. That
limit binds `Agent` calls only: a role launched as a session ignores
`maxTurns` and works to the session budget below. A slice that outgrows
the budget is a fresh session, not a longer call. The ~500-line limit
for a builder call has one exception. The owner may allow a larger slice
as an `Agent` call for one run, with an Opus-class model override when
the slice needs it. This allowance raises the line limit, never
`maxTurns`, and it is given per run, not as a standing default. One
such call has built a slice of about 700 lines inside its turn limit.
Starting a session would have meant the owner launching it by hand.
Every agent has the
Skill tool, so a session loads the tracker's skill and the delegation
skill itself; the orchestrator launches with `acceptEdits`, so the small
builders it dispatches can edit unattended.
Splitting a slice in halves does not make it agent-sized: each half
still replays the plan, the conventions and the codebase it touches, and
in practice each half runs as long as the whole would have.

Interactive sessions have a budget too: a share of the context window
(30% is the working number), set per project and raised only by the
owner, per session. A run is sized to finish inside it. At the budget the
session writes a hand-off to the item, in a fixed format, and stops; the
next session resumes from the item alone. A fresh session beats
compaction because compaction keeps going on a lossy summary of what the
session knew. The status line shows the number and leaves it in a
per-session file, and a prompt hook in every scaffolded project reads
that file and says when the budget is crossed, once per step. It speaks
only when a prompt arrives, so a session that runs long on one prompt
reads its own number from that file at each round boundary.

## What a repo supplies

The agents are generic; the repo supplies what they cannot know, in a
`## Delegation` section of its `AGENTS.md` (the primary guidance file;
`CLAUDE.md` is a pointer to it): the protected paths, where commands run
from, and the checks each role runs at the end. Bootstrap writes the
section into every new repo; one that predates it adds the section by
hand, and the agents fall back to a `## Delegation` section in
`CLAUDE.md`. A repo that needs a different builder ships its own
`.claude/agents/<name>.md` and launches it by that name; the plugin's
agents are namespaced (`maybloom-stack:builder`), so a project agent sits
beside them rather than replacing them. The report shape stays, so the
review does not learn a second format.

The full rules, the brief template and the `AGENTS.md` section are in the
[skill itself](https://github.com/MaybloomTech/maybloom-stack/blob/main/skills/maybloom-stack-delegate/SKILL.md).
