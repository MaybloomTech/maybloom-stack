# Wire handlers into `main.ts`

Edit `packages/backend/src/main.ts`. Two changes:

1. **Import each handler** at the top with the existing import block:

   ```ts
   import { create<Resource> } from "handlers/create<Resource>";
   import { update<Resource> } from "handlers/update<Resource>";
   import { get<Resource> } from "handlers/get<Resource>";
   import { list<Resources> } from "handlers/list<Resources>";
   import { delete<Resource> } from "handlers/delete<Resource>";
   ```

2. **Add them to the ServiceImpl object** (named `<APP_SLUG>Service`):

   ```ts
   const <APP_SLUG>Service: ServiceImpl<typeof <APP_NAME>Service> = {
     // ... existing handlers ...
     create<Resource>,
     update<Resource>,
     get<Resource>,
     list<Resources>,
     delete<Resource>,
   };
   ```

That's it. The `ServiceImpl<typeof <APP_NAME>Service>` constraint forces
exhaustiveness — TypeScript will list every missing method by name. Use
that as your check that nothing's omitted.

## Verify

```bash
pnpm --filter <ORG_SCOPE>/backend typecheck
```

Should pass cleanly. If it fails:

- "`Type ... is not assignable to ServiceImpl<...>`" — a method in the
  proto service has no key in the object. Add it or check the spelling.
- "`'<method>' does not exist on type 'ServiceImpl<...>'`" — the proto
  was edited but `pnpm proto:gen` wasn't run, or the method name has a
  typo. Regenerate.
- Any other TS error usually points at the adapter or store layer; fix
  upstream first.

## Auth-required RPCs

If the project has wired session auth as a Fastify `onRequest` hook in
`main.ts`, the convention is deny-by-default: every RPC is auth-required
*except* those whose path matches an explicit allowlist (e.g.
`createGoogleSession`). New RPCs need no extra wiring to be auth-required
— they get it for free.

If you're adding a *public* RPC (rare — usually only auth-related ones),
extend the allowlist:

```ts
const publicMethods = new Set([
  `${rpcPathPrefix}${<APP_NAME>Service.method.createGoogleSession.name}`,
  `${rpcPathPrefix}${<APP_NAME>Service.method.<newPublicMethod>.name}`,
]);
```

The bootstrap scaffold ships *without* the auth hook — every RPC is
public until you wire auth. This is intentional: it keeps the starter
runnable without external services. Wire the hook when the project has
real users.
