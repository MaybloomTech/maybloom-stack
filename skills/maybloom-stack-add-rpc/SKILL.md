---
name: maybloom-stack-add-rpc
description: Use whenever the user wants ONE new operation on an existing maybloom stack service (a proto + Connect-RPC monorepo, from `maybloom-stack-bootstrap` or following its conventions) rather than a new resource or new data on one — a workflow RPC like `CheckOutBook`, `PublishPost`, `ArchiveTask`, a sub-resource list like `ListBookEvents` or `ListTaskComments`, a search or report RPC, or an action the user describes as a verb. Triggers on "add an endpoint to publish a post", "I need a way to check out a book", "list the events for a task", "add a search RPC", "an action to archive". Works on both validated server paths (TypeScript/Fastify, Go/connect-go) and on open paths through the shared core reference. Prefer this over `maybloom-stack-add-resource` when the request is a verb rather than a noun, and over `maybloom-stack-extend-resource` when the user wants something to *happen* rather than something to be *stored* — a state change that carries rules about who may perform it belongs in an RPC, not in a field the client writes.
---

# maybloom-stack-add-rpc

Add one RPC to a service that already exists. Compared with adding a
resource, most of the pipeline drops away:

```
proto  →  (schema only if the operation needs new state)  →  store  →  handler  →  wiring
                                                                                     ↓
                                                                          api / query or mutation / screen
```

There is no new table in the common case, no adapter change, and no new
resource. What this skill is really about is the two decisions the
pipeline can't make for you: **what the request and response should be**,
and **whether this is one operation or a resource wearing a verb's
clothing**.

## Which implementation?

- **`packages/backend/` with `drizzle.config.ts`** → TypeScript. Read
  `../maybloom-stack-shared/references/paths/backend-typescript/README.md`,
  then `store.md`, `handlers.md`, and `wiring.md` for the layers you touch.
- **`go/` with `sqlc.yaml`** → Go. Read
  `../maybloom-stack-shared/references/paths/backend-go/README.md`. Its
  wiring step is empty: the generated handler interface fails the build
  until the new method exists, which is the whole checklist.
- **Both present** → ask which service owns the operation. A service block
  belongs to exactly one backend; an RPC never spans two.
- **Something else** → open path via
  `../maybloom-stack-shared/references/core.md`.

Client work goes through
`../maybloom-stack-shared/references/paths/client-expo/README.md` for the
Expo interface.

## Is this actually one RPC?

Three checks, worth a moment because the wrong answer here is expensive
later.

- **A verb over an existing noun → yes, one RPC.** `CheckOutBook`,
  `PublishPost`, `ArchiveTask`. The state it changes lives on a resource
  that already exists.
- **A noun with its own lifecycle → a resource.** If the user starts
  describing "and it has an id, and you can list them, and edit them",
  that is `maybloom-stack-add-resource`, not one RPC.
- **New data on an existing resource with no rule about who writes it →
  extend instead.** A `notes` field the client can just set does not need
  an RPC. The reason to prefer an RPC is that a *rule* comes with the
  change — who may do it, what else must happen, what must be recorded —
  and a rule needs somewhere to live.

Sub-resource lists (`ListBookEvents`) are RPCs rather than fields when the
collection is unbounded, paged, or expensive: embedding it in the parent
would make every `GetBook` pay for it.

## Naming and message shape

The conventions live in
`../maybloom-stack-shared/references/proto-conventions.md`; this is what
they mean for a new operation.

- **`<Verb><Resource>`** for the method: `CheckOutBook`, `ArchiveTask`.
  Sub-resource lists are `List<Resource><Children>`: `ListBookEvents`.
- **Always a dedicated request and response message**, named
  `<Method>Request` and `<Method>Response`, even when one is empty. A
  named empty message can grow a field later without breaking the wire;
  `google.protobuf.Empty` cannot, and this stack never uses it.
- **Requests carry ids and arguments, not whole resources.**
  `CheckOutBookRequest` holds `book_id` and `borrower_id`, not a `Book`.
  Whole-resource requests are the CRUD pattern, and reusing it here invites
  the client to send a stale copy of everything.
- **Responses carry what changed.** Return the updated resource
  (`Book book = 1;`) so the client can update its cache from the response
  rather than refetching. A list RPC returns one `repeated` field.
