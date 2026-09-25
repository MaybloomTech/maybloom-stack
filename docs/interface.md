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

A second walked shape collapses the first two tiers into generated code:
`@connectrpc/connect-query` derives typed `useQuery`/`useMutation` hooks
straight from the service descriptor, with keys from
`createConnectQueryKey`, so a screen calls `useQuery(listNotes)` and no
one hand-writes an api module. It is the right choice when the resource
count is large and the view types are the proto types; the hand-written
api tier earns its keep when screens want narrower view models than the
wire carries. Either way, generated protos are deep-imported and never
re-exported through a barrel file, because Metro does not tree-shake and a
barrel over the contract drags every message into every bundle.

A persisted query cache (`@tanstack/react-query-persist-client` for an
instant cold start) cannot hold protobuf-es messages as they are: every
`int64` is a `bigint`, including `Timestamp.seconds`, and `JSON.stringify`
throws on it; `bytes` is a `Uint8Array` that serializes as an object of
indexes. The persister has to tag both and reverse the tags on restore.
Neither library documents this; the first persisted list finds it.

The Connect client is a singleton (`src/data/api/client.ts`):
`createConnectTransport({ baseUrl })` from `@connectrpc/connect-web` plus
`createClient(AppService, transport)`. connect-web v2 dropped the
`credentials` option, so a client whose session is a cookie passes a
`fetch` override that sets `credentials: "include"` on every request.

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

The validated harness is `jest-expo` with React Native Testing Library,
because Vitest cannot render React Native components. connect-es's
`createRouterTransport` runs a fake service in-process, so the session
state machine, the refresh classification and every screen can be tested
against a scripted server with nothing listening on a port; a test that
flips the fake to `Unavailable` mid-session and expects the session to
survive is the one that pins the sign-out rule. Testing Library 14 is
asynchronous end to end: `await render(...)` and `await fireEvent.*`, or
the next render in the file comes back empty two tests away from the
cause. End-to-end web checks run Playwright against a real deployed
server, never a mock, because the contract is what is being validated.

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
- CI builds the export on every pull request and runs the export smoke
  against it, with the Expo CLI told to stay offline (`EXPO_OFFLINE=1`,
  `EXPO_NO_TELEMETRY=1`) so it does not reach for the Expo API.
