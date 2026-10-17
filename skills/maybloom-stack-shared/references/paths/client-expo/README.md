# Interface: Backend context → feature hook → screen

Three pieces, added in this order. The default path has no cache library:
a feature's data is a hand-written hook over the `Backend` context.
React Query is an opt-in for projects that need it (the last section
before the sharp edges), not the default.

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

## 2. The feature's hook: `src/features/<resources>/use<Resources>.ts`

Each feature owns its data. The hook reads `useBackend()`, calls the
client, and returns what its screen needs: `loading`, `error`, the items,
a `reload`, and one function per write. A write calls the client and then
reloads, so what is on screen is what the server answered. The bootstrap's
`src/features/notes/useNotes.ts` is the working reference; for a resource:

```ts
export function use<Resources>() {
  const { <app_slug>: api } = useBackend();
  const [<resources>, set<Resources>] = useState<<Resource>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    void version; // reload() bumps it; the effect runs again
    let cancelled = false;
    api
      .list<Resources>({ pageSize: 50, pageToken: "" })
      .then((res) => {
        if (cancelled) return;
        set<Resources>(res.<resources>);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const create = useCallback(async (input: { title: string; body: string }) => {
    await api.create<Resource>({ <resource>: input });
    reload();
  }, [api, reload]);
  // archive<Resource>(id): the resource's leaving-the-view RPC, then reload.

  return { <resources>, loading, error, reload, create /* , archive */ };
}
```

Rules the shape keeps:

- The `cancelled` flag drops an answer that arrives after the effect was
  cleaned up (unmount, a new `version`).
- A write rejects when the call fails, so the form that called it can keep
  what was typed and say so.
- Returning the raw proto message keeps the type pipeline straight from
  server to UI. If a UI-friendly summary is narrower than the proto,
  map it inside the hook so screens never import raw generated types.
- Components never call the client; only a hook does.

### A paged list

`ListNotes`-style RPCs page by cursor (`nextPageToken`, empty on the last
page). The scaffold's hook keeps the first page and shows the paged shape
in a comment. A hook that scrolls to load more adds `loadMore` and
`hasMore`, and keeps three refs so a scroll handler never acts on a render
that has not caught up:

- `next`: the next page's token (`''` before the first page);
- `busy`: a call is in flight (or failed), so `loadMore` is a no-op;
- `run`: which run of the hook an answer belongs to. The effect's cleanup
  bumps it, and an answer whose run is not the current one is dropped,
  so a screen that stopped wanting the list (or asked to start over)
  never gets a late page.

Pages after the first append, de-duplicated by id: a row can come again
when the list shifts under the reader, and the later copy is the current
one.

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
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { useViewport } from "../../styles/viewport";
import { <Resource>Form } from "./<Resource>Form";
import { <Resource>Row } from "./<Resource>Row";
import { use<Resources> } from "./use<Resources>";