- **Unary only.** Streaming is outside the stack; a long operation returns
  a resource whose status the client polls, which keeps every deployment
  story simple.

Add the two messages to `proto/<APP_SLUG>/service/v1/<resources>.proto`
next to the CRUD envelopes for the same resource, and the `rpc` line to
the one `service` block in `service.proto`, in the comment-headed group
for that resource. Then regenerate with `pnpm proto:gen`.

## Sequence

### 1. Proto

Request message, response message, `rpc` line. Comment the RPC with what
it does and any rule it enforces — that comment is the documentation a
contract-rendering site publishes, and the note the next person reads
before changing the rule.

### 2. Schema, only if the operation needs new state

Most operations write columns that already exist. Two cases need more:

- The operation records an event (`BookEvent` rows). That is a child
  table, and it is worth asking whether the user wants the event stream to
  be a resource of its own.
- The operation needs a new status column. That is
  `maybloom-stack-extend-resource` work; do it first, then come back.

If neither applies, skip straight to the store.

### 3. Store

One function per operation, on the store for the resource it acts on. This
is where the rule lives, and it is the reason the operation is an RPC
rather than a field.

- Load, check, write — inside a transaction when more than one table
  changes. `../maybloom-stack-shared/references/tx-patterns.md` covers the
  shapes, especially read-modify-write for anything derived from current
  state (checking out a book that is already checked out must lose the
  race, not double-book it).
- Speak the RPC error model directly: `NotFound` for a missing row,
  `FailedPrecondition` for "the book is already out",
  `PermissionDenied` for "not your loan", `InvalidArgument` for a bad
  request. Choosing the right code here is what lets the client show a
  useful message without parsing strings.
- Return the updated resource so the handler has something to put in the
  response.

### 4. Handler

One thin function (TypeScript: a file in `src/handlers/`; Go: a method on
the server struct). Validate presence, read identity from request context,
call the store, shape the response. If it needs more than about twenty
lines, the rule has leaked out of the store.

Identity comes from the context the auth interceptor populated, never from
the request body — an RPC that trusts a client-supplied `user_id` is an
authorization bug with extra steps.

### 5. Wiring

**TypeScript** — add the handler to the service implementation object in
`src/main.ts`. The object is typed against the generated service, so
until you do, the build fails and names the missing method.

**Go** — nothing. The generated handler interface already requires the
method; `go build ./...` is the checklist.

### 6. Client

- **api** — one thin wrapper next to the resource's existing ones.
- **query or mutation** — a list RPC is a `useQuery` with its own key
  under the resource's key factory. An action is a `useMutation` that
  invalidates the keys the operation affects: the item key always, the
  list key when the operation can change list membership or ordering.
  Getting this wrong shows up as a screen that needs a manual refresh.
- **screen** — the control that triggers it, plus the disabled/failed
  states the new error codes make possible.

## Verification before claiming done

1. Typecheck the whole repo (or `go build ./...` and `go vet ./...`). On
   both paths the generated service type is what proves the RPC is wired.
2. Call it for real — a test through the generated client, or curl
   (Connect is POST + JSON:
   `curl -X POST http://localhost:3001/<APP_SLUG>.service.v1.<APP_NAME>Service/<Method> -H 'content-type: application/json' -d '{...}'`).
3. Exercise the failure the rule exists for, not just the happy path:
   check out a book that is already out and confirm the error code is the
   one you chose.
4. From the client, confirm the affected screens update without a manual
   refresh — that is the invalidation working.
5. Generated code is absent from `git status`.

## Common pitfalls

- **Reusing a CRUD request message** because the fields happen to match.
  The two evolve independently, and the day they diverge the change is a
  wire break instead of a new field.
- **Returning nothing.** An empty response makes the client refetch to
  learn what happened; returning the updated resource is usually one line
  and removes a round trip.
- **Putting the rule in the handler.** It works, and then the next caller
  — a job, a second RPC, a test — bypasses it.
- **Taking the actor from the request.** Identity comes from the
  interceptor's context.
- **`CodeInternal` for expected refusals.** "Already checked out" is
  `FailedPrecondition`; internal means nobody expected this.
- **Adding an RPC when the user wanted a resource.** If you find yourself
  writing the second and third RPC for the same noun, stop and use
  `maybloom-stack-add-resource` instead.
