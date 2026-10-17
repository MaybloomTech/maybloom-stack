# The design board (the gallery)

Every Expo interface on the stack ships with a design board: a second
app, built from the same source, that renders the real primitives,
feature components and pages through react-native-web, never a copy,
against a fake backend typed by the contract. It is how a component is
looked at in every state before a screen needs it, how a page is checked
at a phone's, a tablet's and a laptop's width without a server, and how
a design change is proposed beside what it would replace. The bootstrap
scaffolds it wired for the Note example; this reference is the
mechanism, so it can be kept up as the app grows or added to an
interface that predates it.

## How it is kept out of the app

The board is a second Expo Router root, `packages/interface/gallery/`,
switched on by one environment variable:

```js
// app.config.js — app.json stays the config; this only switches the root.
module.exports = ({ config }) => {
  if (process.env.EXPO_PUBLIC_GALLERY !== "1") return config;
  return {
    ...config,
    extra: { ...config.extra, router: { ...config.extra?.router, root: "gallery" } },
  };
};
```

`pnpm --filter <scope>/interface gallery` serves it with live reload
(`EXPO_PUBLIC_GALLERY=1 expo start --web`); `pnpm --filter
<scope>/interface build:gallery` exports it to `dist-gallery/`. The
scripts named below are the interface package's: from the repo root they
take `--filter <scope>/interface`, from `packages/interface` they run as
they are. Every
other run and build keeps `app/` as the root, so Metro never reaches the
board's files. What holds that line is checked on what was built, not on
how imports are spelled:

- **`check:no-gallery`** (`scripts/check-no-gallery.mjs`) is the
  guarantee for the **web** bundle; native bundles are not checked (a
  `.native.ts` file that imports `src/design` would ship in them
  unnoticed). It exports the app again for the web with source maps, to `dist-check/`
  (the shipped `dist/` from `build:web` has no maps and is left alone),
  and fails if any source under `gallery/`, `src/gallery/` or
  `src/design/` is in the bundle's maps, or if the bundle carries the
  board's sentinel (the testID on its page, kept in
  `src/gallery/sentinel.json`, which `Gallery.tsx` and both scripts
  read). Whatever the spelling (any relative depth, the `@/` alias, a
  `baseUrl` path, a re-export through a helper, `require()` or
  `import()`), a file that reaches the app's bundle is in its maps. Metro
  names sources from the workspace root (`/packages/interface/src/...`);
  the script finds that root by its `pnpm-workspace.yaml`. It costs one
  more web export in CI.
- **Biome `noRestrictedImports`** (root `biome.json`, an override on
  `packages/interface/**`) is the fast hint in the editor, not the
  guarantee. It refuses `useWindowDimensions` in favour of `useViewport`,
  and the unambiguous specifiers of the board's folders: `@/gallery`,
  `@/design` and `**/src/gallery`, `**/src/design` (with `/**`). Relative
  imports such as `../../gallery/fake` are not refused there, because the
  text alone cannot tell the board's `src/gallery` from a product feature
  called `gallery`; `check:no-gallery` catches them if they reach the
  bundle. The rule is off inside `gallery/`, `src/gallery/`,
  `src/design/`, `src/styles/viewport.ts` (the one file allowed to read
  the window) and test files under `src/` (`*.test.ts(x)`, `__tests__/`),
  which may reuse the fake backend; a test helper that the app imports
  is in the bundle, and the bundle check fails it.
- **`scripts/gallery-export.mjs`** runs after the gallery export and
  refuses an export without the sentinel, so the app's bundle is never
  published as the board by mistake.

## How a page runs without a server

Screens reach the backend only through a feature's hooks, and the hooks
get the `Backend` from `useBackend()` (`src/data/client.ts`). The app
never mounts `BackendProvider`, so the context's default, `liveBackend`,
is what every screen uses. The board mounts one per specimen:

```tsx
// src/gallery/fake.tsx
export function Fake({ children, ...options }: FakeOptions & { children: ReactNode }) {
  const [backend] = useState(() => fakeBackend(options));
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      }),
  );
  return (
    <BackendProvider value={backend}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </BackendProvider>
  );
}
```

Each specimen has its own backend and its own `QueryClient`, so what one
changes (a note added, a note archived) stays its own, and two specimens
of one page in different states do not share a cache key. Retries are off,
so the `error` scenario shows its error at once instead of after the
backoff. The same `Fake` is what the interface's tests mount.

