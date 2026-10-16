# Wire handlers into `main.ts`

Edit `packages/backend/src/main.ts`. Two changes:

1. **Import each handler** at the top with the existing import block:

   ```ts
   import { create<Resource> } from "handlers/create<Resource>";
   import { update<Resource> } from "handlers/update<Resource>";
   import { get<Resource> } from "handlers/get<Resource>";
   import { list<Resources> } from "handlers/list<Resources>";
   import { archive<Resource> } from "handlers/archive<Resource>"; // or the resource's own leaving-the-view RPC
   ```

2. **Add them to the ServiceImpl object** (named `<APP_SLUG>Service`):

   ```ts
   const <APP_SLUG>Service: ServiceImpl<typeof <APP_NAME>Service> = {
     // ... existing handlers ...
     create<Resource>,
     update<Resource>,
     get<Resource>,
     list<Resources>,
     archive<Resource>,
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

Auth is an interceptor, not per-handler code: `src/auth.ts` exports
`createAuthInterceptor(open)`, registered in `main.ts` before
`validateInterceptor`, and it refuses every RPC without `kUserId` with
`Unauthenticated` except the methods listed as open. Deny by default: a new
RPC needs no wiring to be auth-required.

A *public* RPC (rare; `Health`, a login) is added to the open list:

```ts
interceptors: [
  errorInterceptor,
  createAuthInterceptor([<APP_NAME>Service.method.health, <APP_NAME>Service.method.<newPublicMethod>]),
  validateInterceptor,
],
```

Where the identity comes from is `contextValues` in `main.ts`: the
development user (`DEV_USER`, refused in production) until the project
reads a real credential there. `server.ts` refuses to boot with neither.
