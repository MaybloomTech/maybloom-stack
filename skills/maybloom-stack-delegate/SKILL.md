---
name: maybloom-stack-delegate
description: Use when planning, briefing, reviewing or delegating work on a maybloom stack repo (a proto + Connect-RPC monorepo, from `maybloom-stack-bootstrap` or following its conventions) — deciding which role owns a task (architect, orchestrator, builder, mechanic, reviewer), writing a slice brief for a builder, choosing between an `Agent` call and a fresh session, sizing a run to the session budget, writing the hand-off, running the review loop, setting the review effort for a PR, or answering "who should do this". Triggers on "write a brief", "delegate this slice", "spawn a builder", "which tier", "which role", "is this a mechanic job", "how do we review this", "start a reviewer", "drive this run", "write the hand-off", "what are the delegation rules". The builder, mechanic, reviewer and orchestrator agents it describes ship with this plugin (`maybloom-stack:builder`, `maybloom-stack:mechanic`, `maybloom-stack:reviewer`, `maybloom-stack:orchestrator`); the architect is the interactive session, never an agent.
---

# maybloom-stack-delegate

How work on a stack repo is split between roles and model tiers, and the
rules that keep the split cheap and safe. The tiers exist because every
tool call replays a session's whole context: a screen slice run by the
strongest model at 300K tokens costs more than the slice is worth, and a
security change run by the cheapest model costs more than that. One role
per session or `Agent` call; a task takes the lowest tier that can own it.

## The roster

Five roles, all answering to the **project owner**: the person who owns
the decisions, plans with the architect and answers the questions the
roles file. The owner is not a role and no agent fills it; write "the
project owner" (or "the owner"), never a name. The architect is the
session reading this skill when it plans; the other four are agents this
plugin ships. A repo may pin other models in its `AGENTS.md`, outside
`## Delegation`.

| Role | Model | Owns |
|---|---|---|
| **Architect** | The interactive session. Opus-class for architect work; the top tier (Fable-class) for the slice briefs and for anything touching auth, session or privacy | Planning with the owner; shaping open items into ready ones with briefs, sized to the budget; the foundations (transport, session, data layer, stream client, error model); **every server slice** (the proto is the contract, and the contract is architect work); anything touching authn / authz / privacy; the protected paths. |
| **Orchestrator** | Sonnet-class (`maybloom-stack:orchestrator`), a session | One run: a PR closing one item or a bundle. Dispatches the builder, requests each review round, keeps the round series on the item, applies the stop rule, files the owner's questions. |
| **Builder** | Sonnet-class (`maybloom-stack:builder`) | Screen and feature slices against a fixed brief, and their tests; the PR on the item's branch. |
| **Mechanic** | Haiku-class (`maybloom-stack:mechanic`) | CI, Docker, compose, the proxy, `app.json` / `eas.json`, biome / tsconfig, dependency bumps, lint fixes, rename sweeps, inventories, README and changelog chores. Never product code. |
| **Reviewer** | Opus-class (`maybloom-stack:reviewer`), a fresh session per round | One review round of one PR: findings by severity and a verdict. Never edits code. |

A project may add roles above these (a design role that decides screens
one slice ahead, for instance) in its own `AGENTS.md`; it does not remove
any. Until a runner automates the orchestrator, the owner or an architect
session does its job by hand, by the same rules.

## Each role

What it decides alone, what it files as a question for the owner (an
item the owner answers on the tracker, with the least-change option among
the choices), what it starts with, and how it is launched. Plugin agents
cannot set a permission mode in frontmatter, so the mode is the launch
flag (`claude --agent <name> --permission-mode <mode>`); an `Agent` call
inherits the parent's.

**Architect.** Decides alone: the brief, the split into slices, the
order, the review effort, anything a card already decided. Files: product
direction, a change to a decided point, a new dependency or an
architectural shift, anything that trades one of the owner's stated
priorities against another. Starts with: `AGENTS.md`, `docs/context.md`,
the item and the plan it belongs to. Tools: all. Mode: `default`; the
owner is in the session.

**Orchestrator** (`claude --agent maybloom-stack:orchestrator
--permission-mode acceptEdits`: it has no Edit or Write of its own, and
the builders and mechanics it dispatches through `Agent` inherit its
mode, so they can edit unattended). Decides alone: when to start the next round,
the round series and its state (converging / diverging / ready), which
reviewer effort a round gets, whether a deferral goes to a new item.
Files: a diverging series (with the series attached), the merge, a
reviewer's stop-the-line decision, a run that will not fit its budget.
Starts with: the run's item(s), the PR if one exists, `AGENTS.md` §
Delegation. Tools: Read, Bash (search, the tracker CLI, `gh`, `git`),
Agent (to launch a mechanic or a small builder), Skill (the tracker's
skill and this one); no Edit or Write. It is
the only role that reaches the owner outside the tracker. It is always a
main session, never an `Agent` call: a run outlives any one call (it waits
on review rounds), it needs the per-session numbers the status line
writes and the budget hook, which only a main session has, and nested launches are
capped in depth. It does not start sessions itself: until a runner does,
it posts the launch command and the starting prompt on the item and asks
the owner to start the builder or reviewer session.

