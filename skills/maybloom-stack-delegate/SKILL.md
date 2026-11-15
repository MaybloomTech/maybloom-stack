---
name: maybloom-stack-delegate
description: Use when planning, briefing, reviewing or delegating work on a maybloom stack repo (a proto + Connect-RPC monorepo, from `maybloom-stack-bootstrap` or following its conventions) — deciding which role owns a task (architect, builder, mechanic, reviewer, researcher, designer, critic), writing a slice brief for a builder, choosing between an `Agent` call and a fresh session, sizing a run to the session budget, writing the hand-off, running the review loop, setting the review effort for a PR, or answering "who should do this". Triggers on "write a brief", "delegate this slice", "spawn a builder", "which tier", "which role", "is this a mechanic job", "how do we review this", "start a reviewer", "drive this run", "write the hand-off", "what are the delegation rules", "research the prior art", "compare libraries", "is this still maintained", "design this screen", "run the design loop", "start a critic", "item N is ready", "run it through the delegation loop", "plan this run". Load it before stating any plan for an item or a run. The builder, mechanic, reviewer, researcher, designer and critic agents it describes ship with this plugin (namespaced `maybloom-stack:<role>`); the architect is the interactive session, never an agent.
---

# maybloom-stack-delegate

How work on a stack repo is split between roles and model tiers, and the
rules that keep the split cheap and safe. The tiers exist because every
tool call replays a session's whole context: a screen slice run by the
strongest model at 300K tokens costs more than the slice is worth, and a
security change run by the cheapest model costs more than that. One role
per session or `Agent` call; a task takes the lowest tier that can own it.

## The roster

Seven roles, all answering to the **project owner**: the person who owns
the decisions, plans with the architect and answers the questions the
roles file. The owner is not a role and no agent fills it; write "the
project owner" (or "the owner"), never a name. The architect is the
session reading this skill when it plans; the other six are agents this
plugin ships. A repo may pin other models in its `AGENTS.md`, outside
`## Delegation`.

| Role | Model | Owns |
|---|---|---|
| **Architect** | The interactive session. The top tier (Fable-class) for architect work, Opus-class when the top tier is unavailable | Planning with the owner; shaping open items into ready ones with briefs, sized to the budget; the foundations (transport, session, data layer, stream client, error model); **every server slice** (the proto is the contract, and the contract is architect work); anything touching authn / authz / privacy; the protected paths. |
| **Builder** | Sonnet-class (`maybloom-stack:builder`) | Screen and feature slices against a fixed brief, and their tests; the PR on the item's branch. |
| **Mechanic** | Haiku-class (`maybloom-stack:mechanic`) | CI, Docker, compose, the proxy, `app.json` / `eas.json`, biome / tsconfig, dependency bumps, lint fixes, rename sweeps, inventories, README and changelog chores. Never product code. |
| **Reviewer** | Opus-class (`maybloom-stack:reviewer`), a fresh reviewer per round: a session, or an `Agent` call from the architect | One review round of one PR: findings by severity and a verdict. Never edits code. |
| **Researcher** | Opus-class (`maybloom-stack:researcher`), an `Agent` call | One question about what exists outside the repo: prior art, a library or service choice, whether a dependency is still maintained, what a neighbour does better. A fixed-shape report with sources, the claims it verified marked. Never edits the repo; files nothing. |
| **Designer** | Opus-class (`maybloom-stack:designer`), an `Agent` call in a worktree, or a session | One design change before it is built: `design.md` if it changes, two or three sketches, one design pass under `src/design/` from the real primitives and fixtures, and the board captures. Never hooks, data, the contract, the primitives or the tokens module. |
| **Critic** | Opus-class (`maybloom-stack:critic`), an `Agent` call, fresh each round | One round of critique on a designer's pass, from the captures and probes against `design.md` and the rubric, before the owner looks. Never edits. |

A project may add roles above these in its own `AGENTS.md`; it does not
remove any. A design change follows [the design
loop](../maybloom-stack-shared/references/design/loop.md), and the
architect's design brief is its § 1 (the builder brief template below
stays as it is).

