---
title: Interface
description: The Expo Router client blueprint, React Query hooks in each feature over a Backend context
order: 5
---

# Interface

The interface is one Expo app that ships to Android, iOS, and the web from a
single codebase. Expo Router owns navigation, React Query owns server state
(each feature's hooks read it), and the generated Connect client owns the
wire. The package is called the interface everywhere, because it is the
human side of the system rather than a "front" to the backend.

Neither the word nor the framework is the load-bearing part. What the
stack's core guarantees is that any client, in any language Connect or
gRPC-Web reaches, starts from generated code that already knows every
resource, RPC, and field the service offers. Expo is the validated
implementation because one codebase ships to Android, iOS, and the web;
the shape documented here — the generated client in a context, query hooks
per feature, screens on top — transfers to other frameworks, and
the skills carry a language-neutral version of it for projects that
choose differently.

The bootstrap skill scaffolds this blueprint, on either backend, with a
working example screen wired to the example resource.

## Structure

```
app/                     Expo Router route files, thin by rule
  notes/index.tsx        re-exports a screen, nothing else
gallery/                 the design board's router root (EXPO_PUBLIC_GALLERY=1)
src/
  features/<area>/       the real screens, and what they are made of:
                         components, the query hooks, formatting
  components/            primitives + shells
  icons/                 the app's icons
  data/
    client.ts            the Backend context: the Connect client, liveBackend,
                         BackendProvider, useBackend()
    queryClient.ts       the one QueryClient, mounted in app/_layout.tsx
  styles/                design tokens: colors, type, spacing, breakpoints;
                         viewport.ts, the size a screen lays itself out for
  gallery/               the design board: sheets, fake backend, fixtures
  design/                design passes: variants only the board imports
```

Route files re-export screens so navigation structure and screen
implementation evolve independently. When one URL must render differently by
app mode, the route file switches on the mode and renders the right screen;
the URL stays stable and nothing redirects.

## The data layer

Three pieces, in this order:

1. **The Backend context** (`src/data/client.ts`) bundles everything a
   screen reaches the backend through. In the scaffold that is the service's
   Connect client: `createConnectTransport({ baseUrl })` from
   `@connectrpc/connect-web` plus `createClient(AppService, transport)`,
   exported as `liveBackend`, with `BackendProvider` and `useBackend()`. The
   app never mounts the provider, so a screen talks to the network; the
   design board and the tests provide a fake one per specimen. The type
   grows as the app needs URL builders (a file proxy) and trips that leave
   the page (`signIn`, `signOut`, connecting another account).
2. **Query hooks per feature** (`src/features/notes/useNotes.ts`) are
   React Query over `useBackend()`: a `useQuery` for the list, a
   `useMutation` per write, one key exported from the hook file (list keys
   and item keys distinct, so invalidation can be precise), and each write
   invalidating the keys it changes. A `queryFn` calls the client directly;
   there is no api or queries tier. This is the default because it is what
   makes the app feel quick: one cache shared by every screen, requests
   de-duplicated, retries, and paging (`useInfiniteQuery` over the page
   token) handled for you. Optimistic updates go through `onMutate`.
3. **The screen** renders what the hooks return and calls what they expose.

The skills' `client-expo/README.md` reference has the code for each
piece. Generated protos are deep-imported and never
re-exported through a barrel file, because Metro does not tree-shake and a
barrel over the contract drags every message into every bundle.

Variants. `@connectrpc/connect-query` derives typed hooks straight from the
service descriptor, with keys from `createConnectQueryKey`; it fits when the
resource count is large and the view types are the proto types. An app
that wants no cache at all can drop the library for hand-written
`useState`/`useEffect` hooks, and then owns what Query did: cancelling late
answers, de-duplicating pages, retrying a failed one with a back-off.
The reference says how, in a paragraph; it is not the default. The board's
`Fake` gives each specimen its own `QueryClient`.

A persisted query cache (`@tanstack/react-query-persist-client` for an
instant cold start) is an option. It cannot hold protobuf-es messages as they are: every
`int64` is a `bigint`, including `Timestamp.seconds`, and `JSON.stringify`
throws on it; `bytes` is a `Uint8Array` that serializes as an object of
indexes. The persister has to tag both and reverse the tags on restore.
Neither library documents this; the first persisted list finds it.

**A transport note the upstream docs will not give you:** connect-es
officially targets Node and browsers; React Native is unsupported
territory. The stack uses the web transport on native and keeps the
contract unary, which is why it works. The old reason (React Native could
not stream a fetch body) is gone since Expo SDK 52's `expo/fetch`, so
server-streaming is no longer forbidden; it is a stack-wide decision per
project, made once, with the native fetch story checked first. No service
has walked it yet; the first candidate is the server-push stream the Go
document describes.

## Sessions and environment

The scaffold has no auth, so it ships no session. An app that adds auth
writes the pattern below; the reference has the code. The session is a
query: `useMe` over `GetMe` with `staleTime: Infinity`, so it is fetched
once and shared, and a first visit costs one round trip rather than one per
screen. A `Session` union (`loading`, `signedOut`, `signedIn` with the
person, `error`) is derived from it, with `Unauthenticated` as `signedOut`,
and feeds a route gate: loading state, then a signed-out card, then the
screen. `signIn` and `signOut` are off-page trips on the Backend whose live
promises never settle; sign-out drops the query cache (`resetQueries()`
where the page stays, as on native; `clear()` only before a reload).
connect-web v2 dropped the `credentials` option, so a client whose session
is a cookie passes a `fetch` override that sets `credentials: "include"`.

Two session shapes have been walked, and they are the client halves of the
two auth shapes in the [Go document](./backend-go.md#auth).

**A cookie from the backend's own login.** The backend is the OIDC client
and sets an `HttpOnly` session cookie; the interface holds no token, sends
credentials on every call, and treats `Unauthenticated` as "show the
sign-in button". Nothing to cache, nothing to refresh. It needs the web
app on the backend's origin, which the deploy section makes the rule.

**Bearer access tokens with a refresh token.** One interceptor attaches
`Authorization: Bearer` from a synchronous in-memory cache, refreshes
proactively when the token is within a minute of expiry, and on an
`Unauthenticated` answer refreshes once, single-flight, and retries the
unary call once. Three rules make that safe:

- **Sign out only on a definitive `Unauthenticated` from the refresh RPC
  itself.** A network failure, `Unavailable` or a 5xx keeps the session:
  a redeploy must never log everyone out. The classification is one
  function and it is the security decision.
- **The session RPCs are exempt.** `Login` answers `Unauthenticated` for
  bad credentials, so an interceptor that treats every `Unauthenticated`
  as "expired" would refresh and retry a failed login. `Login`, `Refresh`
  and `Logout` bypass the retry path, and the refresh runs on a bare
  transport so it can never recurse into the interceptor that asked.
- **The refresh token has two homes.** On the web it is an `HttpOnly`
  cookie the browser sends; on native it travels in the login response
  body and lives in SecureStore (only the refresh token: SecureStore has
  a 2 KB value limit). The client is in exactly one mode at a time, and
  the server rejects a body token rather than falling back to a cookie.

Platform splits use Expo's `.native.ts` / `.web.ts` suffixes, confined to
the session store, push and file pickers, and the suffix-less file has to
exist too: `tsc` resolves `@/session/store` from it, and Metro picks the
native one on a device.

`EXPO_PUBLIC_*` variables are inlined at build time. The API URL is a
build-time fact; changing it means rebuilding the bundle. Unset, it means
same origin, which is what production builds use.

## Testing

The scaffold ships the harness and one test: `jest-expo` with React Native
Testing Library (Vitest cannot render React Native components), a `test`
script in the interface and at the repo root, and
`src/features/notes/NotesScreen.test.tsx`, which renders the screen inside
the board's `Fake` and asserts what a user sees in the `notes`, `empty` and
`error` scenarios. CI runs it in the interface's job. connect-es's
`createRouterTransport` runs a fake service in-process, so a screen is
tested against a scripted server with nothing listening on a port; the
board's `fakeBackend` is that server, ready to reuse (`Fake` mounts it with
a fresh `QueryClient`, retries off). A session state
machine, once an app has one, is tested the same way: a test that flips the
fake to `Unavailable` mid-session and expects the session to survive pins
the sign-out rule. Use Testing Library's async queries (`findByText`): the
query answers after the first render. Testing Library 14 is asynchronous end
to end (`await render(...)`, `await fireEvent.*`); the scaffold pins 13.
End-to-end web checks run Playwright against a real deployed server, never
a mock, because the contract is what is being validated.

## The design board

Every Expo interface ships with a design board, the gallery: a second
Expo Router root (`gallery/`), chosen by `EXPO_PUBLIC_GALLERY=1` in
`app.config.js`, that renders the real primitives, feature components and
pages through react-native-web, never copies. Its tabs are the three
tiers (Primitives, Components, Pages), then Icons, Tokens and Design
passes; a toolbar sets the width a design is checked at (390, 768, 1280)
and the URL hash keeps the view, so a link opens it. `pnpm --filter
<scope>/interface gallery` serves it with live reload (the scripts below
are the interface package's, run from the repo root with `--filter` or
from `packages/interface` as they are).
A capture script (`pnpm --filter <scope>/interface capture`) takes a
screenshot of every tab at every width and writes a `probes.json` of
mechanical checks, for an agent or a person to read instead of driving a
browser; it needs Chrome and a served board.

Pages and components run against a fake backend: the real Connect client
over `createRouterTransport`, answering the whole service from fixtures
built with the contract's own `create()`, one copy
per specimen, in scenarios (`notes`, `empty`, `long`, `loading`,
`error`, and calls named to fail). The service implementation is typed as
the whole `ServiceImpl`, so a new RPC fails the typecheck until the board
answers it, and a renamed field fails it in the fixtures. A screen is
shown at a frame's size, not the window's, which is why screens size
themselves with `useViewport()` and never `useWindowDimensions`.

The board is a rule as much as a tool, and the rules are mechanical:

- a new primitive, feature component or icon fails the typecheck until it
  has an entry (the sheets are keyed by the modules' exports);
- a feature module the Components sheet does not list fails
  `check:gallery`; feature components are function components (the
  typecheck sees named ones only, Biome refuses a default export there,
  and class components are not checked);
- `check:no-gallery` exports the app for the web with source maps and
  fails if any file of the board or of `src/design` is in that bundle,
  however it was imported: that is the guarantee for the web bundle
  (native bundles are not checked). Biome's restricted imports (the
  board's folders by their unambiguous specifiers, and
  `useWindowDimensions` outside `viewport.ts`) are the hint in the
  editor, with test files under `src/` exempt so a test can reuse the
  fake backend;
- CI exports both bundles and runs both checks.

Design passes (`src/design/<pass>/`) put a proposed variant beside the
component it would replace; a variant that is taken moves into the
component. The mechanism and the steps for each kind of addition are in
the skills' `client-expo/gallery.md` reference.

Not yet walked: the board on a device (it is a web export), and
screenshot diffing over it.

## App chrome

When one product has two jobs, the interface renders one of two shells
around the same routes: an everyday capture chrome and an authoring chrome,
selected by a persisted app mode and gated by role. Both shells implement
the same responsive rule: bottom tabs on compact screens, a drawer on large
web and iOS. Two chromes, one route tree, one data layer.

## Build and deploy

- Native builds go through EAS (APK for previews, AAB for production),
  from a developer machine rather than CI; the free tier's build quota is
  small and store builds are rare.
- The web target is a static export (`expo export --platform web`). Two
  places to serve it are walked, and both put it on **the API's origin**:
  embedded in the Go binary, which serves it with a single-page fallback
  and hashed-asset caching; or a small static container (a Caddy file
  server holding the export) behind the reverse proxy, which routes the
  Connect prefix to the backend and everything else to the export.
- Same origin is a rule, not a preference, whenever the session is a
  cookie. A `SameSite=Strict` cookie is the right production setting and
  it means a dev server on `localhost` talking to a deployed API is
  cross-site: the browser neither sends nor stores the cookie, so the
  client signs in, reads for one access-token lifetime, and cannot refresh
  or resume a reload. A local stack hides this, because `localhost:8081`
  to `localhost:8090` is same-site (ports do not count). A dev CORS
  allow-list on the backend is enough for reads and is not the session
  path; the web session is proven only on the hosted build. Native
  carries its token in the body and never meets the problem.
- CI builds the export on every pull request, checks the design board
  stayed out of it, and exports the board as a second bundle.
