---
title: Quick start
description: Install the plugin, then the first thing to type for each of its four uses
order: 2
---

# Quick start

The stack ships as a Claude Code plugin. One install gives you four
things: a project template, a set of agents that build and review work in
a loop, a design loop, and a status line. This page installs the plugin
and gives the first prompt for each; every one links on to the page that
covers it in full.

## Install the plugin

You need [Claude Code](https://code.claude.com/docs). From inside it, run:

```
/plugin marketplace add MaybloomTech/maybloom-stack
/plugin install maybloom-stack@maybloom-stack
```

That installs every skill and every agent, namespaced under
`maybloom-stack` (the template skill is
`maybloom-stack:maybloom-stack-bootstrap`, the builder agent is
`maybloom-stack:builder`). [Skills](./skills.md) says what each skill does, and how to update the
plugin later.

You use skills by describing what you want in a session: a skill's
description lists the phrases it answers to. You use agents by launching
them, as the pages below show.

## A new project from the template

Use this when you are starting a service and want the stack's shape from
the first commit: a protobuf contract, a Go backend (TypeScript on
request), an Expo client and a docs site, with one example resource wired
through every layer. In a session started in an empty folder, type:

```
Bootstrap a new maybloom stack project called Orchard.
```

The skill asks for the slug, the npm scope, where to put it, the
backend, public or private, and the licence, then scaffolds the project
and walks you through the checklist that follows. Go is the default; say
`with a TypeScript backend` to get the other one. Once the project
exists, ask for `add a Book resource` or `add a due date to Note` and the
sibling skills take over. See [Skills](./skills.md) for the family and
[Choosing a runtime](./choosing.md) for the backend question.

## Agents that build and review in a loop

Use this when the work is bigger than one conversation: an architect
session writes a brief, a builder builds it, a fresh reviewer reviews it
round by round. The first thing to type, in a session in your project, is:

```
Help me write a brief for this slice: <what you want built>.
```

The delegation skill answers `write a brief` with its brief template and
sizes the slice to a session. To start a whole loop on a card, say:

```
Write the brief for PROJ-123 and delegate this slice: dispatch a builder
for it in its own worktree, review its pull request, and come back to me
only for a decision.
```

[Running a loop](./running-a-loop.md#the-short-way) has this prompt in
full, and two more: one that hands the run to an orchestrator, one that
starts with the design loop. To launch the builder yourself, the brief is
its whole prompt:

```
claude --agent maybloom-stack:builder --permission-mode acceptEdits
```

[Running a loop](./running-a-loop.md) has the launch command for every
role, one prompt to paste for each, a filled brief and a walk through one
run from card to merged pull request. [Delegation](./delegation.md) says
why the work is split this way.

## A design before it is built

Use this when a screen's look needs deciding before anyone builds it: a
designer proposes sketches and builds one pass on the design board, a
critic judges it from screenshots, and you look last. It runs on a laptop
with Chrome. In a session in a scaffolded project, type:

```
Run the design loop for the notes list screen.
```

The [design loop](./design-loop.md) page has the launch commands for the
designer and the critic, the capture script and what happens after you
approve.

## The status line

Use this to see your usage and your session budget while you work: the
5-hour and weekly windows with their reset countdowns, context against the
budget, and the prompt cache countdown. It also feeds the budget hook the
scaffold installs. It needs `jq`, `curl` and `git`. In any session, type:

```
Install the status line.
```

The skill copies one script into `~/.claude` and sets the `statusLine`
key in `~/.claude/settings.json`. The [status line](./status-line.md) page
shows the output, what the install changes, how to check it and what to do
when a segment is missing.
