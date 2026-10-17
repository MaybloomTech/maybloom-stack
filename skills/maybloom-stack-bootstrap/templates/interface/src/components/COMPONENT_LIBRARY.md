# Component library

What the interface is built from, so work is reused instead of written
twice. Update it in the same change that adds, renames, moves or removes
a primitive, a feature component, an icon or a token group. The design
board (below) shows every entry here running; this file is the index to
read before writing a new one.

## Where things live

- `src/components/primitives/` — the building blocks, imported from the
  barrel `src/components/primitives`.
- `src/features/<area>/` — screens and the components only they use. A
  route under `app/` renders a screen and holds nothing else.
- `src/icons/` — the app's icons, on a 24-unit grid with a 2-unit stroke.
- `src/styles/tokens.ts` — every color, space, radius and type style;
  `src/styles/viewport.ts` — `useViewport()`, the size a screen lays
  itself out for (never `useWindowDimensions`).

## Primitives

| Name | What it is for | Props worth knowing |
| --- | --- | --- |
| `Button` | Any pressable action with a text label | `variant`: `primary` (default) or `secondary`; `disabled` |
| `Card` | A bordered surface that groups related content | children only |
| `TextField` | One line or a few lines of text input | `multiline`; `accessibilityLabel` defaults to `placeholder` |

## Feature components

| Name | Module | What it is for |
| --- | --- | --- |
| `NotesScreen` | `features/notes/NotesScreen` | The notes page: form, then the first page of notes |
| `NoteForm` | `features/notes/NoteForm` | New-note form; keeps the text and says so when the save fails |
| `NoteRow` | `features/notes/NoteRow` | One note in a list, with its Archive action |

## Icons

| Name | Stands for |
| --- | --- |
| `PlusIcon` | Add: create a new item |
| `ArchiveIcon` | Archive: take an item out of the default list |

## The design board

The gallery renders the real primitives, feature components and pages
through react-native-web, against a fake backend typed by the contract.
It is a second Expo Router root (`gallery/`, the code in `src/gallery/`)
used only with `EXPO_PUBLIC_GALLERY=1`, so the app's bundle never carries
it. `pnpm gallery` serves it with live reload; `pnpm build:gallery`
exports it to `dist-gallery/`.

Every primitive, feature component and icon here has an entry on the
board: the typecheck fails for one without, and `pnpm check:gallery`
fails for a feature module the Components sheet does not list. Design
passes, variants proposed beside the component they would replace, live
in `src/design/` and are shown on the board's Design passes tab.
