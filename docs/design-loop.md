---
title: Design loop
description: How a screen's look is decided before it is built, by a designer, a critic and the owner
order: 12
---

# Design loop

The design loop decides what a screen looks like before anyone builds it.
A designer proposes two or three directions and builds one of them as a
throwaway pass on the design board, a critic in a fresh context judges that
pass from screenshots, and then you, the project owner, look at one built
thing and choose. A builder moves the chosen pass into the app afterwards.
It runs on a laptop, because both agents drive a real Chrome against a
served board.

## When to use it

Use it for a screen, a component or a whole direction where how it looks is
the question: a new screen with no obvious shape, or a visual change the
owner wants to react to before it is real. Do not use it for a slice whose
design is already settled in `design.md` and the existing primitives; that
is a plain builder brief (see [Running a loop](./running-a-loop.md)).

## The two roles

| Role | Does | Launched as |
|---|---|---|
| **Designer** | Asks what the brief leaves open once, sketches two or three directions, builds one pass under `src/design/` from the real primitives and fixtures with all four states of every region that loads data, captures the board, fixes what the probes show, opens the pass as a draft PR | `claude --agent maybloom-stack:designer`, or an `Agent` call with `subagent_type: maybloom-stack:designer` and `isolation: worktree` |
| **Critic** | Checks out the PR's head itself, captures the board on a port of its own, and posts one `[critic]` comment with a verdict and at most eight findings; never edits | An `Agent` call with `subagent_type: maybloom-stack:critic`, a new call every round |

The designer never touches hooks, data, the contract, the primitives,
`src/styles/tokens.ts`, or anything outside `src/design/` except
`design.md`. What the pass needs from those places is listed in its report
for the owner or the builder. The designer has no `Agent` tool, so it
cannot launch the critic: the session that called the designer does, so
that the critic judges the result and not the designer's intent.

## What they need

- **A laptop with Chrome.** The capture script drives the installed Google
  Chrome through Playwright's `chrome` channel and downloads no browser;
  `CHROME_PATH` points it at another binary. The review runner has no
  Chrome, so neither role runs there.
- **A scaffolded interface with its board.** The board is the interface's
  design board, the app's components and pages laid out on one sheet per
  tab, served for the browser; run `pnpm install` first (a fresh worktree has no
  `node_modules`).
- **The board served** on a port of the role's own, not the script's 8082,
  which may belong to another worktree. The interface's `gallery` script is
  `EXPO_PUBLIC_GALLERY=1 expo start --web --port 8082`: run that command
  with your port, and add `--clear` before a final capture, because the
  server can serve a stale bundle after edits.
- **A design brief** (below), and `design.md` at the repo root if the
  project has one. It is the locked statement of how the project looks and
  it decides over taste. A project without one has no locked direction, and
  the first pass proposes it.

## Launch and prompts

