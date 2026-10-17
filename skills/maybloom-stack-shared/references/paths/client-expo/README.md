# Interface: api → queries → screen

Three layers, mirroring the backend. Add them in order.

## 1. `packages/interface/src/data/api/<resources>.ts`

Thin wrappers around the Connect client. They do nothing clever — that's
the React Query layer's job. Returning the raw proto message keeps the
type pipeline straight from server to UI. Each takes the client as its
first argument: the hook above it gets the client from `useClient()`
(`src/data/api/client.ts`), which is the live one in the app and a fake
one on the design board ([gallery.md](./gallery.md)). Never import a
client into this file.

```ts
import { create } from "@bufbuild/protobuf";
import { <Resource>Schema } from "<ORG_SCOPE>/protocol-buffers/<APP_SLUG>/resources/v1/<resources>_pb";
import type { AppClient } from "./client";

// One page, newest first; pass the previous page's nextPageToken for the
// next one. An empty token means this was the last page.
export async function list<Resources>(client: AppClient, pageToken = "") {
  const response = await client.list<Resources>({ pageSize: 50, pageToken });
  return { <resources>: response.<resources>, nextPageToken: response.nextPageToken };
}

export async function get<Resource>(client: AppClient, id: string) {
  const response = await client.get<Resource>({ id });
  return response.<resource>;
}

export async function create<Resource>(
  client: AppClient,
  input: Pick<<Resource> /* the writable subset */, "title" | "body">,
) {
  const <resource> = create(<Resource>Schema, {
    title: input.title,
    body: input.body,
  });
  const response = await client.create<Resource>({ <resource> });
  return response.<resource>;
}

export async function update<Resource>(
  client: AppClient,
  input: <Resource> /* full proto with id */,
) {
  const response = await client.update<Resource>({ <resource>: input });
  return response.<resource>;
}

// The resource's leaving-the-view RPC (here an archive: the row stays, the
// list leaves it out). A verb RPC takes an id, not the whole resource.
export async function archive<Resource>(client: AppClient, id: string) {
  const response = await client.archive<Resource>({ id });
  return response.<resource>;
}
```

If the resource has a UI-friendly summary type that's narrower than the
full proto (e.g. for list views), introduce a `build<Resource>Summary()`
helper here and return that from `list<Resources>` instead of the raw
proto. Keep the mapping in this file so screens never import the raw
generated types.

## 2. `packages/interface/src/data/queries/use<Resources>.ts`

React Query hooks. One `useQuery` for the list (and optionally for get);
one `useMutation` per write operation, each invalidating the list cache
on success. Each hook reads the client with `useClient()` and hands it
to the api function.

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useClient } from "../api/client";
import {
  archive<Resource>,
  create<Resource>,
  list<Resources>,
} from "../api/<resources>";

const <RESOURCES>_KEY = ["<resources>"] as const;

// The first page; a screen that scrolls to load more uses useInfiniteQuery
// over list<Resources>(client, pageToken) with getNextPageParam reading
// nextPageToken.
export function use<Resources>() {
  const client = useClient();
  return useQuery({
    queryKey: <RESOURCES>_KEY,
    queryFn: () => list<Resources>(client),
    select: (page) => page.<resources>,
  });
}

export function useCreate<Resource>() {
  const client = useClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { title: string; body: string }) =>
      create<Resource>(client, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: <RESOURCES>_KEY }),
  });
}

export function useArchive<Resource>() {
  const client = useClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => archive<Resource>(client, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: <RESOURCES>_KEY }),
  });
}
```

For a single-item view:

```ts
export function use<Resource>(id: string | undefined) {
  const client = useClient();
  return useQuery({
    queryKey: ["<resource>", id],
    queryFn: () => get<Resource>(client, id!),
    enabled: !!id,
  });
}
```

Cache-key conventions:

- Lists: `["<resources>"]` (or `["<resources>", filters]` if filters).
- Single items: `["<resource>", id]`.
- After a mutation that changes one item, invalidate both keys.

## 3. The screen and its components

A screen is a component in a feature module,
`packages/interface/src/features/<resources>/<Resources>Screen.tsx`, and
the route only renders it. The bootstrap's Note is the working
reference: `src/features/notes/` holds `NotesScreen` (list + create +
archive), `NoteForm` and `NoteRow`, built from the primitives in
`src/components/primitives` and the tokens in `src/styles/tokens.ts`,
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
import {
  useArchive<Resource>,
  useCreate<Resource>,
  use<Resources>,
} from "../../data/queries/use<Resources>";
import { useViewport } from "../../styles/viewport";
import { <Resource>Form } from "./<Resource>Form";
import { <Resource>Row } from "./<Resource>Row";

export function <Resources>Screen() {
  const { data, isLoading, error } = use<Resources>();
  const create = useCreate<Resource>();
  const archive = useArchive<Resource>();
  const { width } = useViewport();

  return (
    <View style={{ flex: 1, alignSelf: "center", width: Math.min(width, 640) }}>
      <<Resource>Form onSubmit={create.mutateAsync} />
      {isLoading ? (
        <ActivityIndicator />
      ) : error ? (
        <Text>Failed to load: {error.message}</Text>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <<Resource>Row
              <resource>={item}
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

### Optimistic updates

For latency-sensitive interactions (toggling a checkbox, reacting to a
post), use `useMutation`'s `onMutate` to update the cache optimistically
and `onError` to roll back, keeping it in the resource's
`use<Resources>.ts` hook rather than in the screen. For first-pass CRUD,
plain `onSuccess: invalidate` is fine.

## Variants and sharp edges walked in 2026

- **connect-query instead of hand-written api + queries.**
  `@connectrpc/connect-query` derives typed hooks from the service
  descriptor (`useQuery(list<Resources>)`, keys via
  `createConnectQueryKey`), which removes tiers 1 and 2 above. Use it
  when the project already does, or when the resource count is large
  and screens are happy with the proto types; keep the api tier when
  screens want narrower view models. Do not mix the two per resource.
- **Deep imports, no barrels.** Generated protos are imported by their
  full path (`<ORG_SCOPE>/protocol-buffers/<APP_SLUG>/resources/v1/<resources>_pb`).
  Never add an `index.ts` that re-exports the generated tree: Metro does
  not tree-shake and the barrel drags every message into every bundle.
- **Cookie sessions need `credentials: "include"`.** connect-web v2 has
  no `credentials` option; pass a `fetch` override on the transport that
  sets it. Harmless on native, required on the web whenever the backend
  sets the session cookie.
- **A persisted query cache cannot hold proto messages as-is.** `int64`
  fields (every `Timestamp.seconds`) are `bigint` and `JSON.stringify`
  throws; `bytes` is a `Uint8Array` that serializes as an object of
  indexes. Tag both in the persister and reverse on restore.
- **Tests run against a fake service, not a server.** connect-es's
  `createRouterTransport` hosts a scripted implementation in-process;
  pass it where the real transport goes and every hook and screen is
  testable under `jest-expo`. The design board's `fakeClient()` is
  exactly that, in scenarios; a test file under `src/` (`*.test.tsx`,
  `__tests__/`, exempt from the board's import rule) mounts it through
  `ClientProvider` the way the board does. The scaffold ships no test
  runner; this is the shape for the first test. React Native Testing Library 14 is async
  end to end: `await render(...)` and `await fireEvent.*(...)`.
- **Platform suffixes need the plain file too.** `store.native.ts`
  without `store.ts` fails `tsc`; make the web implementation the
  suffix-less file and Metro picks the native one on a device.
