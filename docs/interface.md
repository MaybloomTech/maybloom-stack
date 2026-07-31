---
title: Interface
description: The Expo Router + React Query client blueprint
order: 5
---

# Interface

The interface is one Expo app that ships to Android, iOS, and the web from a
single codebase. Expo Router owns navigation, React Query owns server state,
and the generated Connect client owns the wire. The package is called the
interface everywhere, because it is the human side of the system rather than
a "front" to the backend.

Neither the word nor the framework is the load-bearing part. What the
stack's core guarantees is that any client, in any language Connect or
gRPC-Web reaches, starts from generated code that already knows every
resource, RPC, and field the service offers. Expo is the validated
implementation because one codebase ships to Android, iOS, and the web;
the shape documented here — typed wrappers over the generated client, a
server-state cache, screens on top — transfers to other frameworks, and
the skills carry a language-neutral version of it for projects that
choose differently.

The bootstrap skill scaffolds this blueprint with a working example screen
wired to the example resource.

## Structure

```
app/                     Expo Router route files, thin by rule
  notes/index.tsx        re-exports a screen, nothing else
src/
  screens/<area>/        the real screen components
  components/            domain components + primitives + shells
  data/
    api/                 typed client wrappers, one module per resource
    queries/             useQuery hooks + the query-key factory
    mutations/           useMutation hooks with invalidation
    queryClient.ts       one QueryClient, tuned defaults
  state/                 app-level contexts (mode, auth)
  styles/                design tokens: colors, type, spacing, breakpoints
```

Route files re-export screens so navigation structure and screen
implementation evolve independently. When one URL must render differently by
app mode, the route file switches on the mode and renders the right screen;
the URL stays stable and nothing redirects.

## The data layer

Three tiers, one module per resource in each:

1. **api** wraps the generated client: `client.createNote(...)`, converting
   proto messages to plain view types at the boundary (timestamps to ISO
   strings, enums to unions). This mirrors the backend adapter, one shape
   translation on each side of the wire.
2. **queries** are `useQuery` hooks keyed by a central factory
   (`queryKeys.notes(filters)`, `queryKeys.note(id)`). List keys and item
   keys are distinct so invalidation can be precise.
3. **mutations** are `useMutation` hooks that invalidate both the item key
   and the list key on success. Optimistic updates are an opt-in per
   mutation, added when a screen's feel demands it.

The Connect client is a singleton (`src/data/api/client.ts`):
`createConnectTransport({ baseUrl })` from `@connectrpc/connect-web` plus
`createClient(AppService, transport)`. One interceptor attaches
`Authorization: Bearer <token>` from a synchronous in-memory token cache and
clears the session on an `Unauthenticated` response; the entire logout
policy is those few lines.

**A transport note the upstream docs will not give you:** connect-es
officially targets Node and browsers; React Native is unsupported territory.
The stack uses the web transport on native, which works because the contract
is unary-only. Adopting streaming RPCs means solving the React Native fetch
story first (an XHR-based transport or `expo/fetch`); until then, unary is a
stack rule, on every backend.

## Sessions and environment

- Tokens live in SecureStore on native and localStorage on the web, with a
  synchronous cache so the interceptor never awaits storage.
- `EXPO_PUBLIC_*` variables are inlined at build time. The API URL is a
  build-time fact; changing it means rebuilding the bundle.

## App chrome

When one product has two jobs, the interface renders one of two shells
around the same routes: an everyday capture chrome and an authoring chrome,
selected by a persisted app mode and gated by role. Both shells implement
the same responsive rule: bottom tabs on compact screens, a drawer on large
web and iOS. Two chromes, one route tree, one data layer.

## Build and deploy

- Native builds go through EAS (APK for previews, AAB for production).
- The web target is a static export (`expo export --platform web`) served by
  nginx in a container, built from the monorepo root with `EXPO_PUBLIC_*`
  build args, and deployed beside the backend in the same compose file.
