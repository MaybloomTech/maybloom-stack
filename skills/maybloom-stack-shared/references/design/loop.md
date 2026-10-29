# The design loop

One design change, from the owner's request to code in the app. The
roles are a designer
([`maybloom-stack:designer`](../../../../agents/designer.md)), a critic
([`maybloom-stack:critic`](../../../../agents/critic.md)), a builder, a
reviewer and the owner; the architect writes the brief. Nothing here is
a runtime: it is the order of work.

## 1. The design brief

The architect writes it, and it names: what is being designed (a screen, a
component, a whole direction), for whom and for what use, the surfaces it
touches and which rubric each uses ([rubric-app.md](./rubric-app.md) or
[rubric-reading.md](./rubric-reading.md)), whether the project has a
[design.md](./design-md.md), and whether this is a **new direction** or a
**change to one screen** (the token rule, below). It names the card the
pass belongs to.

## 2. Intake, once

The designer asks what the brief leaves open, in one message, never a
second: the material (what the screen shows), the audience, the use (what
they are trying to get done) and the tone. For anything not given it
infers and states the inference. It then reads `design.md` if there is one;
that file decides over taste.

## 3. Set aside the page one would make anyway

Before sketching, write down the screen this prompt gets without trying,
and its obvious twist. Neither ships. For an app screen that is usually a
row of four stat cards over a table, a left sidebar with six icons, rounded
cards on a pale ground with one careful accent. If two of these appear in
the plan, the plan is the template: start from what the product is.

## 4. Sketch two or three directions

Two lines each: the idea, and how it is built and how it looks. Far apart,
not variations. Pick the one a design lead would fight for, not the safest,
and borrow from the others only what makes it stronger. Draw on
[inspiration](./inspiration/README.md) where a source fits the screen kind.
The sketches are text; only one is built.

## 5. Build one pass

The chosen direction is built as a design pass under `src/design/`, beside
the components it would replace, using the real primitives and fixtures (see
the path's [design.md](../paths/client-expo/design.md) for the layout). All
four states of every region that loads data are drawn, not only the full
one.

**The token rule.** A new direction carries its token set: proposed in
`design.md`, built inside the pass, not yet in the interface's token module.
A change to one screen uses the existing tokens only; if it needs a value
the tokens lack, that is a finding for the owner, not a quiet addition.

**What the designer never touches:** hooks and data, the contract, the
primitives, `src/styles/tokens.ts`, or anything outside `src/design/`
except `design.md` itself.

## 6. Capture and probe

The designer captures the board (the path's design.md links the script) and
reads the probe output before anyone else looks: overflow, nested
interactive elements, keyboard-only focus ring, text contrast, console
warnings. A probe failure is fixed, not explained. The designer opens the
shots itself and fixes what it sees.

## 7. Critic rounds

A critic in a fresh context reviews the captures and the probes against
`design.md` and the rubric ([critique.md](./critique.md)). It returns
findings and a verdict. The designer fixes `breaks` and `should-fix` and
captures again. **At most two critic rounds** before the owner looks; a
third pass of the same findings means the direction, not the polish, is
wrong, and goes to the owner as it stands.

## 8. The owner looks

The owner reacts to **one built pass**. The sketches not built go in the
PR body in their two lines, so the owner can say "try B". The owner picks
the direction, and any change to `design.md` is the owner's decision.

## 9. Two PRs

- **The pass PR** holds `src/design/<pass>/`, its registration in
  `passes.ts`, `design.md` if it changed, and the captures' summary. Its
  body says `Part of <card>`. It does not touch the app.
- **The take** is the builder's PR: it moves the chosen pass into
  primitives and features, wires data and URL state, writes tests, removes
  the pass from `src/design/`, and, for a new direction, copies the token
  values into the token module. Its body says `Closes <card>`. The normal
  reviewer round runs on it.

The designer's work does not become the app by merging; the take does.

Adapted from Hallmark (MIT), rewritten for this stack; see `NOTICE`.