The architect writes the design brief; the [loop reference](https://github.com/MaybloomTech/maybloom-stack/blob/main/skills/maybloom-stack-shared/references/design/loop.md)
lists what it names: what is designed, for whom and for what use, the
surfaces and which rubric each uses, whether the project has a `design.md`,
whether this is a new direction or a change to one screen, and the card the
pass belongs to. The designer's whole prompt is that brief.

Start the designer as a session in your worktree:

```
claude --agent maybloom-stack:designer
```

and paste a prompt like this:

```
Design brief for PROJ-123.

Branch: PROJ-123/notes-list-design
Design: the notes list screen, a change to one screen (no new direction).
For: someone scanning their notes to find one to open or archive.
Surfaces: the notes list, at phone and desktop widths; rubric-app.md.
design.md: yes, at the repo root.
The pass belongs to PROJ-123; open the pass PR as a draft, "Part of PROJ-123".
```

Or ask any session to run the designer as an `Agent` call in a worktree of
its own, with the same brief as the prompt. The designer opens the PR as a
draft and keeps it a draft through the critic rounds and your look.

When the designer stops, the caller launches the critic as an `Agent` call
with `subagent_type: maybloom-stack:critic`. Its prompt names the brief,
the rubric and the PR:

```
Critique round 1 of PR <n> at head <sha>.
Design brief: <the brief, or its path on the PR>.
Surface: the notes list, a change to one screen; rubric: rubric-app.md.
design.md is at the repo root. The sketches are in the PR body.
Capture the head yourself on a port of your own, with --strict.
```

If you ran the designer as a session, you are the caller: ask another
session to run the critic `Agent` call with this prompt, then tell the
designer session that the `[critic]` comment is on the pull request.

The critic posts its comment on the pull request, headed
`[critic] round <n> at <sha>`, and returns the same text. Its findings are
numbered `C<n>-<i>` so they cannot be confused with the reviewer's
`R<n>-<i>`.

## The capture script

`scripts/capture-board.mjs` in the interface package writes one PNG per
view and width and one `probes.json` of mechanical checks, so the reader
opens the JSON first and only the shots it points at. Serve the board,
then run the interface package's `capture` script:

```
pnpm --filter <scope>/interface capture \
  [--base-url http://localhost:8082] \
  [--view pages@390 --view components/NoteRow@768] \
  [--out .board-captures] [--strict]
```

| Flag | Meaning |
|---|---|
| `--base-url` | Where the board is served; default `http://localhost:8082` |
| `--view` | One view in the board's own hash form, `<tab>[/<entry>][@<width>]`; repeat it for several. Without a width the view is taken at every width the board offers (390, 768, 1280). With no `--view`, every tab at every width |
| `--out` | The folder for the shots and `probes.json`; default `.board-captures`, which the scaffold's `.gitignore` lists |
| `--strict` | Any failing probe exits 1 |

Without `--strict` the exit code is 0 and one line per view is printed,
for example `pages@390  overflow 0  nested 0  focus 2/14 no ring  contrast
1  console 0`. A missing Chrome exits 2 with one line on how to point at
one. The probes are overflow, nested interactive elements, the
keyboard-only focus ring, text contrast and console warnings. A probe
failure is fixed, not explained. Both roles run the capture with
`--strict`; the captures stay out of the commit.

## The references

The method and the rubrics live in the plugin, in
`skills/maybloom-stack-shared/references/design/`, with the Expo
translation in the sibling folder `references/paths/client-expo/`. The
roles load them themselves; the table is so you know what they are
working from.

| File | What it is |
|---|---|
| `README.md` | Routes each role to what it reads, in order |
| `loop.md` | The loop end to end, from the brief to the take |
| `design-md.md` | The `design.md` convention: register, tokens, type scale, surfaces |
| `rubric-app.md` | Rules for screens someone works in |
| `rubric-reading.md` | Rules for pages someone reads |
| `critique.md` | The critic's procedure and output |
| `inspiration/` | Sources to draw a register or a vocabulary from, tagged by screen kind (one entry now, `affectui.md`) |
| `../paths/client-expo/design.md` and `gallery.md` | The React Native translation: tokens, the pass folder, the take, and how the board and the capture work |

A rubric item is marked **probe** where the capture script checks it and
**judged** where the critic decides from the shots. A passing probe means
the mechanical failure is absent, not that the rule is met.

## Rounds, the cap and your look

1. The designer builds the pass, captures with `--strict`, reads
   `probes.json` and fixes what it shows.
2. A critic (fresh each round) returns a verdict, `ready for the owner` or
   `another designer pass`, and at most eight findings ranked `breaks`,
   `should-fix` or `polish`. The designer fixes the `breaks` and
   `should-fix` findings and captures again.
3. **At most two critic rounds** happen before you look. If a second round
   finds the same `breaks`, the verdict is `another designer pass` and the
   critic says the direction itself may be wrong. That goes to you as it
   stands; a third pass of the same findings is not run.
4. You look at **one built pass**. The directions not built are in the PR
   body in two lines each, so you can say "try B". You pick the direction,
   and any change to `design.md` is your decision.

## After you approve

The designer marks the pass PR ready only once you have picked. That PR is
`Part of <card>`, never `Closes`: it holds `src/design/<pass>/`, its
registration in `passes.ts`, `design.md` if it changed, and the captures'
summary, and it does not touch the app. Its reviewer rounds run as in
[Running a loop](./running-a-loop.md), the designer answering in the same
`R<n>-<i>` lines.

The design does not become the app by merging that PR. The **take** is a
builder's PR that moves the chosen pass into primitives and features,
wires data and URL state, writes tests, removes the pass from
`src/design/` and, for a new direction, copies the token values into the
token module. Its body says `Closes <card>`, and the normal review rounds
run on it.