**Builder** (`claude --agent maybloom-stack:builder --permission-mode
acceptEdits`, or `Agent` with `subagent_type: maybloom-stack:builder`).
Decides alone: anything inside the brief and the repo's rules; a
finding's disposition (fixed, disputed, deferred, not addressed).
Files (by stopping and reporting, never by guessing): a brief that is
wrong, a contract gap, a protected path it needs. Starts with: the brief,
`AGENTS.md`. Tools: Read, Edit, Write, Bash, Skill; no Agent. As a
session it posts on the item like any role (the agent file says how).

**Mechanic** (`Agent` with `subagent_type: maybloom-stack:mechanic`).
Decides alone: anything inside the chore. Files (by stopping): a chore
that turns out to need product code or a protected path. Starts with: the
chore, `AGENTS.md`. Tools: Read, Edit, Write, Bash, Skill; no Agent.

**Reviewer** (`claude --agent maybloom-stack:reviewer --permission-mode
default`, a fresh session every round). Decides alone: findings, their
severity, the verdict; approval at a head only in the deep review the
orchestrator names as the gate. Files: a decision that stops
the line (the PR is building the wrong thing, or a finding only the
owner can settle). Starts with: the PR body and diff, the items it
closes, `AGENTS.md`, the previous rounds' findings and dispositions, its
rubric. Tools: Read, Bash (to search, run checks and post), Skill (the
tracker's skill and this one); no Edit or Write, and it never pushes.

## The rules

1. **A brief precedes a builder.** A builder that finds the brief wrong
   stops and reports; it never guesses.
2. **Contract gaps stop the builder.** When the proto lacks a field or RPC
   the slice needs, the builder records the gap and finishes with what
   exists. The architect fixes the proto in a server slice. Nobody works
   around the contract on either side of the wire, because the contract is
   the only coupling the compiler checks.
3. **Protected paths are architect-only, no subagents.** Each repo lists
   them under `## Delegation` in its `AGENTS.md`: auth, session, transport,
   push, permissions, and whatever else a mistake in would not show up in a
   test. The shipped agents refuse to edit them and report what they needed.
4. **Review climbs a tier.** Builder PR → reviewer rounds (or architect
   `/code-review medium`) → the owner merges, or the builder merges on the
   deep review's approval where the owner has allowed it in a comment on
   the run's item. Architect PR → a
   reviewer at higher effort (`/code-review high`) → the owner. Mechanic
   PR → a skim. `high` fans out to ~20 agents; it is for foundations and
   security, not for a screen slice. Severity is realistic breakage of
   what ships; a guard an unlikely input dodges is polish with a doc line.
5. **In Claude Code:** an architect session writes the brief and lands
   foundations itself. Builder work is **a fresh builder session per
   slice**; `Agent` with `subagent_type: maybloom-stack:builder` only for a
   slice the plan marks under ~500 lines, the brief as the whole prompt.
   Mechanic chores are `Agent` with `subagent_type: maybloom-stack:mechanic`.
   Parallel builders only where the plan marks slices independent; a
   multi-agent `Workflow` only when the owner opts in.
6. **Every subagent has a budget** and stops at it: the builder at 120
   turns or ~150K context, the mechanic at 60 or ~100K. The agents carry
   the limit as `maxTurns`, so it is enforced rather than requested (for
   `Agent` calls only: a session launched with `--agent` ignores
   `maxTurns` and works to the session budget instead). A
   subagent cannot compact and nobody watches its meter; a slice that
   outgrows the budget is a session, not a longer `Agent` call. Splitting
   a slice in halves does not make it `Agent`-sized: each half still
   replays the plan, the conventions and the codebase it touches.
7. **One item, one branch, one PR.** The branch is the tracker id, a
   slash and a short slug (`PROJ-123/short-slug`, the id as the tracker
   prints it, no `#`); the PR body names every item the PR closes. A
   runner joins PR and item by that id. A bundle is one PR on the lead
   item's branch.
8. **The tracker item is the channel.** The roles in a run talk through
   comments on the run's item and pushes to the PR, each comment starting
   with the author's role in brackets (`[builder]`, `[reviewer]`) until
   each role posts from its own account; a watcher skips its own role's
   comments.

## Session budget

An interactive session works inside a share of its context window: **30%
by default** (`MAYBLOOM_CTX_BUDGET_PCT`), more only when the owner says
so for that session. The numbers are working defaults, set per project
from experience.

- **A run is scoped to finish inside the budget.** The architect sizes
  briefs to it and splits what does not fit; a slice that will not fit is
  two slices, not a longer session.
- **At the budget the session writes the hand-off and stops**, unless the
  owner has said to continue in this session. Never mid-fix: finish the
  edit and its re-verification first. Going over is the owner's explicit
  call per session, never a default.
- **Reviewers always start fresh**, every round.
- **Prefer a fresh session to compaction**: compaction keeps the session
  going on a lossy summary; the hand-off is what the next session needs.
- Subagents have their own context and no cap beyond `maxTurns` and the
  brief size rule; their tokens count toward the usage windows, not the
  parent's context.

The scaffolded project enforces it in two layers: the status line
(`maybloom-stack-statusline`) colours `ctx:` amber at the budget and
writes each session's numbers to
`~/.cache/claude-statusline/sessions/<session_id>.json`, and the prompt
hook `.claude/hooks/session-budget.sh` reads that file and, once per
threshold (the budget, then every `MAYBLOOM_CTX_STEP_PCT`, default 10),
tells the session to write the hand-off and propose stopping. When the
owner says continue, the session runs `touch
~/.cache/claude-budget/<session_id>.ok` and the context warnings stop.
The same hook warns once per window when the 5-hour usage reaches
`MAYBLOOM_5H_WARN_PCT` (80) or the weekly reaches `MAYBLOOM_WEEK_WARN_PCT`
(90): finish and hand off, start nothing new. Without the status line
installed the hook has no numbers and stays silent.

The hook speaks only when a prompt arrives, so a session that works for
long from one prompt (an orchestrator between rounds, a builder session
on a brief, a reviewer's round) hears nothing in between. Such a session
reads its own number at each round or step boundary, from the file the
status line writes for it. This is for sessions only: an `Agent`
subagent inherits its parent's session id, so it would read the parent's
number, and keeps to its `maxTurns` and the brief size instead.

```bash
jq .ctx_pct "${XDG_CACHE_HOME:-$HOME/.cache}/claude-statusline/sessions/$CLAUDE_CODE_SESSION_ID.json"
```

`CLAUDE_CODE_SESSION_ID` is the session id the status line and the hook
receive; reading the file does not use up the hook's warnings. A `null`, or an empty `CLAUDE_CODE_SESSION_ID`, means no number yet:
check again at the next boundary and say so in the hand-off. The
variable is not in Claude Code's documentation, so confirm it on your
build.
In a scaffolded project the line is not in the permission allowlist, so
a `default`-mode session asks once; allow it there if that gets in the
way.

### The hand-off

Posted on the run's item at the budget, and in every round comment of a
review loop, so a fresh session can continue from the item alone. Fixed
format:

```
HANDOFF
- Branch/head: <branch> at <sha> (PR <n>, or "no PR yet")
- Open findings: <id: state> per finding, or "none"
- Verified: <what was run, the exact commands, and the result>
- Known limits: <what was not run or not covered, and why>
- Next step: <the one thing the next session does first>
```

## The brief

A brief is the interface between the architect and the builder, and the
whole prompt of a builder call. It states only the slice; the agents
carry the standing rules, the tool set and the budget. In this order:

```markdown
# <item id> — <one line>

Branch: <item id>/<short-slug> (the PR body names <item id> and every
other item the PR closes)

## Acceptance criteria
- [ ] <observable behaviour, one per line, testable>

## Data
- Queries / hooks: <which existing ones to use; which to add and their keys>
- Invalidations: <what a mutation invalidates>
- Contract: <the RPCs and messages this slice reads or writes; "no change">

## Design refs
- <screen, state, token or component names; the design doc section>
- Board: <the design board entries the slice adds or changes, with the
  states each shows (scenarios, Play steps); "none" only for a slice
  with no component>

## Files to touch
- <path> — <what changes>

## Out of scope
- <what the builder must not do, including the next slice>

## Checks
- <the builder checks from AGENTS.md § Delegation, or "the defaults">
```

A brief that needs a section it cannot fill is not ready; the gap is
architect work first. A brief the architect expects to exceed the session
budget is split before it is handed over.

## Session hygiene

One session per slice or run. At the end, or at the budget, post the
hand-off on the item; then the owner merges (or the builder does, on an
approval that allows it) and the next piece starts in a fresh session. To
orient, read the item's newest comments and the hand-off rather than the
whole plan, and list only the branches that matter.

## What the repo has to say

The agents are generic; the repo supplies what they cannot know, in a
`## Delegation` section of its `AGENTS.md` (the primary guidance file;
`CLAUDE.md` points to it). `maybloom-stack-bootstrap` writes the section;
a repo that predates it adds one by hand, and the agents fall back to a
`## Delegation` section in `CLAUDE.md`. Four items, nothing else:

```markdown
## Delegation (the `maybloom-stack-delegate` skill has the roles and rules)

- **Protected paths** (architect-only, no subagents): <list>
- **Commands run from:** <the repo root; or per-package exceptions>
- **Builder checks:** <the typecheck, lint and test commands, in order>
- **Mechanic checks:** <the lint command, or "the CI job the chore touches">
```

A repo that needs a different builder, mechanic, reviewer or
orchestrator ships its own `.claude/agents/<name>.md` and launches it by
that name (`claude --agent reviewer`, `subagent_type: builder`): the
plugin's agents are namespaced (`maybloom-stack:reviewer`), so a project
agent never replaces them under the launches this skill documents. Keep
the report shape, so the review does not have to learn a second format.
