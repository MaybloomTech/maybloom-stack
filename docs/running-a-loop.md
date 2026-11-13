---
title: Running a loop
description: Who starts which role and with what, one prompt per role, a filled brief, one run from card to merge, and the session budget
order: 11
---

# Running a loop

A loop is one piece of work moving from a written brief to a merged pull
request: a builder builds it, a fresh reviewer reviews it round by round,
and an orchestrator (or you, by hand) keeps the rounds going until a
review approves. This page is the practical side of
[Delegation](./delegation.md), which says why the work is split: how each
role is started, what to paste into it, what a brief looks like, how one
run goes, and how the session budget stops a session in time. You need the
plugin installed ([Quick start](./quick-start.md)) and a project whose
`AGENTS.md` has a `## Delegation` section, which the scaffold writes.

## The short way

You do not have to launch every role yourself. You type one prompt into
your own interactive session, the architect, and it starts the loop for a
card. The prompts below use the phrases the delegation skill answers to
(`write a brief`, `delegate this slice`, `drive this run`, `run the design
loop`). Replace `PROJ-123` with the item's id as your tracker prints it.

**A small slice the session runs itself.** For a slice the plan marks
under about 500 lines:

```
Write the brief for PROJ-123 and delegate this slice: dispatch a builder
for it in its own worktree, review its pull request, and come back to me
only for a decision.
```

You will see the session load the delegation skill, write the brief from
the card in the skill's template (a card that leaves a section unfillable
is not ready, and the session says so rather than guessing), then dispatch
the builder as an `Agent` call with `isolation: worktree`. The dispatched
builder inherits your session's permission mode, so in the default mode you
are asked at each edit as well as at commit and push; switch the session to
accept edits before the dispatch if you want only the commit, push and
pull-request prompts. The builder works to the brief, opens a draft pull
request and marks it ready. The skill's review rule for a builder's pull
request is reviewer rounds, or the architect's own `/code-review medium`;
the session reviews with the latter and passes the findings on. You decide
the merge, and anything the builder or the review escalates: a contract
gap, a wrong brief, a protected path.

**A run handed to an orchestrator.** For a larger slice, or when you want
the rounds driven without your session in the middle:

```
Write the brief for PROJ-123, post it on the item, and give me the launch
command and starting prompt for an orchestrator to drive this run.
```

