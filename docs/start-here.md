---
title: Start here
description: From Claude Code, gh and a GitHub account to one merged change through the delegation loop, step by step
order: 2
---

# Start here

This page takes you from nothing to one pull request, built and reviewed
by agents, merged on your own repository. It assumes nothing but the
three things in the next section. Each step has its commands, what you
should see, and a link to the page that goes deeper.

## 1. What you have, what you get

You have:

- [Claude Code](https://code.claude.com/docs), signed in.
- `gh`, the GitHub command-line client, signed in (`gh auth login`).
- A GitHub account.

You get a new project on your account, one issue you wrote, and one pull
request that closes it, built by one agent, checked by another and
merged by you. Plan on a couple of hours the first time.
Most of it is installs and waiting for the agents.

## 2. Words you will meet

The loop has its own words. Each is used below only after this list.

- **Owner**: you. You decide, and you merge.
- **Architect**: your own interactive Claude Code session. It plans with
  you and writes the brief. It writes no code for a builder's slice. For
  some changes (for example a change to the server or the proto) it
  writes the code itself.
- **Forge**: the site that hosts the repository and its pull requests,
  here GitHub.
- **Worktree**: a second checkout of the same repository in its own
  folder, so two sessions never share files.
- **Item**: one piece of work, here a GitHub issue.
- **Brief**: the written task for the agent that builds: what to build, how you will
  know it is done, which files to touch, what is out of scope.
- **Slice**: the part of an item one session can finish.
- **Builder**: an agent that builds one slice from a brief and opens the
  pull request.
- **Reviewer**: an agent that reviews a pull request and never edits it.
  Each time it is a new one.
- **Run**: one pull request closing one item, from brief to merge.
- **Round**: one review of the pull request at one commit, with its
  findings. Fixes start the next round.
- **Channel**: where the roles post. For you, the pull request's
  conversation.
- **Series**: the list of rounds so far, and whether they are converging
  (getting cleaner), diverging (not) or ready.
- **Review gate**: the last round, a deeper review. Only its approval
  ends the series.
- **Driver**: whoever moves the run along: starts the rounds, reads the
  series, passes findings to the builder.
- **Runner**: a program that does the driver's job by watching the forge.
  You have none, so your architect session is the driver.

[Delegation](./delegation.md#the-roles) says why the work is split this
way, and has the full table of roles. The status line, which shows usage
and your session budget in the terminal, is optional: the loop runs
without it.

## 3. Install the plugin

In Claude Code:

```
/plugin marketplace add MaybloomTech/maybloom-stack
/plugin install maybloom-stack@maybloom-stack
```

This installs the skills and the agents, namespaced under
`maybloom-stack`. More in [Quick
start](./quick-start.md#install-the-plugin).

## 4. Install the toolchain

The scaffold builds on your machine and needs Python 3, git, Node 24,
pnpm 10, and Docker, which runs the Go toolchain and the database. [What you
need](./quick-start.md#what-you-need) has the list and how to get each
one.

## 5. Scaffold and push

Shell commands on this page go in a second terminal, in the project
folder (or type them in Claude Code with a leading `!`). Claude Code
prompts go in the session.

Make an empty folder and start Claude Code in it:

```
mkdir orchard && cd orchard && claude
```

Then type:

```
Bootstrap a new maybloom stack project called Orchard.
```

The bootstrap skill asks for a slug, an npm scope, where to put the
project, the backend (Go unless you say otherwise), public or private,
and a licence. When it asks where to put the project, answer `here, in
this folder`: the session has to be inside the repository for the rest of
this page. Answer the rest, and it writes the project. It then walks you
through its checklist: dependency versions, `pnpm install`, the
backend's generate step, `git init -b main` and the first commit. Do the
install steps before you commit: CI installs with `--frozen-lockfile`
and needs `pnpm-lock.yaml` in that commit.

Then put the project on GitHub. Every later step needs it. From the
project root, with the command's `--private` or `--public` matching what
you chose:

```
gh repo create <owner>/<slug> --private --source . --push
```

`<owner>` is your GitHub user name. You should see the repository's URL
and `branch 'main' set up to track 'origin/main'`. Check with
`git remote -v` and `gh repo view`.

The roles file their questions under a `decision` label, and the
architect looks for work under a `ready` label. Create both:

```
gh label create ready --description "cleared to start"
gh label create decision --description "a question for the owner"
```

The project's other first steps (what the scaffold needs from you, branch
protection, CI settings) are in [Quick
start](./quick-start.md#a-new-project-from-the-template).

## 6. Make the item

The item is a GitHub issue. Its number is its id. Write it as the
first draft of the brief: the outcome as acceptance criteria, and what is
out of scope. Save it as `/tmp/item.md`, outside the project, so it never
lands in a commit:

```markdown
Show archived notes on the notes screen.

Acceptance criteria:
- The notes screen has a "Show archived" switch, off by default.
- With the switch on, archived notes appear in the list, marked as archived.
- Turning it off again removes them without a reload.
- A test covers the list with the switch on and off.

Out of scope: unarchiving, paging, any change to the proto.
```

Then file it, marked ready:

```
gh issue create --title "Show archived notes on the notes screen" --body-file /tmp/item.md --label ready
```

It prints the issue's URL, which ends in the number. Call it `<issue>`
below. On a new repository the first issue is 1, but Dependabot, which the
scaffold sets up, may take that number before you, so check. The branch for
this item is `<issue>/<short-name>`, for example `1/show-archived`, and the pull
request body will say `Closes #<issue>`.

This is the default tracker: the forge's own issues, so nothing else to
install. [The tracker](./running-a-loop.md#the-tracker) says how to use
another one later.

## 7. Build

In the architect session (the one in the project folder, start
`claude` there if you closed it), type:

```
Item <issue> is ready. Run it through the delegation loop.
```

Write your issue's number in place of `<issue>`.

If the session does not start by loading the `maybloom-stack-delegate`
skill, say `Load the maybloom-stack-delegate skill first.` It is the
skill that knows the roles.

What you will see:

1. The session loads the delegate skill, reads the issue with
   `gh issue view`, and claims it with a comment.
2. It writes the brief from the issue, in the skill's template, and shows
   it to you. A section it cannot fill (no files, no checks) it asks you
   about instead of guessing. [A filled
   brief](./running-a-loop.md#a-filled-brief) shows one for this same item.
3. It dispatches a builder in a worktree of its own (for a larger slice, over
   about 500 lines, it gives you a builder command to start in a second
   terminal instead). The builder inherits
   the session's permission mode, so in the default mode you are asked at
   every edit as well as at commit and push. Switch the session to accept
   edits (Shift+Tab) before you answer the brief if you want only the
   commit and push prompts, and approve those.
4. The builder writes its reading of the brief into the pull request
   body, builds the slice with its tests, runs the checks, opens the
   pull request as a draft (`gh pr create --draft`) and marks it ready
   (`gh pr ready <pr>`) when it is ready for round 1.

The pull request has its own number. Dependabot, which the scaffold sets
up, opens a pull request of its own soon after the first push, so yours
is often not the issue's number plus one. Read the number from the
session, from `gh pr list`, or from the output of `gh pr create`. It is
`<pr>` below.

## 8. Review, round by round

With no runner nothing starts a review on its own: the session, as the
driver, does. It starts each round itself: a new
reviewer agent in a detached worktree. It passes each round's findings to the
builder (resuming the same builder, or starting a new call with the
findings if it cannot be resumed) and starts the next round itself. It
asks you only if the series diverges, a finding needs your call, or at
the merge. Read any round with:

```
gh pr view <pr> --comments
```

The session repeats this until it reads the series as ready: no blocking
findings this round, and at most two the round before. Then it runs the
gate: one more reviewer, told `This round is the gate: the deep review.`
If the series diverges instead, it stops and asks you what to do.
[Running a loop](./running-a-loop.md#one-run-from-a-card-to-a-merged-pull-request)
has all eight steps of a run and the rules for the series. Go on to
section 9 when the gate approves.

To run a reviewer yourself in a terminal of your own, the launch line and
its prompt are in [A prompt for each
role](./running-a-loop.md#a-prompt-for-each-role). Add this line to the
build prompt in section 7, before you send it, so the session does not
start the same round:

```
I will run the review rounds myself; wait for my word after each.
```

If the build has already started, leave the rounds to the session.

## 9. Merge

When the gate says `ready for the owner's merge`, you are not done yet.
After the gate the session posts the run's learning (one line on what
would have made the run faster, or `none`), and the builder commits it to
the pull request. Wait until the session says that commit is pushed, or
that there is no learning. That push starts no new round. Then look at
the pull request once yourself, and check that its CI checks are done:

```
gh pr checks <pr> --watch
```

Then squash-merge it:

```
gh pr merge <pr> --squash
```

The pull request body says `Closes #<issue>`, so the issue closes by
itself a few seconds after the merge. Check with `gh issue view <issue>`.
You now have one change on `main` that a builder wrote, a reviewer checked
and you merged.

On a private repository on GitHub's Free plan the checks run but are not
enforced, so `gh pr merge` does not wait for them: watch them first, as
above.

## 10. Next

- [Design loop](./design-loop.md): decide a screen's look before it is
  built.
- [Status line](./status-line.md): usage windows, context against your
  session budget, the cache timer.
- [The session budget](./running-a-loop.md#the-session-budget): how a
  session knows when to hand off.
- [Another tracker](./running-a-loop.md#the-tracker): the plugin's
  `tracker` option, or a `Tracker:` line in the project's `AGENTS.md`.
- [A runner](./delegation.md#the-roles): a program that starts the rounds
  for you, so you are no longer the driver. The plugin ships none.