The owner always talks to the architect. With no runner, the architect
drives a run by [Driving a run](#driving-a-run), and a run for an
architect-written PR (a server slice, a foundation, a protected path)
does not go through builder rounds: architect PR, then `/code-review
high`, then the owner.

## Each role

What it decides alone, what it files as a question for the owner (an
item the owner answers on the tracker, with the least-change option among
the choices), what it starts with, and how it is launched. Plugin agents
cannot set a permission mode in frontmatter, so the mode is the launch
flag (`claude --agent <name> --permission-mode <mode>`); an `Agent` call
inherits the parent's.

**Architect.** Decides alone: the brief, the split into slices, the
order, the review effort, anything a card already decided. Files:
product direction, a change to a decided point, a new dependency or an
architectural shift, anything that trades one of the owner's stated
priorities against another. *Reconcile before Next:* before a card moves
to Next (a board column where the tracker has one, else the open issues
the owner has marked ready, with a label such as `ready`), it lists where the brief contradicts the card or the plan it
came from, and any addition that changes the architecture, and resolves
each on the card; a contradiction the card and plan cannot settle is the
owner's question, never a guess in the brief. Starts with: `AGENTS.md`,
`docs/context.md`, the item and the plan it belongs to. Tools: all.
Mode: `default`; the owner is in the session.

**Builder** (`claude --agent maybloom-stack:builder --permission-mode
acceptEdits`, or `Agent` with `subagent_type: maybloom-stack:builder`).
Decides alone: anything inside the brief and the repo's rules; a
finding's disposition (fixed, disputed, deferred, not addressed;
`escalated` it does not settle, it hands the call up). Files (by
stopping and reporting, never by guessing): a brief that is wrong, a
contract gap, a protected path it needs. It opens the PR as a draft and
marks it ready for round 1. Before that, it goes through the brief's
acceptance criteria and puts the result in the PR body, `met` or `not
met` with the evidence for each. The body opens with its `## Reading of
the brief` section, written before any code, ahead of that list; review
round 1 reads the reading, then the list. As an `Agent` call it runs in
a worktree of its own (`isolation: worktree`), cut from an up-to-date
main, and stops if it finds itself in the main checkout. Starts with:
the brief, `AGENTS.md`. Tools: Read, Edit, Write, Bash, Skill,
ScheduleWakeup (to pace its `/loop` between rounds); no Agent. As a
session it posts on the channel like any role, answers each round in the
lines of rule 9 and waits for the next one itself (the agent file says
how).

**Mechanic** (`Agent` with `subagent_type: maybloom-stack:mechanic`).
Decides alone: anything inside the chore. Files (by stopping): a chore
that turns out to need product code or a protected path. Starts with: the
chore, `AGENTS.md`. Tools: Read, Edit, Write, Bash, Skill; no Agent.

