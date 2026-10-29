# design.md

The locked statement of how a project looks. One file at the repository
root, named `design.md`. A project without one has no locked direction; the
first design pass proposes it.

## What it is for

It holds the decisions a designer would otherwise remake each time, so a
second screen looks like the first. When it disagrees with taste, it wins.
It is **locked**: a designer proposes a change in a pass's PR, and only the
owner accepts it.

## Sections, in order

1. **Register.** One paragraph: what the product feels like to use, in the
   words of its own domain, and what it refuses. A reader should be able to
   predict a screen from it.
2. **Tokens.** One code block, listing every token with its value. The
   names match the interface's token module (`src/styles/tokens.ts`) **one
   to one**: the same groups, the same keys. Values are what React Native
   takes: hex or rgba strings for colours, numbers for sizes. No other
   units, no `oklch()`. A new direction adds keys by changing the module in
   the take, so a key here that the module lacks is a proposal, marked as
   such.
3. **Type scale.** The faces, sizes, line heights and weights by role
   (title, label, body, caption and whatever the product adds), with the
   ratio between steps. Roles match the `typography` group in the tokens.
4. **Surfaces.** Each surface or screen kind, and which rubric it uses:
   `rubric-app.md` or `rubric-reading.md`.
5. **Inspiration.** The sources the direction draws on, by name with a
   pointer to their entry under `design/inspiration/`, and what it borrows.
6. **Decisions.** A dated list, newest first, one line each: what was
   decided, by whom (owner or designer-proposed and accepted), and why in a
   clause. A reversal is a new line, not an edit.

Keep it to about fifty lines. A file longer than that is carrying prose that
belongs in a pass's PR.

## How it relates to the token module

`design.md` is read by agents; `tokens.ts` is read by the app. They carry
the same values and neither is generated from the other. The take copies
values from `design.md` into the module by hand (the block is already in
the module's shape, so nothing converts); in a pass that carries a new
direction, the take copies from the pass's `tokens.ts` and checks it
against `design.md`, and the next change to a token
starts in `design.md`. If the two disagree, that is a bug in whichever
changed last without the other.

## An example, in outline

```
# Design

## Register
A working tool for people who triage a queue all day: quiet, dense, ...

## Tokens
colors: text, textSecondary, screen, surface, border, primary, ...
spacing: xs 4, sm 8, md 12, lg 16, xl 24
radii: sm 4, md 8
typography: title, label, body, caption

## Surfaces
Queue, detail, settings: rubric-app. Help pages: rubric-reading.

## Decisions
- 2026-11-02 Accent moves from green to blue (owner): ...
```

Adapted from Hallmark's `design.md` (MIT); see `NOTICE`.
