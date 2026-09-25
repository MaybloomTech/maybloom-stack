# Interface: api → queries → screen

Three layers, mirroring the backend. Add them in order.

## 1. `packages/interface/src/data/api/<resources>.ts`

Thin wrappers around the singleton Connect client. They do nothing
clever — that's the React Query layer's job. Returning the raw proto
message keeps the type pipeline straight from server to UI.

```ts
import { create } from "@bufbuild/protobuf";
import { <Resource>Schema } from "<ORG_SCOPE>/protocol-buffers/<APP_SLUG>/resources/v1/<resources>_pb";
import { client } from "./client";

export async function list<Resources>() {
  const response = await client.list<Resources>({});
  return response.<resources>;
}

export async function get<Resource>(id: string) {
  const response = await client.get<Resource>({ id });
  return response.<resource>;
}

export async function create<Resource>(
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
  input: <Resource> /* full proto with id */,
) {
  const response = await client.update<Resource>({ <resource>: input });
  return response.<resource>;
}

export async function delete<Resource>(id: string) {
  await client.delete<Resource>({ id });
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
on success.

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  create<Resource>,
  delete<Resource>,
  list<Resources>,
} from "../api/<resources>";

const <RESOURCES>_KEY = ["<resources>"] as const;

export function use<Resources>() {
  return useQuery({
    queryKey: <RESOURCES>_KEY,
    queryFn: list<Resources>,
  });
}

export function useCreate<Resource>() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: create<Resource>,
    onSuccess: () => qc.invalidateQueries({ queryKey: <RESOURCES>_KEY }),
  });
}

export function useDelete<Resource>() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: delete<Resource>,
    onSuccess: () => qc.invalidateQueries({ queryKey: <RESOURCES>_KEY }),
  });
}
```

For a single-item view:

```ts
export function use<Resource>(id: string | undefined) {
  return useQuery({
    queryKey: ["<resource>", id],
    queryFn: () => get<Resource>(id!),
    enabled: !!id,
  });
}
```

Cache-key conventions:

- Lists: `["<resources>"]` (or `["<resources>", filters]` if filters).
- Single items: `["<resource>", id]`.
- After a mutation that changes one item, invalidate both keys.

## 3. The screen

Two options for where the screen file lives:

- **Single-screen resource:** add a route under
  `packages/interface/app/<resources>/index.tsx` (Expo Router). The
  bootstrap's `app/index.tsx` is a working reference for the absolute
  minimum (list + create + delete in one screen).
- **Detail / edit flow:** add `app/<resources>/[id].tsx` for the detail
  view; the list links to it via `<Link href={`/<resources>/${id}`}>`.

If the project uses the maybloom drawer-and-tabs hybrid layout, register
the new top-level route in `app/_layout.tsx` so it shows up in the nav.
The bootstrap's `_layout.tsx` is just a `Stack` — there's no navigation
to update.

### Screen pattern (mirroring the bootstrap's NotesScreen)

```tsx
import { useState } from "react";
import { ActivityIndicator, Button, FlatList, Text, TextInput, View } from "react-native";
import { useCreate<Resource>, useDelete<Resource>, use<Resources> } from "../../src/data/queries/use<Resources>";

export default function <Resources>Screen() {
  const { data, isLoading, error } = use<Resources>();
  const create = useCreate<Resource>();
  const remove = useDelete<Resource>();
  const [title, setTitle] = useState("");

  if (isLoading) return <ActivityIndicator />;
  if (error) return <Text>Failed: {String(error)}</Text>;

  return (
    <View>
      <TextInput value={title} onChangeText={setTitle} />
      <Button
        title="Add"
        onPress={() => {
          if (!title.trim()) return;
          create.mutate({ title, body: "" });
          setTitle("");
        }}
      />
      <FlatList
        data={data}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => (
          <View>
            <Text>{item.title}</Text>
            <Button title="Delete" onPress={() => remove.mutate(item.id)} />
          </View>
        )}
      />
    </View>
  );
}
```

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
  testable under `jest-expo`. React Native Testing Library 14 is async
  end to end: `await render(...)` and `await fireEvent.*(...)`.
- **Platform suffixes need the plain file too.** `store.native.ts`
  without `store.ts` fails `tsc`; make the web implementation the
  suffix-less file and Metro picks the native one on a device.
