# Interface: Backend context → feature hooks (React Query) → screen

Three pieces, added in this order. Server state lives in React Query: a
feature's hooks are `useQuery` and `useMutation` over the `Backend`
context, in the feature. That is what makes the app feel quick: one shared
cache, requests de-duplicated, writes that invalidate what they change,
retries, and paging done for you.

An interface scaffolded before 0.9 (`src/data/api/`, `src/data/queries/`,
`useClient()`) uses the same library in an older layout: an agent working
there follows that project's existing layout and does not migrate it unless
the owner asks. Such an interface has no jest harness (no `test` script):
write the screen test only where the interface has one. Adding the harness
(the 0.9 one, with Fake's mutation `gcTime`) is the owner's call.

## 1. The Backend context: `packages/interface/src/data/client.ts`

`Backend` bundles everything a screen reaches the backend through. In the
scaffold that is one field, the service's typed Connect client, named after
the service. The file exports `liveBackend` (the transport and the
`API_URL` default), `BackendProvider` and `useBackend()`:

```ts
export type Backend = {
  <app_slug>: Client<typeof <App>Service>;
};

export const liveBackend: Backend = {
  <app_slug>: createClient(<App>Service, transport),
};

const BackendContext = createContext<Backend>(liveBackend);
export const BackendProvider = BackendContext.Provider;
export function useBackend(): Backend {
  return useContext(BackendContext);
}
```

The app never mounts `BackendProvider`, so every screen talks to
`liveBackend`. The design board and the tests mount one per specimen with
`fakeBackend()` ([gallery.md](./gallery.md)), which is how a screen is
shown and tested without a server.

Grow `Backend` as the app needs more than RPCs, and say so in the type's
comment: URL builders for what the backend serves outside the RPCs (a file
or image proxy), and off-page trips (`signIn`, `signOut`, connecting
another account). A live trip navigates away and returns a promise that
never settles; a fake backend settles it with where the trip would have
come back to. Because the context holds them, a screen that triggers a
trip is shown on the board like any other.

The `QueryClient` is `src/data/queryClient.ts`, mounted once by the
`QueryClientProvider` in `app/_layout.tsx`.

## 2. The feature's hooks: `src/features/<resources>/use<Resources>.ts`

Each feature owns its data, in the feature: there is no wrapper tier
between the hooks and the client, and a `queryFn` calls the client
directly. The hooks read `useBackend()`. The bootstrap's
`src/features/notes/useNotes.ts` is the working reference; for a resource:

```ts
export const <RESOURCES>_KEY = ['<resources>'] as const;

export function use<Resources>() {
  const { <app_slug>: api } = useBackend();
  return useQuery({
    queryKey: <RESOURCES>_KEY,
    queryFn: () => api.list<Resources>({ pageSize: 50, pageToken: '' }),
    select: (page) => page.<resources>,
  });
}

export function useCreate<Resource>() {
  const { <app_slug>: api } = useBackend();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { title: string; body: string }) =>
      api.create<Resource>({ <resource>: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: <RESOURCES>_KEY }),
  });
}

// useArchive<Resource>: the resource's leaving-the-view RPC, the same way.
```

Rules the shape keeps:

- **Keys.** One key const exported from the hook file. Lists:
  `['<resources>']` (or `['<resources>', filters]`). Single items:
  `['<resources>', id]`, under the list key, so invalidating the list key
  also invalidates the items.
- **Invalidate after a write.** A mutation invalidates the keys it changes
  in `onSuccess`: the item key always, the list key when the write can
  change membership or ordering. Missing one shows up as a screen that
  needs a manual refresh.
- **Form writes reject.** `mutateAsync` rejects when the call fails, so a
  form can keep what was typed and say so. A row action uses `mutate` and
  reports through the mutation's `error`.
- **`errorMessage`** prefers `rawMessage` for a `ConnectError` (the text
  the server sent, without the `[code]` prefix `message` adds).
- Returning the raw proto message keeps the type pipeline straight from
  server to UI. If a UI-friendly summary is narrower than the proto, map
  it in `select` so screens never import raw generated types.
- Components never call the client; only a hook does.

### A paged list

`List`-style RPCs page by cursor (`nextPageToken`, empty on the last
page). The scaffold's `use<Resources>` reads the first page, as the
example screen has no scroll-to-load. A screen that pages uses
`useInfiniteQuery`:

```ts
useInfiniteQuery({
  queryKey: <RESOURCES>_KEY,
  queryFn: ({ pageParam }) =>
    api.list<Resources>({ pageSize: 50, pageToken: pageParam }),
  initialPageParam: '',
  getNextPageParam: (page) => page.nextPageToken || undefined,
  select: (data) => data.pages.flatMap((page) => page.<resources>),
});
```

The list's `onEndReached` calls `fetchNextPage` when `hasNextPage` and not
`isFetchingNextPage`, and not `isFetchNextPageError`. Query de-duplicates
the in-flight call and retries a failed page a few times; after that
`hasNextPage` stays true, so a failed page waits for a retry control
instead of being called again on every scroll. Use a different key from the
first-page hook when both exist, or the cached shapes collide.

### Optimistic updates

For latency-sensitive interactions (toggling a checkbox, reacting to a
post), use `useMutation`'s `onMutate` to cancel in-flight queries, write
the expected value into the cache and return the previous one; `onError`
puts it back and `onSettled` invalidates. Keep it in the resource's hook
file rather than in the screen. For first-pass CRUD, plain `onSuccess:
invalidate` is fine.

### Custom queries

A screen's own query is a React Query hook over `useBackend()`, in the
feature that owns the screen, shaped like the hooks above:

- **Parameters go in the key.** Invalidating the prefix refreshes every
  variant.

  ```ts
  export function useSearch<Resources>(term: string) {
    const { <app_slug>: api } = useBackend();
    return useQuery({
      queryKey: [...<RESOURCES>_KEY, 'search', term],
      queryFn: () => api.search<Resources>({ term }),
    });
  }
  ```

  `qc.invalidateQueries({ queryKey: <RESOURCES>_KEY })` refreshes all
  terms.

- **`select` for derived data.** Map or pick from the cached answer, as
  `use<Resources>` does, so screens never see more than they need.
- **`enabled` for dependent queries.** A query that needs another's answer
  (or a form value) waits for it:

  ```ts
  useQuery({
    queryKey: [...<RESOURCES>_KEY, id, 'history'],
    queryFn: () => api.list<Resource>History({ <resource>Id: id! }),
    enabled: id !== undefined,
  });
  ```

- **`useInfiniteQuery` for paging**, as in "A paged list".
- **Combining a few RPCs.** One `queryFn` that awaits `Promise.all` of two
  or three calls, or `useQueries` when each answer should cache and
  refresh on its own.
- **A fetch that is not an RPC** (a file, an image proxy, a health ping)
  becomes a new member of `Backend`, so the design board and the tests can
  fake it. The hook calls `useBackend().<member>`, never `fetch` directly.
  A new member is an edit to `src/data/client.ts`, a protected path:
  architect work.

The limit: stitching many RPCs, filtering a large list on the client, or
making N calls to build one screen means the contract lacks an RPC. Add it
with `maybloom-stack-add-rpc` instead of composing it in the interface.

A second feature that needs the same data imports the owning feature's
hook and key rather than writing its own. Data that belongs to no feature
(the session) lives in `src/data/`.

### connect-query as a variant

`@connectrpc/connect-query` derives typed hooks from the service
descriptor (`useQuery(list<Resources>)`, keys via
`createConnectQueryKey`), which removes the hand-written `queryFn`s. Use
it when the project already does, or when the resource count is large and
screens are happy with the proto types. It reads its transport from its
own provider, so wire it to the `Backend` (and the fake) rather than a
second client. Do not mix the two per resource.

### A persisted cache

A persisted query cache (so the app opens on last session's data) is an
option, not the default, and it cannot hold proto messages as-is: `int64`
fields (every `Timestamp.seconds`) are `bigint` and `JSON.stringify`
throws; `bytes` is a `Uint8Array` that serializes as an object of
indexes. Tag both in the persister and reverse on restore. Clear it on
sign-out.

### An app that wants no cache

An app with a handful of screens that each read their own data can drop
the library: a hand-written hook with `useState`/`useEffect` over
`useBackend()` returning `loading`, `error`, the items and one function per
write that calls the client and reloads. It then owns what React Query
gives: cancelling a late answer on unmount, de-duplicating pages, and
retrying a failed one with a back-off. Choose it deliberately; it is not the
default.

## 3. The screen and its components

A screen is a component in a feature module,
`packages/interface/src/features/<resources>/<Resources>Screen.tsx`, and
the route only renders it. The bootstrap's Note is the working
reference: `src/features/notes/` holds `NotesScreen` (list + create +
archive), `NoteForm`, `NoteRow` and `useNotes`, built from the primitives
in `src/components/primitives` and the tokens in `src/styles/tokens.ts`,
and `app/index.tsx` renders `NotesScreen`. Keeping the screen out of
`app/` is what lets the design board show it as a page on a fake
backend.

- **Single-screen resource:** add a route under
  `packages/interface/app/<resources>/index.tsx` that renders
  `<Resources>Screen`.
- **Detail / edit flow:** add `app/<resources>/[id].tsx` for the detail
  view, rendering a `<Resource>Screen` that takes the id; the list links
  to it via `<Link href={`/<resources>/${id}`}>`.

If the project uses a drawer-and-tabs layout, register
the new top-level route in `app/_layout.tsx` so it shows up in the nav.
The bootstrap's `_layout.tsx` is just a `Stack` — there's no navigation
to update.

Two rules the board depends on: a screen sizes itself with
`useViewport()` (`src/styles/viewport.ts`), never `useWindowDimensions`
(Biome refuses it), and nothing outside the gallery imports `src/gallery`
or `src/design` (Biome refuses only the alias spellings, `@/gallery` and
`**/src/gallery`; `check:no-gallery` is the guarantee, on the web bundle).

### Screen pattern (mirroring the bootstrap's NotesScreen)

```tsx
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { useViewport } from '../../styles/viewport';
import { <Resource>Form } from './<Resource>Form';
import { <Resource>Row } from './<Resource>Row';
import {
  errorMessage,
  useArchive<Resource>,
  useCreate<Resource>,
  use<Resources>,
} from './use<Resources>';

export function <Resources>Screen() {
  const { data: <resources>, isLoading, error: loadError } = use<Resources>();
  const create = useCreate<Resource>();
  const archive = useArchive<Resource>();
  const error = loadError ?? archive.error;
  const { width } = useViewport();

  return (
    <View style={{ flex: 1, alignSelf: 'center', width: Math.min(width, 640) }}>
      <<Resource>Form onSubmit={create.mutateAsync} />
      {error ? <Text>Something went wrong: {errorMessage(error)}</Text> : null}
      {isLoading ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={<resources>}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <<Resource>Row
              <resource>={item}
              archiving={archive.isPending && archive.variables === item.id}
              onArchive={() => archive.mutate(item.id)}
            />
          )}
        />
      )}
    </View>
  );
}
```

The form takes `onSubmit` returning a promise, so it can keep what was
typed and say so when the save fails; the row takes the proto message.

### The design board

Every new primitive, feature component, icon and page gets an entry on
the design board in the same change: the typecheck fails for a component
of a listed module without one, and `check:gallery` for a feature
module the Components sheet does not list. A new RPC also needs an
answer in the fake backend, or the typecheck fails there.
[gallery.md](./gallery.md) has the mechanism and the steps.

## Session

The scaffold has no auth and no `GetMe` RPC, so it ships the Backend
context without a session. An app that adds auth writes the pieces below
(an app in production runs this shape); they are a documented pattern, not
scaffold code. `Me` and `GetMe` here are generic names for whatever the
contract calls the signed-in person and the RPC that returns them. The
session is a query like any other.

**`useMe`: one `GetMe`, fetched once and shared.** `staleTime: Infinity`
means the first screen to ask pays the round trip and every other reads
the cache. `retry: false` so a signed-out answer is not retried. A screen
that changes the person's data patches the cache with `setQueryData`
instead of refetching.

```ts
export const ME_KEY = ['me'] as const;

export function useMe() {
  const { <app_slug>: api } = useBackend();
  return useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      const res = await api.getMe({});
      if (!res.user) throw new Error('No user in the response');
      return { user: res.user };
    },
    staleTime: Infinity,
    retry: false,
  });
}
```

**The `Session` union.** One shape for every screen to switch on, derived
from the query. `Unauthenticated` maps to `signedOut`; any other failure
maps to `error` with the message:

```ts
import { Code, ConnectError } from '@connectrpc/connect';
import type { User } from '<org_scope>/protocol-buffers/<app_slug>/resources/v1/users_pb';

// Whatever the contract's GetMe returns that screens need.
export type Me = { user: User };

export type Session =
  | { state: 'loading' }
  | { state: 'signedOut' }
  | { state: 'signedIn'; me: Me }
  | { state: 'error'; message: string };

export function useSession(): Session {
  const { data, error, isPending } = useMe();
  if (data) return { state: 'signedIn', me: data };
  if (isPending) return { state: 'loading' };
  return error instanceof ConnectError && error.code === Code.Unauthenticated
    ? { state: 'signedOut' }
    : { state: 'error', message: errorMessage(error) };
}
```

`errorMessage` starts in `features/notes/useNotes.ts`. Move it to
`src/data/` once something outside the feature, like this session, needs
it, so `src/data/` never imports a feature.

**The route gate.** A thin route reads `useSession()` and renders, in
order: a loading state; a signed-out card (with the error message when the
state is `error`); then the feature screen with `session.me`. Redirects for
"not set up yet" belong here too, in the route, not in the screens.

```tsx
export default function Protected() {
  const session = useSession();

  if (session.state === 'loading') return <LoadingState />;
  if (session.state === 'signedOut' || session.state === 'error') {
    return (
      <SignedOutCard
        error={session.state === 'error' ? session.message : undefined}
      />
    );
  }
  return <<Resources>Screen me={session.me} />;
}
```

The board shows the screen by passing it a `Me` fixture, so the gate is
the only code that needs the query.

**`signIn` and `signOut` are off-page trips on the Backend.** `signIn`
navigates to the backend's login route (`/auth/login`) and returns a
promise that never settles. `signOut` posts to the logout route with
credentials, throws a readable error when the backend refuses, drops the
query cache (so the next person never sees the last one's data) and on the
web navigates home with a promise that never settles. Where the page stays
(native), drop the stored token or cookie first, then call
`queryClient.resetQueries()` (with a token still cached, `useMe` would
succeed again and the session would stay `signedIn`): the data is dropped, the
active queries refetch, and `useMe` answers `Unauthenticated`, so the
session reads `signedOut`. `queryClient.clear()` removes queries without
telling their mounted observers, so it is enough only before a navigation
that reloads the page. A fake backend settles both so a specimen can show
what follows.

**Cookie sessions need `credentials: 'include'`.** connect-web v2 has no
`credentials` option; pass a `fetch` override on the transport:

```ts
const transport = createConnectTransport({
  baseUrl: API_URL,
  fetch: (input, init) =>
    globalThis.fetch(input, { ...init, credentials: 'include' }),
});
```

Harmless on native, required on the web whenever the backend sets the
session cookie (and, when the API is on another origin, the backend needs
CORS with credentials).

## Tests

The scaffold ships the harness and one test: `jest-expo`, React Native
Testing Library, and `src/features/notes/NotesScreen.test.tsx`, which
renders the screen inside `Fake` (the board's `fakeBackend` and a fresh
`QueryClient`) and asserts what a user sees in the `notes`, `empty` and
`error` scenarios. Run it with `pnpm test` from the repo root. A test file
under `src/` (`*.test.tsx`, `__tests__/`) is exempt from the board's import
rule, so it can import `Fake` the way the board does.

The fake is a real Connect client over `createRouterTransport`, an
in-process scripted service; there are no mocks, and a hook is tested
through the screen that uses it. Use RNTL's async queries (`findByText`),
since the query answers after a render. A new RPC is answered in
`fakeBackend` first (the typecheck fails until it is), then a test can use
it. React Native Testing Library 14 is async end to end: `await
render(...)` and `await fireEvent.*(...)`; the scaffold pins 13, where
`render` is sync.

## Sharp edges

- **Deep imports, no barrels.** Generated protos are imported by their
  full path (`<ORG_SCOPE>/protocol-buffers/<APP_SLUG>/resources/v1/<resources>_pb`).
  Never add an `index.ts` that re-exports the generated tree: Metro does
  not tree-shake and the barrel drags every message into every bundle.
- **Platform suffixes need the plain file too.** `store.native.ts`
  without `store.ts` fails `tsc`; make the web implementation the
  suffix-less file and Metro picks the native one on a device.