`fakeBackend(options)` (`src/gallery/fixtures/backend.ts`) returns a whole
`Backend`: the real Connect client over `createRouterTransport`, answering
the service from an in-memory copy of the fixtures. When the app's
`Backend` grows URL builders or off-page trips, the fake answers those
too.

- The implementation is typed as the whole `ServiceImpl<typeof
  <App>Service>`, so an RPC added to the contract fails the interface's
  typecheck until the board answers it. That is the point: a page that
  calls the new RPC would otherwise show an error on the board.
- The fixtures (`src/gallery/fixtures/notes.ts`) are built with
  `create(<Resource>Schema, {...})` from the generated package, so a field
  the proto renames or drops breaks the typecheck here, not on the board.
  They use a fixed clock and fixed ids (valid uuids, as the server's
  are), so the board renders the same every time.
- A **scenario** sets the state the backend puts a page in. The scaffold
  has `notes` (a few), `empty`, `long` (more than one page), `loading`
  (every call waits forever) and `error` (every call fails with
  `Unavailable`). `failing: ["createNote"]` fails named calls anyway, for
  an error that follows a tap. Add a scenario when a page has a state
  the existing ones cannot reach (signed out, a permission missing), and
  keep its meaning in the `Scenario` type's comment.
- Behaviour that matters to a page is real, not stubbed: `listNotes`
  pages with `page_token` and leaves archived notes out unless asked,
  `archiveNote` sets `archived_at`, a missing id is `NotFound`.

`PageFrame` wraps a page for the Pages tab, at one of the board's
`frames` (`layout.tsx`, the one list the toolbar's widths and the frame
heights both come from): its own `Fake`, a
`ViewportProvider` with the frame's size, and a `SafeAreaProvider` with
that frame. The other sheets get the board's width the same way
(`Gallery.tsx` wraps every sheet in a `ViewportProvider` at the chosen
width), so a component that branches on `useViewport()` shows its 390
layout in the 390 column. That is why screens and components size
themselves with `useViewport()`: inside the board, the window is the
board's, and the frame is the page's.

## The tabs

`src/gallery/Gallery.tsx` holds a toolbar (the tab and the width: 390,
768, 1280) and the tab's sheet, which scrolls both ways, so a 1280 frame
in a smaller window is scrolled to, not clipped. On the web it is a
single scroller under the toolbar, so both scrollbars sit at the
window's edges. The URL hash keeps the
view (`#components/NoteRow@768`, `#icons@390`), so a link opens it, and a
linked entry is scrolled to when the entry changes.

| Tab | Sheet | What it shows | Keyed by |
| --- | --- | --- | --- |
| Primitives | `PrimitiveSheet.tsx` | `src/components/primitives` | the barrel's exports |
| Components | `ComponentSheet.tsx` | `src/features/**` components, on fixtures | `ComponentsOf<module>` of each listed module |
| Pages | `PageSheet.tsx` | each screen, per scenario, in a `PageFrame` | a list of routes |
| Icons | `IconSheet.tsx` | `src/icons` at three sizes | the icon module's exports |
| Tokens | `TokenSheet.tsx` | colors, spacing, radii, type from `src/styles/tokens.ts` | read as is |
| Design passes | `DesignSheet.tsx` | variants beside the current component | `src/design/passes.ts` |

A specimen is `{ label, node }`: one state, labelled with which. A state
a component reaches only by input (a failed save) is shown by driving it,
never by a prop that exists for the board: `Play` (`fake.tsx`) runs steps
inside the specimen: `"Add note"` presses the enabled control with that
text or accessibility label (it waits for a disabled one to enable),
`{ fill: "Title", text }` types into a field by its accessibility label
and waits for the value to hold, and `{ expect: "Could not save" }` waits
for text to show. End a Play with an `expect`, so a press that did
nothing is reported. A step that does not come true in three seconds is
drawn in red. Play is web-only, like the board.

## What makes a missing entry fail

- **Primitives and icons:** the sheet's entries are a
  `Record<keyof typeof primitives, Specimen[]>` (and the icon sheet's a
  `Record<keyof typeof icons, string>` saying what each icon stands for),
  so a new export of the barrel or of `src/icons` fails the typecheck
  until it has one.