**Reviewer** (`claude --agent maybloom-stack:reviewer --permission-mode default -w review-<pr>-r<n>`, a fresh session every round; the architect may instead run a round as an `Agent` call with `subagent_type: maybloom-stack:reviewer`, a new reviewer every round, in its own checkout, a detached worktree at the PR head, never the builder's). Decides alone: findings, their
severity, the verdict; in round 1 it checks the builder's reading of the
brief against the brief first; approval at a head only in the deep
review the driver names as the gate. Files: a decision that stops
the line (the PR is building the wrong thing, or a finding only the
owner can settle). Starts with: the PR body and diff, the items it
closes, `AGENTS.md`, the previous rounds' findings and dispositions, its
rubric. Tools: Read, Bash (to search, run checks and post), Skill (a
named tracker's skill, the forge's where the channel is the pull
request, and this one); no Edit or Write, and it never pushes.

**Researcher** (`Agent` with `subagent_type:
maybloom-stack:researcher`). Decides alone: which sources to read, how
to rank what it finds, what counts as verified (read from a primary
source in its run) against secondhand. Files: nothing; it lists what
deserves a card and the caller files it, and a question that turns out
to need a decision goes back in the summary with the least-change
option. Starts with: the question, and the part of the repo it is about
(`AGENTS.md`, the docs page or skill the prompt names), so the
comparison is against what the repo does rather than a generic stack.
Tools: Read, Grep, Glob, Bash, WebSearch, WebFetch, Write (the report
file only, never the repo), Skill (a named tracker's skill, to post its
summary on the item the prompt names); no Edit, no Agent. Never a
session: a question fits one call, and the summary has to come back to
the session that asked. It runs on the Opus tier, not the cheapest,
because a sloppy survey misleads a decision.

**Designer** (`Agent` with `subagent_type: maybloom-stack:designer` and
`isolation: worktree`, or `claude --agent maybloom-stack:designer`).
Decides alone: the sketches, which direction to build, and everything
inside the pass. Files: a token the module lacks, a hook or primitive the
pass needs, a change to `design.md` (the owner accepts it); the caller
files them from its report. Starts with: the design brief, `design.md`,
[the design references](../maybloom-stack-shared/references/design/README.md) and the files it routes to, the path's
`design.md`, `AGENTS.md`. Tools: Read, Edit, Write, Bash, Grep, Glob,
Skill; no Agent, so it cannot launch the critic. It opens the pass PR as
a draft, keeps it a draft through the critic rounds and the owner's look,
and marks it ready only when the owner has picked. The caller resumes it
between critic rounds and after the owner's look. Laptop only: it needs
Chrome and a served board, which the review runner has not.

**Critic** (`Agent` with `subagent_type: maybloom-stack:critic`, a new
call every round, at most two before the owner looks). Decides alone: its
findings, their ranking and the verdict, from [the critique procedure](../maybloom-stack-shared/references/design/critique.md).
Files: nothing; a direction it doubts goes in the verdict for the owner.
Starts with: the design brief, `design.md`, `critique.md` and the rubric
for the surface, the sketches in the PR body and the PR's head, which it
captures itself on a port of its own. Tools: Read, Grep, Glob, Bash, Skill;
no Edit or Write, no Agent. It posts one `[critic]` comment on the PR with
findings numbered `C<n>-<i>`, and never edits, pushes or marks the PR
ready. Laptop only, like the designer.

## Driving a run

A run is one PR on the item's branch (`PROJ-123/short-slug`) closing the
run's item and any bundled with it. Whoever drives it moves it through
the loop; the driver does not write its code and does not run its review
rounds (they stay the reviewer's). With
no runner, **the architect session drives the run**, as the normal mode.
Where a runner drives the cycle (it starts the rounds and keeps the
series), it follows the same rules; the repo says so in one line of its
`AGENTS.md` `## Delegation` section, and the runner is then the driver:
the architect reads its rounds and does not launch them, and does not
claim the item, keep the series, apply the stop rule or post the
learning line. An architect that
drives switches its session to the Opus tier (`/model`) once the brief is
written, so the build does not spend top-tier usage.

Decides alone: when to start the next round (where no runner watches the
forge), the round series and its state (converging / diverging / ready),
which reviewer effort a round gets, whether a deferral goes to a new
item, the run's learning. Files: a diverging series (with the series
attached), the merge, a reviewer's stop-the-line decision, a run that
will not fit its budget, an item another run has claimed, an escalated
finding, a session that stalls twice. Only the architect reaches the
project owner outside the tracker, in its session; every other role, and
a runner that drives, files what the owner must answer on the item. An
architect that drives brings the owner only a question it cannot settle
from the series. Code changes in a run are the builder's, chores a mechanic's; a
run that needs a protected path goes back to the architect as a question.

**Starts with:** the run's item(s), with their newest comments and the
last hand-off; the PR if one exists; the project's `AGENTS.md`, its
`## Delegation` section in particular.

**Claim.** Then claim the run's item, so that two runs never pick up the
same one. The item is held when its newest typed comment (a first line
`[<label>] <kind>:` with one of the four kinds below, `[architect]` or a
runner's own label) is anything but a `handoff`. Every
role may post from the same account, so who the item is assigned to does
not tell runs apart. An assignment to the owner is not a claim either.
If the item is held, do not start: post a `question` and stop. Otherwise
claim it in one step. Post `[architect] action: claimed`, and add the
account you post from as an assignee, or the claim label the tracker
names (see The tracker). Release the item when the run hands off or
ends: post the `handoff` comment and, in the same step, remove that
assignee or label. A run that dies before its `handoff` leaves a stale
claim. The `question` posted on a held item tells the owner how to
release it: post `[architect] handoff: released by owner` on the item.

**The channel.** The driver talks through comments on the run's channel
(rule 8) and pushes to the PR; where the channel is the pull request,
load the forge's skill. Each comment's first line is
`[architect] <kind>: <one line>` (a runner posts under its own label),
and the kind is one of four: `action` (what was started or done: a round,
a dispatch, a re-post, the learning), `question` (something the owner
must answer before the run continues), `handoff` (the run stops here:
budget, diverging, end of run), or `error` (a step that failed: a
dispatch, a CLI, a push). A runner reads the state of the run from the
kind alone. The claim, the series rows and the hand-off stay on the item.

**Reviewers start fresh.** Each round is a new reviewer: an `Agent` call
from the architect, or a session the owner starts by hand with the launch
line above. Where the repo's `AGENTS.md` `## Delegation` says a runner
drives the cycle, the runner starts the rounds and the architect reads
them instead.

**The round series.** Before every round, and before every decision the
series makes, read the item and the PR again: the newest comments, the
head, the review state. Do not trust what you read at the start, because
the owner, the builder or a reviewer may have moved since.

Keep one row per round on the item: findings by severity and kind,
recurrences, the builder's dispositions (fixed, disputed, deferred,
escalated, not addressed), the next round's confirmation of those fixes,
wall time, and the session id of each role in the round (`builder <id>,
reviewer <id>`). For an `Agent` builder, that is the agent id the call
returns. For a session, it is the id the session posted. Write `unknown`
where none was posted. The ids let the cost roll up per item and per
role from the session logs.

A reviewer round that crashed or left a report the series cannot read is
**not run**: it gets no row in the series and counts toward neither
`ready` nor `converging`. Request it once more at the same head; a
second failure is an `error` comment and a wait for the owner. A
reviewer session that posts nothing is the stall rule's case, below.

An `escalated` line is a `question` to the owner, with the finding and
the builder's question attached. The finding stays open until the answer
is on the item.

The series decides the state:

- **converging**: blocking count not rising over two rounds, kinds
  moving outward (contract → behaviour → operations → style), fixes
  confirmed, few disputes. Start the next round; ask nobody.
- **diverging**: blocking findings return after a round without them;
  the same finding returns, or the same step, function or file region
  draws should-fix or worse three rounds running (polish-grade guard gaps
  do not count); a new contract or design finding late in the series;
  most of a round disputed, escalated or not addressed; or six rounds.
  Stop and file a decision for the owner with the series attached and
  the least-change option among the choices.
- **ready**: zero blocking this round and at most two the round before.
  Run one deep review, and say in the request that it is the gate; zero
  blocking from it is the merge question for the owner (or the builder
  merges on the deep review's approval, where the owner has allowed
  that in a comment on the run's item). Should-fix findings still open
  at the gate are fixed first, put on the approval's list if small and
  local, or deferred to a named item. Blocking from it is back to
  converging.

**The run's learning.** As soon as you read the gate's approval, post
the run's learning. The first line has a fixed form:
`[architect] action: learning: <file> — <line>`. `<line>` is at most
two sentences on what would have made the run faster to know up front:
a convention, a trap, a check worth running early. `<file>` is the
learnings file or the `AGENTS.md` section the repo names, else
`docs/solutions/README.md`. Where nothing was learned, post
`[architect] action: learning: none` rather than inventing one. A
builder session waits for this line before its last commit and appends
it there, so it ships in the PR and future briefs cite it. Where the
builder was an `Agent` call, it has already returned: resume it, or,
when it cannot be resumed, dispatch one more (`isolation: worktree`, on
the PR's branch). Either way, its whole brief is that commit: the
approval's listed items, if any, and the learning line.

On `HOLD` from any role, or a decision filed for the owner, stop and
wait on that item until the owner's answer appears there.

Before you hand-run a run's rounds on a repo a runner watches, put the
`hands-on` label on the item, and remove it when you hand the run back.
A draft pull request means "not ready", not "worked by hand". A builder
that finds the dispatch paused, the item hands-on or three empty
checks in a row hands back instead of waiting; the round is then yours
to run.

**Starting sessions.** A builder session (a slice over ~500 lines) is a
session of its own, never a subagent of the driver: a large slice does
not fit a call. The owner starts it where no runner does: post the
launch on the run's channel (the item while no PR exists), the command
from this skill (`maybloom-stack:builder` with `acceptEdits`) and the
prompt it starts with (the brief). The owner may likewise start a
reviewer session by hand with the launch line above, for the round and
the PR head. Each prompt also asks the session to put its id
(`$CLAUDE_CODE_SESSION_ID`) in its first comment on the channel. Then
wait on the channel.

**Stall rule.** If a launched session has posted nothing on the channel 30
minutes after your launch comment, it has stalled. Do not keep waiting:
post the launch again as an `action` that says it is a re-post. If it
stalls a second time, post a `question` to the owner. A builder or
reviewer that has posted and is working does not count as stalled. For
a reviewer round, the second stall is the not-run rule's second failure,
posted as an `error`. One event, one kind.

**Budget.** The driver is a session, so the session budget applies: at
the budget, post the hand-off on the run's item in the format this skill
fixes and stop, unless the owner has said to continue this session. The
hand-off is a `handoff` comment and releases the item. The prompt hook
warns only when a prompt arrives, and the driver works for long
stretches from one, so read your number at every round boundary:

```bash
jq .ctx_pct "${XDG_CACHE_HOME:-$HOME/.cache}/claude-statusline/sessions/$CLAUDE_CODE_SESSION_ID.json"
```

At or over the budget, hand off and stop as above; no file (no status
line on this machine) means say so in the hand-off and keep rounds short.
A `null`, or an empty `CLAUDE_CODE_SESSION_ID`, means no number yet:
check again at the next boundary and say so in the hand-off. The
variable is not in Claude Code's documentation, so confirm it on your
build.

**Report.** Each round comment (an `action`) carries the round row, the
state, what happens next, and the `HANDOFF` block in this skill's fixed
format (branch and head, open findings, verified, known limits, next
step). The run's last comment is a `handoff`: the series with its session
ids, the merge (or why not), the items closed and the learning. Post it
in the same step as the release of the item.

## The tracker

The roles read the work item, comment on it and close it through a
tracker. Which one:

1. A `Tracker:` line in the repo's `AGENTS.md` (the tracker, and the
   skill that reaches it) wins. Any other mention of issues or a tracker
   in `AGENTS.md` is not an override; only that line is. A repo cannot
   override through Claude Code settings files, which plugin options
   ignore at project scope, so `AGENTS.md` is the repo's lever.
2. Otherwise the install setting, `${user_config.tracker}`. It is set
   with `/plugin configure maybloom-stack@maybloom-stack` or `claude
   plugin install maybloom-stack@maybloom-stack --config tracker=...`.
3. If that is empty, or still reads as an unfilled placeholder (an
   install that never saved the option shows the placeholder text, not
   an empty string), the tracker is the forge's own issues: `gh issue` on
   GitHub, `fjo issue` on Forgejo.

What any tracker has to give the roles, and the forge-issue command for
each (`N` is the issue number; `@path` is a file, as `fjo` takes it):

| The roles need | GitHub (`gh`) | Forgejo (`fjo`) |
|---|---|---|
| The item as the brief | `gh issue view N --comments` | `fjo issue show N --full` |
| Comment: Ready lines, round summaries, questions | `gh issue comment N --body-file note.md` | `fjo issue comment N @note.md` |
| Claim it | `gh issue edit N --add-assignee @me` | `fjo issue edit N --assignee USER` (or `--add-label`) |
| Release it | `gh issue edit N --remove-assignee @me` | `fjo issue edit N --unassign USER` |
| List open items | `gh issue list --state open` | `fjo issue ls` |
| List the items the owner marked ready | `gh issue list --label ready` | `fjo issue ls -l ready` |
| File a decision for the owner | `gh issue create --title T --body-file body.md --label decision` | `fjo issue create -t T -b @body.md -l decision` |
| Close it with a note | `gh issue close N --comment "note"` | `fjo issue close N -c "note"` |
| Labels that exist | `gh label list` | `fjo labels` |

Both forges need the issue feature switched on for the repo, and the
`decision` and `ready` labels created once (`gh label create decision`;
`fjo` never creates a label, so make it in the web UI). With forge
issues the id is the bare number: the branch is `123/short-slug`, and
the PR body says `Closes #123` so the merge closes the item. A tracker
with prefixed ids keeps its own form (`PROJ-123/short-slug`). Where the
tracker is not the forge's, its skill names the commands for the same
steps and the roles load it.

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
   A larger slice may still be an `Agent` call, but only where the owner
   allows it for that run (in the architect's session, or in a comment on
   the run's item). Add the model override
   `model: opus` where the owner asks for it because of the slice's
   weight. Each allowance covers one run, never a standing default.
   `maxTurns` still binds. Every `Agent` builder gets
   `isolation: worktree`, dispatched after a `git fetch`, so that
   parallel slices never share a checkout.
   A builder that has returned and is owed a round's findings is resumed
   (`SendMessage` to that same builder), so it keeps its context; a new
   builder call given the findings only when the first cannot be
   resumed. It answers with its Ready comment and disposition lines as
   usual.
   Mechanic chores are `Agent` with `subagent_type: maybloom-stack:mechanic`.
   A question about the world outside the repo (prior art, a library or
   service choice, whether something is still maintained) is `Agent`
   with `subagent_type: maybloom-stack:researcher`, the question and
   the report path as the prompt, never the architect's own context.
   The report path is outside the repo (the session's scratchpad, or
   `~/.cache/maybloom-research/`), never a tracked file; being outside
   the working directory, the write may ask once.
   A design change is `Agent` with `subagent_type: maybloom-stack:designer`
   and `isolation: worktree` (or a session), resumed by the caller between
   critic rounds and after the owner's look; each critic round is a new
   `Agent` call with `subagent_type: maybloom-stack:critic`, never the
   designer's context.
   Parallel builders only where the plan marks slices independent; a
   multi-agent `Workflow` only when the owner opts in.
6. **Every subagent has a budget** and stops at it: the builder at 120
   turns or ~150K context, the mechanic at 60 or ~100K, the researcher at
   80 or ~150K, the designer at 120 or ~150K, the critic at 40. The agents carry
   the limit as `maxTurns`, so it is enforced rather than requested (for
   `Agent` calls only: a session launched with `--agent` ignores
   `maxTurns` and works to the session budget instead). A
   subagent cannot compact and nobody watches its meter; a slice that
   outgrows the budget is a session, not a longer `Agent` call. The
   owner's per-run allowance in rule 5 raises the line limit, never
   `maxTurns`. Splitting
   a slice in halves does not make it `Agent`-sized: each half still
   replays the plan, the conventions and the codebase it touches.
7. **One item, one branch, one PR.** The branch is the tracker id, a
   slash and a short slug (`PROJ-123/short-slug`, the id as the tracker
   prints it, no `#`; `123/short-slug` for forge issues); the PR body opens with the builder's reading of
   the brief, then the acceptance list, and names every item the PR
   closes. A runner joins PR and item by that id. A bundle is one PR on
   the lead item's branch.
8. **The channel is the tracker item, or the pull request where the
   runner says so.** The roles in a run talk through comments on the
   run's channel and pushes to the PR. The channel is the run's item,
   or the pull request's own conversation where the runner that watches
   the forge posts its rounds there (its `post_reviews` setting for that
   forge); the item then keeps one line per round, the series and the
   decisions, and the project's `AGENTS.md` names the channel. Each
   comment starts with the author's role in brackets (`[builder]`,
   `[reviewer]`) until each role posts from its own account; a watcher
   skips its own role's comments. The driver also types every
   comment, with a first line
   of `[architect] <kind>: <one line>` (a runner posts under its own
   label). The kind is `action`,
   `question`, `handoff` or `error`, so that a runner can read the run's
   state without reading prose.
9. **A round is answered in lines a runner reads.** Where the project's
   `AGENTS.md` names a review-loop tool, the Ready header and the lines
   below go through that tool instead of a comment, with the same ids
   and states, and the round's findings and series state are read from
   it. Right after pushing the fixes for round n, the builder posts a
   comment on the channel whose first line is
   `[builder] Ready for round <n+1>, head <sha>`, then one line per
   finding of round n:

   ```
   R<n>-<i>: fixed <sha>
   R<n>-<i>: disputed: <reason>
   R<n>-<i>: deferred: <item>
   R<n>-<i>: escalated: <question>
   R<n>-<i>: not addressed: <why>
   ```

   A finding is `disputed` only with evidence the reviewer could have
   read. The reason holds the evidence as one token in a fixed form:
   `<path>:<line>` or `<path>:<line>-<line>` (a file in the repo at the
   answered head, a repo document included) or `test:<TestName>`, as in
   `R2-3: disputed: the guard is already there, go/internal/review/round.go:212`.
   A `disputed` line without such a token is not a dispute: the builder
   writes `escalated` instead, for the owner's or the architect's call,
   and goes on with the other findings. A point that rests on the brief
   or the item is `escalated` too, with its line quoted in the question.

   A finding with no line counts as not addressed; a leading `- ` and
   `fixed with <sha>` are accepted; the newest line for an id wins.
   Every comment that starts with `[builder]` (or the review-loop tool,
   where it takes them) is read for them. The first line is a header,
   not a trigger: where a runner watches the forge, every push before
   the gate's approval starts a round after a short settle window, which
   the Ready header lands inside, and a draft pull request gets none, so
   the builder opens the PR as a draft until round 1 and sets it back to
   draft to pause the loop. A draft means "not ready", not "worked by
   hand": whoever hand-runs a run's rounds on a repo a runner watches
   puts the `hands-on` label on the item first, so the runner queues
   nothing for its pull request and the review-loop tool says so, and
   removes the label when the run is handed back. A builder waiting on
   the tool stops and hands back when it reports a paused dispatch or a
   hands-on item. A runner ends each round comment with the
   series block, `Series of PR <n>: <state>` and a `Next:` line;
   `the gate waits for <ids>` lists the should-fix the builder fixes
   (and the next round confirms) or defers to an item before the deep
   review is requested. Until the runner can hand a round to the builder
   itself, a builder session waits for the next round in a `/loop` that
   polls the channel (or the tool), and stops it on a diverging series,
   an approval at its head, or when the tool says no round will run
   (paused, hands-on, or three empty checks), and hands back (the
   builder agent has the loop).

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
long from one prompt (a driver between rounds, a builder session
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
review loop (on the channel), so a fresh session can continue from the
item and the channel. Fixed
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
`## Delegation` section in `CLAUDE.md`. Four items, nothing else, plus the
runner line where a runner drives the cycle ([Driving a run](#driving-a-run)):

```markdown
## Delegation (the `maybloom-stack-delegate` skill has the roles and rules)

- **Protected paths** (architect-only, no subagents): <list>
- **Commands run from:** <the repo root; or per-package exceptions>
- **Builder checks:** <the typecheck, lint and test commands, in order>
- **Mechanic checks:** <the lint command, or "the CI job the chore touches">
```

A repo that needs a different builder, mechanic, reviewer,
researcher, designer or critic ships its own `.claude/agents/<name>.md` and launches it by
that name (`claude --agent reviewer`, `subagent_type: builder`): the
plugin's agents are namespaced (`maybloom-stack:reviewer`), so a project
agent never replaces them under the launches this skill documents. Keep
the report shape, so the review does not have to learn a second format.
