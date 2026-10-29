# Design on the Expo interface

How the [design references](../../design/README.md) land in the React
Native interface: where `design.md`'s tokens go, how a design pass is laid
out, how it is taken into the app, and what bites on the way. The loop
itself is [loop.md](../../design/loop.md); the board it runs on is
[gallery.md](./gallery.md).

## Where the tokens land

The interface's token module is `src/styles/tokens.ts`. It exports four
`as const` groups, and `design.md`'s token block uses the same names:

- `colors`: `text`, `textSecondary`, `textOnPrimary`, `screen`, `surface`,
  `border`, `borderSubtle`, `primary`, `primarySubtle`, `danger`. Hex
  strings.
- `spacing`: `xs` 4, `sm` 8, `md` 12, `lg` 16, `xl` 24. Numbers.
- `radii`: `sm` 4, `md` 8, `lg` 12. Numbers.
- `typography`: `title`, `label`, `body`, `caption`, each a
  `{ fontSize, lineHeight, fontWeight }`.

A project's module may have grown since the scaffold; the names in the
module are the names in `design.md`, whatever they are. Colours are hex or
rgba strings: nothing in a token is `oklch()`, a CSS variable or a unit.
The take copies the values over by hand; nothing converts.

## How a pass is laid out

What the template ships, in `src/design/` and `src/gallery/`:

- `src/design/types.ts` defines `DesignPass`: a `name`, `notes` (what the
  pass is trying, a sentence or two) and `comparisons`, each a `label`
  with a `current` node and a `variant` node.
- `src/design/passes.ts` exports the `passes` array, newest first. A new
  pass is imported and added at the top.
- `src/design/example/` is the shape to copy: `index.tsx` exports the pass
  object; `FlatCard.tsx` is one variant component, built from `colors`,
  `radii` and `spacing`.
- `src/design/samples.tsx` holds stand-in content shared by the passes and
  the board (the board imports `src/design`, never the reverse).
- `src/gallery/DesignSheet.tsx` renders every pass: one specimen section
  per comparison, `current` beside `variant`, under the Design tab.

A pass is a folder `src/design/<pass>/` with an `index.tsx` and its
variant components, added to `passes.ts`. The `current` side renders the
real component from `src/components/` or `src/features/`; the `variant`
side is the proposal. Variants take their data from props and fixtures, not
from hooks, so the board needs no backend for them. Only the board imports
`src/design`: `check:no-gallery` keeps it out of the web bundle.

Draw the states a region needs as extra comparisons or specimens in the
pass (loading, empty, error as well as full), since the rubric asks for all
four.

## A new direction's tokens, until taken

A new direction cannot edit `src/styles/tokens.ts`; that is the take's job.
Its token set lives in the pass as `src/design/<pass>/tokens.ts`, exporting
groups of the same names and shape as the module (`colors`, `spacing`,
`radii`, `typography`), with the values `design.md` proposes. The pass's
variant components import from that file instead of `styles/tokens`. A
change to one screen has no such file: its variants import
`styles/tokens`, and a missing value is a finding for the owner.

## The take

The builder's PR, from a chosen pass. In order:

1. Read the pass, `design.md` and the reviewer's and owner's comments on
   the pass PR.
2. For a new direction, copy the values from the pass's `tokens.ts` into
   `src/styles/tokens.ts` (adding keys, keeping the existing names), and
   point the shared primitives at them. Primitives may change here; the
   designer never changed them.
3. Move each variant into the component it replaces (a primitive under
   `src/components/primitives/`, a feature component under
   `src/features/`). Change the import from the pass's `tokens.ts` to
   `styles/tokens`.
4. Wire the data: the hooks, the URL state, the actions. Use the hooks
   that exist; a missing one is an architect or builder task, not a pass.
5. Update the board's entries and fixtures for anything that changed or is
   new ([gallery.md](./gallery.md)), and write the screen test.
6. Delete `src/design/<pass>/` and its line in `passes.ts`. The commit is
   the record; the board shows the component itself now.
7. Run the checks (typecheck, lint, test, `check:gallery`,
   `check:no-gallery`), capture again, and compare the shots to the pass's.

## Captures

The designer and the critic look at the board through
`scripts/capture-board.mjs`, which writes one PNG per view and width and a
`probes.json` of mechanical checks. How to run it and what each probe
means: [gallery.md § Capturing the board](./gallery.md#capturing-the-board).

## Gotchas

- **Colours are hex or rgba in tokens.** There is no `oklch()` on native; a
  value designed in another space is converted once, by the designer, when
  it enters `design.md`.
- **A style cannot express a pseudo-class.** On the web, a `Pressable`'s
  `onFocus` asks `event.target.matches(':focus-visible')` and keeps the
  answer in state. The outline style (`outlineWidth`, `outlineStyle`,
  `outlineColor` and `outlineOffset`, which are typed on `ViewStyle` but
  take effect on the web only) is applied only while that state is true,
  and `onBlur` clears it. Off the web there is no ring style: the device
  draws its own. Keying the ring on `focused` alone would show it
  after a pointer click; the capture script's `pointerRing` probe checks
  exactly this.
- **Layout is flexbox in Yoga.** There are no sticky columns, no CSS
  selectors, no `<template>`; `position: 'sticky'` exists on the web only.
- **A wrapping row with a `minHeight` needs `alignContent: 'center'`,**
  or Yoga pins the line to the top of the row.
- **A `Pressable` with `accessibilityRole="button"` renders a `<button>` on
  the web,** so a button inside it is a nested button (the nested probe
  fails). Give a selectable row `role="row"` and `aria-selected`, inside a
  view with `role="grid"`.
- **The web reads `aria-busy` from the prop,** not from
  `accessibilityState.busy`.
- **A module-level pass object that uses `const styles` must come after
  it,** or TypeScript says TS2448 (used before its declaration).
- **jest-expo runs as iOS.** A `Platform.OS === 'web'` branch needs
  `jest.replaceProperty(Platform, 'OS', 'web')` in the test.
- **A time-dependent component takes `now` from the fixtures,** or the
  board's numbers drift with the real clock.
- **React Query with no cached data drops the error and goes pending on a
  refetch,** so a Retry shows the loading state again before the error
  returns. Draw and test that sequence.