The session writes and posts the brief, then prints
`claude --agent maybloom-stack:orchestrator --permission-mode acceptEdits`
and the starting prompt from [A prompt for each role](#a-prompt-for-each-role).
You start that session yourself: an architect session does not start the
orchestrator. The orchestrator claims the item and dispatches a builder
call, or, for a large slice and for every review round, posts the launch
command and prompt of a builder or reviewer session on the item and waits
for you to start it. It reads the series after each round and comes to you
only with a question it cannot settle: a diverging series, the merge, an
escalated finding, a run that will not fit its budget.

**A design first, then the build.** For an item whose look is the open
question:

```
Run the design loop for PROJ-123: write the design brief, dispatch the
designer, run at most two critic rounds, and show me the pass before
anything is built.
```

The session writes the design brief, dispatches the designer as an `Agent`
call in a worktree, then launches the critic as a new `Agent` call each
round, at most two, and resumes the designer between them. This needs a
laptop with Chrome ([Design loop](./design-loop.md)). You are asked at the
owner's look: you react to one built pass, pick the direction and accept
any change to `design.md`. The build is then a separate builder brief, the
take, written after your pick, and it runs as either prompt above.

## The roles and how each is started

A session is a `claude` you start in a terminal; an `Agent` call is a
session asking Claude to run a role as a subagent, in its own context. Ask
a session to do it in plain words ("use the `maybloom-stack:mechanic`
agent for this chore: ..."), and the prompt you give is the prompt the
subagent receives.

| Role | How it is started |
|---|---|
| **Architect** | No command: your own interactive session. It plans with you and writes the briefs |
| **Orchestrator** | `claude --agent maybloom-stack:orchestrator --permission-mode acceptEdits`, always a session, never an `Agent` call |
| **Builder** | `claude --agent maybloom-stack:builder --permission-mode acceptEdits`, or an `Agent` call with `subagent_type: maybloom-stack:builder` and `isolation: worktree` for a slice under about 500 lines |
| **Mechanic** | An `Agent` call, `subagent_type: maybloom-stack:mechanic` |
| **Reviewer** | `claude --agent maybloom-stack:reviewer --permission-mode default`, a new session every round |
| **Researcher** | An `Agent` call, `subagent_type: maybloom-stack:researcher`; never a session |
| **Designer** | `claude --agent maybloom-stack:designer`, or an `Agent` call with `subagent_type: maybloom-stack:designer` and `isolation: worktree`; see [Design loop](./design-loop.md) |
| **Critic** | An `Agent` call, `subagent_type: maybloom-stack:critic`, a new call every round; see [Design loop](./design-loop.md) |

The permission mode is a launch flag because a plugin's agents cannot set
one themselves. The orchestrator runs in `acceptEdits` so that the small
builders and mechanics it dispatches, which inherit its mode, can edit
without asking; a dispatched builder still asks at `git commit`, `git push`
and the pull-request command. An `Agent` call inherits its parent's mode.

## One run, from a card to a merged pull request

A run is one pull request closing one item (or a bundle). The item is the
card in your tracker, and its id starts the branch: `PROJ-123/short-slug`.

1. **The architect writes the brief.** In your own session, you and the
   architect turn the card into a brief (below) that fits a session's
   budget. A slice that will not fit is two slices. The brief names the
   branch, the acceptance criteria, the files to touch and what is out of
   scope.
2. **Someone drives the run.** An orchestrator session does it; until a
   runner automates that, you do the orchestrator's job by hand under the
   same rules. The orchestrator reads the item and `AGENTS.md`, claims the
   item (a first comment `[orchestrator] action: claimed`, so two runs never
   pick up the same one) and dispatches the builder. It never edits code.
3. **The builder builds and pushes.** It cuts the branch from an
   up-to-date `origin/main`, writes its reading of the brief into the PR
   body before any code, builds the slice with its tests, runs the checks
   `AGENTS.md` names, goes through each acceptance criterion in the body as
   `met` or `not met` with evidence, and opens the pull request **as a
   draft**. It marks the PR ready for review when it is ready for round 1.
4. **The push starts the round.** Where a runner watches the forge, the
   head marked ready starts round 1, and every later push before the final
   approval starts another, after a short settle window. Where no runner
   watches, the orchestrator posts the reviewer's launch command and prompt
   for the head and you start that session, or you launch it by hand.
   **A draft gets no round**: a builder whose fix takes several commits
   sets the PR back to draft, pushes once, whole, and marks it ready
   again. To hand-run the rounds yourself on a repo a runner watches,
   put the `hands-on` label on the item first and remove it when you
   hand the run back; a builder waiting on the tool then hands back
   instead of waiting.
5. **A fresh reviewer posts findings.** Each round is a new reviewer
   session. In round 1 it first compares the builder's reading with the
   brief, then the acceptance list, then the code. It posts
   `Round <n> at <sha>`, each finding as an id (`R<n>-<i>`), a severity,
   `file:line`, what breaks and the least-change fix, and a verdict.
6. **The builder answers every finding.** One line per finding, pushed
   first, then posted at once with a header:

   ```
   [builder] Ready for round 2, head <sha>
   R1-1: fixed <sha>
   R1-2: disputed: <reason with a file:line or test:<Name> token>
   R1-3: deferred: <item>
   R1-4: escalated: <question for the owner or the architect>
   R1-5: not addressed: <why>
   ```

   A finding with no line counts as not addressed. A dispute needs evidence
   the reviewer could have read; without it the finding is `escalated`.
7. **The series decides when to stop.** The orchestrator keeps a row per
   round and reads the state from it:
   - **converging**: blocking findings not rising, fixes confirmed. Start
     the next round and ask nobody.
   - **diverging**: blocking findings return after a round without them,
     the same finding or file region keeps drawing should-fix or worse,
     most of a round is disputed or escalated, or six rounds have run.
     The run stops and files a decision for you, with the series and the
     least-change option.
   - **ready**: zero blocking this round and at most two the round before.
     The orchestrator requests one deep review and says it is the gate.
8. **The gate and the merge.** Only the deep review can end `APPROVED at
   <sha>. Merge allowed.` (where you have allowed the builder to merge, in
   a comment on the run's item) or `ready for the owner's merge at <sha>`.
   The orchestrator then posts the run's learning, `[orchestrator] action:
   learning: <file> — <line>` or `learning: none`; the builder commits that
   line before the merge and the push starts no new round. Then the pull
   request is squash-merged.

At the session budget, or on a diverging series, a session writes a
hand-off (the format is under [The session budget](#the-session-budget))
and stops; a fresh session resumes from the item.

## A prompt for each role

Each prompt is written to the input its agent file says it starts with.
Replace what is in angle brackets. Paste it as the first message after
launching the session, or as the prompt of the `Agent` call.

**Orchestrator** (starts with the item, the PR if one exists, and the
`## Delegation` section of `AGENTS.md`):

```
Drive the run for PROJ-123. There is no PR yet; the brief is on the item.
(Or: the PR is <n>, head <sha>.)
Read the item and its newest comments, the PR if there is one, and
AGENTS.md section Delegation. Then claim the item.
Put your session id ($CLAUDE_CODE_SESSION_ID) in your first comment.
```

**Builder** (the brief is the whole prompt; when a session, it also puts
its id on the channel, which is what the orchestrator asks it to do):

```
<paste the whole brief here>

Put your session id ($CLAUDE_CODE_SESSION_ID) in your first comment on
the channel.
```

**Reviewer** (starts with the PR body and diff, the items it closes,
`AGENTS.md`, and the earlier rounds' findings and dispositions):

```
Review round <n> of PR <number> at head <sha>. It closes PROJ-123.
Read the PR body and diff, the item and its newest comments, AGENTS.md,
and the earlier rounds' findings and the builder's dispositions.
Post the round on the channel. Put your session id
($CLAUDE_CODE_SESSION_ID) in the comment.
```

For the deep review, add `This round is the gate: the deep review.`

**Mechanic** (the prompt is one chore):

```
Chore: bump the pnpm catalog entry for <package> to <version> in
pnpm-workspace.yaml, run the lockfile update, and run the lint command
from AGENTS.md. No product code.
```

**Researcher** (the question, what to compare against, the buckets, and a
report path outside the repo):

```
Question: is <library> still maintained, and what do <two alternatives>
do better? Compare against what this repo does: read AGENTS.md and
docs/<the page it affects>.md first.
Buckets: maintenance, features, licence, migration cost.
Write the report to ~/.cache/maybloom-research/<date>-<slug>.md and
post a summary on PROJ-125.
```

The designer's and the critic's prompts are on [Design loop](./design-loop.md).

## A filled brief

A brief is the whole prompt of a builder and it states only the slice: the
agent carries the standing rules, the tool set and the budget. It has these
sections, in this order. A section you cannot fill means the brief is not
ready, and the gap is the architect's to close first. This one is for the
scaffold's example `Note`, using the `include_archived` field the contract
already has:

```markdown
# PROJ-123 — show archived notes on the notes screen

Branch: PROJ-123/show-archived (the PR body names PROJ-123 and every other
item the PR closes)

## Acceptance criteria
- [ ] The notes screen has a "Show archived" switch, off by default.
- [ ] With the switch on, archived notes appear in the list, marked as archived.
- [ ] Turning it off again removes them without a reload.
- [ ] The switch's state survives archiving a note (archiving does not reset it).
- [ ] A test covers the list with the switch on and off.

## Data
- Queries / hooks: extend `useNotes` in `features/notes/useNotes.ts` to take
  `includeArchived` and pass it to `listNotes`; the query key gains the flag.
- Invalidations: `useArchiveNote` and `useCreateNote` invalidate the notes
  key as they do now; the key must still match both flag values.
- Contract: `ListNotesRequest.include_archived` is read; no change.

## Design refs
- The row keeps `NoteRow`; the archived mark reuses the existing caption
  style from the tokens.
- Board: `NoteRow` gains an archived state in its entry; the notes page
  entry shows the switch on and off.

## Files to touch
- `packages/interface/src/features/notes/useNotes.ts` — the flag and the key
- `packages/interface/src/features/notes/NotesScreen.tsx` — the switch
- `packages/interface/src/features/notes/NoteRow.tsx` — the archived state
- `packages/interface/src/features/notes/NotesScreen.test.tsx` — the test
- the board entries for `NoteRow` and the notes page

## Out of scope
- Unarchiving. Paging beyond the first page. Any change to the proto.

## Checks
- The defaults in AGENTS.md section Delegation.
```

## The session budget

An interactive session works inside a share of its context window: **30%
by default**, more only when you say so for that session. Every tool call
replays the whole context, so a session that has gone past the budget costs
more and remembers worse; a fresh session beats compaction, which keeps
going on a lossy summary. A run is sized to fit, and a slice that will not
is split.

Two parts enforce it in a scaffolded project:

- **The status line** colours `ctx:` yellow at the budget and writes each
  session's numbers to
  `${XDG_CACHE_HOME:-~/.cache}/claude-statusline/sessions/<session_id>.json`
  (see [Status line](./status-line.md)).
- **The hook**, `.claude/hooks/session-budget.sh`, runs on every prompt you
  submit (a `UserPromptSubmit` hook in the project's `.claude/settings.json`),
  reads that file, and once per threshold tells the session to write the
  hand-off and propose stopping. It never blocks a prompt. With no status
  line, no numbers file or no `jq`, it prints nothing.

Its four thresholds are environment variables, read by the hook:

| Variable | Default | Meaning |
|---|---|---|
| `MAYBLOOM_CTX_BUDGET_PCT` | 30 | Context percentage at which the first warning fires |
| `MAYBLOOM_CTX_STEP_PCT` | 10 | A further warning at each step above the budget (40, 50, ...) |
| `MAYBLOOM_5H_WARN_PCT` | 80 | One warning per 5-hour window at this usage: finish, hand off, start nothing new |
| `MAYBLOOM_WEEK_WARN_PCT` | 90 | The same for the weekly window |

A project's `settings.json` `env` block reaches the hook. Whether it
reaches the status line's colouring is not verified, so set a changed
budget in the shell that starts Claude Code as well.

When the hook warns about context, the session posts the hand-off on the
run's item and proposes stopping, never mid-fix. If you say to go on, the
session runs the `ok` switch, which stops the context warnings for that
session (the usage warnings are not silenced by it):

```
touch ${XDG_CACHE_HOME:-~/.cache}/claude-budget/<session_id>.ok
```

The hook speaks only when a prompt arrives, so a session that works for a
long time from one prompt (an orchestrator between rounds, a builder on a
brief) reads its own number at each round boundary:

```
jq .ctx_pct "${XDG_CACHE_HOME:-$HOME/.cache}/claude-statusline/sessions/$CLAUDE_CODE_SESSION_ID.json"
```

`null` means the file exists but has no context number yet; check again at
the next boundary. An error that the file cannot be opened (with an empty
`CLAUDE_CODE_SESSION_ID` it names `sessions/.json`) means there is no
numbers file: the status line is not installed, or has not run in this
session. The variable is not in Claude Code's own
documentation, so confirm it on your build. An `Agent` subagent shares its
parent's session id, so it would read the parent's number: it keeps to its
`maxTurns` and the brief size instead (the builder stops at 120 turns or
about 150K tokens of context).

The hand-off is posted on the run's item at the budget, in this fixed
format:

```
HANDOFF
- Branch/head: <branch> at <sha> (PR <n>, or "no PR yet")
- Open findings: <id: state> per finding, or "none"
- Verified: <what was run, the exact commands, and the result>
- Known limits: <what was not run or not covered, and why>
- Next step: <the one thing the next session does first>
```

## Which forge and tracker

The agents reach the pull request through the forge's own command-line
client: `gh` on GitHub (signed in with `gh auth login`), and on Forgejo
`fjo`, which the forgejo skill provides. Install that skill from its own
marketplace:

```
/plugin marketplace add MaybloomTech/forgejo-skill
/plugin install forgejo@forgejo-skill
```

Then connect `fjo` to your Forgejo instance with `fjo init --url <your
instance URL> --token-file <path>`, using an access token generated for the
account the agent will act as; the skill's README has the token scopes.

The agents reach the item through the tracker's skill, which names the
tracker's CLI; load the skill for whichever you use. A project's
`AGENTS.md` says which channel the roles post on, the item or the pull
request.

## Review-loop tools and the comment fallback

A review-loop tool is a command the project provides for the round
traffic of a run: the builder's Ready header and disposition lines go in
through it, and the round's findings and series state are read back from
it, instead of through comments. The reason to have one is a runner that
counts dispositions from structured input rather than reading prose. The
plugin does not ship one and does not fix its commands.

A project names its tool in its `AGENTS.md`, and says how to call it. The
builder, the reviewer and the designer read `AGENTS.md` at the start of a
run and use the tool when it names one: the builder sends the header and
the lines through it and waits on it for the next round, and the reviewer
posts its round through it. The scaffolded `## Delegation` section has
four items (protected paths, where commands run from, the builder checks,
the mechanic checks) and no slot for a tool, so a project that has one adds
a short paragraph of its own, for example:

```markdown
## The review loop

Answer each round with `<tool> answer ...` and read the round with
`<tool> series`. A comment on the pull request is prose; nothing reads
its lines.
```

Without a tool the fallback is the run's channel: the tracker item, or the
pull request's own conversation where the runner that watches the forge
posts its rounds there (`AGENTS.md` says which). The builder posts one
comment starting `[builder] Ready for round <n+1>, head <sha>` followed by
its lines, the reviewer posts `[reviewer] Round <n> at <sha>`, and a
builder session waits for the next round in a `/loop` that polls the
channel, paced at 270 seconds, until the series diverges or a round
approves its head. Every comment starts with its role in brackets.