export function <Resources>Screen() {
  const { <resources>, loading, error, create, archiving, archive } =
    use<Resources>();
  const { width } = useViewport();

  return (
    <View style={{ flex: 1, alignSelf: "center", width: Math.min(width, 640) }}>
      <<Resource>Form onSubmit={create} />
      {error ? <Text>Something went wrong: {error}</Text> : null}
      {loading ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={<resources>}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <<Resource>Row
              <resource>={item}
              archiving={archiving === item.id}
              onArchive={() => archive(item.id)}
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
(the Maybloom app is the prior art); they are a documented pattern, not
scaffold code. `Me` and `GetMe` here are generic names for whatever the
contract calls the signed-in person and the RPC that returns them.

**The `Session` union.** One shape for every screen to switch on:

```ts
export type Session =
  | { state: "loading" }
  | { state: "signedOut" }
  | { state: "signedIn"; me: Me }
  | { state: "error"; message: string };
```

**`SessionProvider`: one `GetMe` at the root.** Mounted once in
`app/_layout.tsx`, it calls `GetMe` once and shares the answer. Without it
every screen fetches its own copy, and a first visit pays one round trip
per screen. It exposes `refresh()` (ask again) and `update(patch)` (a
screen that changes the person's data patches the shared shape without a
refetch). `Unauthenticated` maps to `signedOut`; any other failure maps to
`error` with the message.

```tsx
export function SessionProvider({ children }: { children: ReactNode }) {
  const { <app_slug>: api } = useBackend();
  const [session, setSession] = useState<Session>({ state: "loading" });

  const refresh = useCallback(async () => {
    try {
      const res = await api.getMe({});
      setSession(
        res.user
          ? { state: "signedIn", me: { user: res.user } }
          : { state: "error", message: "No user in the response" },
      );
    } catch (err) {
      setSession(
        err instanceof ConnectError && err.code === Code.Unauthenticated
          ? { state: "signedOut" }
          : { state: "error", message: errorMessage(err) },
      );
    }
  }, [api]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const update = useCallback((patch: Partial<Me>) => {
    setSession((prev) =>
      prev.state === "signedIn"
        ? { state: "signedIn", me: { ...prev.me, ...patch } }
        : prev,
    );
  }, []);

  // Provide { session, refresh, update } through a context; useSession()
  // reads it and throws when no SessionProvider is above it.
}
```

**The route gate.** A thin route reads `useSession()` and renders, in
order: a loading state; a signed-out card (with the error message when the
state is `error`); then the feature screen with `session.me`. Redirects for
"not set up yet" belong here too, in the route, not in the screens.

```tsx
export default function Protected() {
  const { session } = useSession();

  if (session.state === "loading") return <LoadingState />;
  if (session.state === "signedOut" || session.state === "error") {
    return (
      <SignedOutCard
        error={session.state === "error" ? session.message : undefined}
      />
    );
  }
  return <<Resources>Screen me={session.me} />;
}
```

The board shows the screen by passing it a `Me` fixture, so the gate is
the only code that needs a `SessionProvider`.

**`signIn` and `signOut` are off-page trips on the Backend.** `signIn`
navigates to the backend's login route (`/auth/login`) and returns a
promise that never settles. `signOut` posts to the logout route with
credentials, throws a readable error when the backend refuses, and on the
web navigates home with a promise that never settles. A fake backend
settles both so a specimen can show what follows.

**Cookie sessions need `credentials: "include"`.** connect-web v2 has no
`credentials` option; pass a `fetch` override on the transport:

```ts
const transport = createConnectTransport({
  baseUrl: API_URL,
  fetch: (input, init) =>
    globalThis.fetch(input, { ...init, credentials: "include" }),
});
```

Harmless on native, required on the web whenever the backend sets the
session cookie (and, when the API is on another origin, the backend needs
CORS with credentials).

## Tests

The scaffold ships the harness and one test: `jest-expo`, React Native
Testing Library, and `src/features/notes/NotesScreen.test.tsx`, which
renders the screen inside `Fake` (the board's `fakeBackend`) and asserts
what a user sees in the `notes`, `empty` and `error` scenarios. Run it
with `pnpm test` from the repo root. A test file under `src/`
(`*.test.tsx`, `__tests__/`) is exempt from the board's import rule, so
it can import `Fake` the way the board does.

The fake is a real Connect client over `createRouterTransport`, an
in-process scripted service; there are no mocks, and a hook is tested
through the screen that uses it. Use RNTL's async queries (`findByText`),
since the hook answers after a render. A new RPC is answered in
`fakeBackend` first (the typecheck fails until it is), then a test can use
it. React Native Testing Library 14 is async end to end: `await
render(...)` and `await fireEvent.*(...)`; the scaffold pins 13, where
`render` is sync.

## React Query, opt-in

Choose React Query when the project needs what the hand-written hook
does not give: a cache shared across many screens that must stay
consistent after a write (invalidation), or optimistic updates. A project
with a handful of screens that each read their own data does not; the
hook above is less code and has no cache to reason about. It is the
project owner's call: it adds a dependency.

Add `@tanstack/react-query`, one `QueryClient` and a `QueryClientProvider`
in `app/_layout.tsx`, and keep `useBackend()` as the one way to reach the
client. The board's `Fake` then also needs its own `QueryClient`
(`retry: false`) per specimen so a specimen's cache stays its own.

### The api and queries tiers

Two tiers sit between the context and the screen, and the feature's hook
becomes the queries tier.

`src/data/api/<resources>.ts` — thin functions around the Connect client.
They take the client as their first argument (the hook gets it from
`useBackend()`); never import a client into this file.

```ts
export async function list<Resources>(client: AppClient, pageToken = "") {
  const response = await client.list<Resources>({ pageSize: 50, pageToken });
  return { <resources>: response.<resources>, nextPageToken: response.nextPageToken };
}

export async function archive<Resource>(client: AppClient, id: string) {
  const response = await client.archive<Resource>({ id });
  return response.<resource>;
}
```

`src/data/queries/use<Resources>.ts` — one `useQuery` for the list, one
`useMutation` per write, each invalidating the list key on success:

```ts
const <RESOURCES>_KEY = ["<resources>"] as const;

export function use<Resources>() {
  const { <app_slug>: client } = useBackend();
  return useQuery({
    queryKey: <RESOURCES>_KEY,
    queryFn: () => list<Resources>(client),
    select: (page) => page.<resources>,
  });
}

export function useArchive<Resource>() {
  const { <app_slug>: client } = useBackend();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => archive<Resource>(client, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: <RESOURCES>_KEY }),
  });
}
```

Cache-key conventions:

- Lists: `["<resources>"]` (or `["<resources>", filters]` if filters).
- Single items: `["<resource>", id]`.
- After a mutation that changes one item, invalidate both keys.

A screen that scrolls to load more uses `useInfiniteQuery` over
`list<Resources>(client, pageToken)` with `getNextPageParam` reading
`nextPageToken`.

### Optimistic updates

For latency-sensitive interactions (toggling a checkbox, reacting to a
post), use `useMutation`'s `onMutate` to update the cache optimistically
and `onError` to roll back, keeping it in the resource's
`use<Resources>.ts` hook rather than in the screen. For first-pass CRUD,
plain `onSuccess: invalidate` is fine.

### connect-query instead of hand-written api + queries

`@connectrpc/connect-query` derives typed hooks from the service
descriptor (`useQuery(list<Resources>)`, keys via
`createConnectQueryKey`), which removes the two tiers. Use it when the
project already does, or when the resource count is large and screens are
happy with the proto types; keep the api tier when screens want narrower
view models. Do not mix the two per resource.

### A persisted query cache cannot hold proto messages as-is

`int64` fields (every `Timestamp.seconds`) are `bigint` and
`JSON.stringify` throws; `bytes` is a `Uint8Array` that serializes as an
object of indexes. Tag both in the persister and reverse on restore.

## Sharp edges

- **Deep imports, no barrels.** Generated protos are imported by their
  full path (`<ORG_SCOPE>/protocol-buffers/<APP_SLUG>/resources/v1/<resources>_pb`).
  Never add an `index.ts` that re-exports the generated tree: Metro does
  not tree-shake and the barrel drags every message into every bundle.
- **Platform suffixes need the plain file too.** `store.native.ts`
  without `store.ts` fails `tsc`; make the web implementation the
  suffix-less file and Metro picks the native one on a device.