- **Feature components:** `ComponentSheet.tsx` imports each feature
  module as a type (`import type * as noteRow from
  "../features/notes/NoteRow"`) and keys its entries by the union of
  `ComponentsOf<typeof module>` (the capitalised named exports that are a
  function component or a memo). A new component in a listed module fails
  the typecheck. A module not listed at all is what `check:gallery`
  (`scripts/check-gallery.mjs`) catches: it scans `src/features/**/*.tsx`
  for modules that export a component (a platform variant such as
  `.web.tsx` counts as its base module, `x/index.tsx` is module `x`) and
  fails for any the sheet does not import that way.
- **Feature components are function components:** a named function
  export (`export function NoteRow`), or a `memo` of one. Default exports
  would slip past `ComponentsOf`, so Biome's `style/noDefaultExport` is on
  for `src/features/**` (tests exempt). Class components are not checked:
  `check:gallery` refuses the plain `export class X extends Component`
  form, but other spellings (generics, a class exported through
  `export { }`) pass with no entry, so don't write them.
- **Test files** (`*.test.tsx`, `__tests__/`) are skipped by
  `check:gallery`: a render wrapper in a test helper is not a component of
  the app.
- **Screens** are feature components too; their entry on the Components
  sheet is `{ path, seen: "Pages" }`, and the page itself goes on the
  Pages sheet with its scenarios.
- **A new RPC** fails the typecheck in `fixtures/backend.ts` until the
  fake answers it.

## Adding to the board

When the change adds…

1. **A primitive:** export it from `src/components/primitives/index.ts`;
   add its entry to `PrimitiveSheet.tsx` (each variant, disabled, and the
   longest text it must hold).
2. **A feature module:** add `import type * as <name>` and the value
   imports to `ComponentSheet.tsx`, its `ComponentsOf<typeof <name>>` to
   `FeatureComponents`, and an entry per component: the states it is
   built for, each as a specimen. A component that loads its own data
   goes in a `<Fake scenario=...>`.
3. **A screen:** an entry `{ path, seen: "Pages" }` on the Components
   sheet, and a route on `PageSheet.tsx` with one state per scenario that
   changes what it shows, plus any `Play` that reaches a state by input.
4. **An icon:** export it from `src/icons`; say what it stands for in
   `IconSheet.tsx`.
5. **An RPC or a resource:** After `pnpm proto:gen`, rebuild the contract (`pnpm --filter <ORG_SCOPE>/protocol-buffers build`): the interface reads its built `dist/*.d.ts`, or the typecheck below will not see the new RPC. Then answer it in `fixtures/backend.ts`; add
   fixtures for a new message in `fixtures/` built with `create()`.
6. **A design pass:** copy `src/design/example/` to
   `src/design/<pass>/`, give each comparison the current component and
   the variant, and add the pass to `src/design/passes.ts`. A variant that
   is taken moves into the component and leaves `src/design/`.

Each of 1-4 also gets its row in `src/components/COMPONENT_LIBRARY.md`,
the index of what exists that a builder reads before writing a new
component; the board shows the entries running, the file says what each
is for. Nothing checks that file mechanically; review does.

Then run `pnpm typecheck`, `pnpm lint`, `pnpm --filter <scope>/interface
check:gallery`, and look at it with `pnpm --filter <scope>/interface
gallery`.

## In CI

The interface job, after the web export, runs `check:no-gallery` (its own
export with source maps, to `dist-check/`), `check:gallery`, and
`build:gallery`, which also runs
`gallery-export.mjs`. The typecheck before them is where the entry
coverage fails.

## Publishing the export

`gallery-export.mjs` makes `dist-gallery/` servable from any path: Expo
writes root-absolute URLs (`/_expo/...`, `/assets/...`), which become
relative, and `_expo/` becomes `expo/`, since some static hosts reserve
or hide names that start with `_`. It writes `files.json`, the list of
files to upload. Any static host serves the folder as it is; every path
renders the board (`gallery/[...path].tsx`), so a host that serves it
under a sub-path needs no rewrite rules.

## Not covered yet

- **Native.** The board is a web export. `Play` and the hash are web-only;
  the components render on a device under the gallery root
  (`EXPO_PUBLIC_GALLERY=1 expo start`), but nobody has walked that path.
- **Visual regression.** The board makes states reachable by URL, which
  is what a screenshot test needs, but no screenshot diffing is wired.
- **Grouping.** The sheets list entries in declaration order. A board
  with many components may want them grouped by the job they serve or
  by kind, with an outline that follows the scroll; that is a layout
  change to `Gallery.tsx` and `layout.tsx`, not to the mechanism.
