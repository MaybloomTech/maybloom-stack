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
- **Unary by default.** A long operation returns a resource whose status
  the client polls. Server streaming is a stack-wide decision a project
  makes once (see `core.md`), never something one RPC adopts on its own;
  if the project has not made it, this RPC is unary.
- **Lists page by cursor.** A list RPC carries `page_size` (validated,
  0 for the default), an opaque `page_token`, and answers
  `next_page_token`, empty on the last page; never an offset and never a
  total. `ListNotes` in the bootstrap scaffold is the shape.
- **Leaving the default view is a verb RPC of its own.** How a resource leaves the default view is the app's decision, not the
  stack's. Ask it when the resource arrives: what should happen to the
  resource, and to the rows that point at it? Some common answers, as
  illustrations only: a hard `Delete<Resource>` RPC that removes the row
  (leaf data nothing references); a soft delete, a `deleted_at` the reads
  filter on, with no way back; archive as a first-class state through a
  dedicated verb RPC (`Archive<Resource>(id)` sets `archived_at`, `List`
  takes `include_archived`, and `Unarchive<Resource>` mirrors it when a
  screen needs it). The list is not exhaustive and an app may do otherwise.
  What the stack asks is that the answer be its own RPC with its rule in its
  comment, never a flag on `Update`. The Note example gives one answer,
  `ArchiveNote`.
  The worked example below is that RPC.
- **Input rules go in the contract.** Both paths run protovalidate in an
  interceptor: mark a message-typed request field the handler
  dereferences `required`, put `string.uuid` on ids and bounds on limits
  as `buf.validate` options rather than in handler code.

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
the server struct). Read identity from request context, call the store,
shape the response; the contract's rules were enforced before it ran. If
it needs more than about twenty lines, the rule has leaked out of the
store.

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
- **design board** (Expo) — the fake backend in
  `src/gallery/fixtures/backend.ts` answers the RPC the way the server's
  rule does (the interface's typecheck fails until it exists, once the
  contract is rebuilt: after `pnpm proto:gen`, rebuild the contract (`pnpm --filter <ORG_SCOPE>/protocol-buffers build`): the interface reads its built `dist/*.d.ts`), and the
  new states get specimens: a `failing: ["<method>"]` page state for the
  error, a `Play` that taps the control. See
  `../maybloom-stack-shared/references/paths/client-expo/gallery.md`.

## Worked example: `ArchiveNote`

The bootstrap's Note answers "how does a note leave the default view" with
an archive, and ships it as a verb RPC. Every layer of it is in the
scaffold; this is the path through them.

**Proto** (`proto/<APP_SLUG>/service/v1/notes.proto`, `service.proto`):

```proto
// Archive a note: sets archived_at (kept if already set) and leaves the
// row and its id in place; ListNotes leaves it out unless include_archived
// is set. Errors: CodeNotFound for an unknown id.
message ArchiveNoteRequest {
  string id = 1 [(buf.validate.field).string.uuid = true];
}
message ArchiveNoteResponse {
  <APP_SLUG>.resources.v1.Note note = 1;
}

rpc ArchiveNote(ArchiveNoteRequest) returns (ArchiveNoteResponse);
```

The request carries an id, not a `Note`; the response carries the note as
it now is. The resource already has `optional archived_at`, and
`ListNotesRequest` already has `include_archived`, so step 2 (schema) is
empty.

**Store**, Go (`go/db/queries/notes.sql`, `internal/store/notes.go`):

```sql
-- name: ArchiveNote :one
UPDATE notes
SET archived_at = COALESCE(archived_at, now()), updated_at = now()
WHERE id = sqlc.arg(id)
RETURNING *;
```

```go
func (s *Store) ArchiveNote(ctx context.Context, id string) (*resourcesv1.Note, error) {
	uid, err := argUUID(id)
	if err != nil {
		return nil, err
	}
	row, err := s.q.ArchiveNote(ctx, s.pool, uid)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, noteNotFound()
	}
	if err != nil {
		return nil, internalError("could not archive the note", err)
	}
	return noteToProto(row), nil
}
```

TypeScript (`src/core/notes/store.ts`): the same `coalesce` in a Drizzle
`update(...).set({ archivedAt: sql\`coalesce(${notes.archivedAt}, now())\`,
updatedAt: new Date() })`, `NotFound` when no row comes back.

The rule the RPC exists for is the `COALESCE`: archiving twice keeps the
first timestamp. `UpdateNote` never touches `archived_at`. The mirror,
`UnarchiveNote` (`SET archived_at = NULL`), is documented and not shipped;
add it the day a screen needs it, the same way.

**Handler**: read the caller from the context (a mutation with no caller
is `Unauthenticated`), call the store, wrap the note. Go: a method on
`Service` in `internal/server/notes.go`; TypeScript: `src/handlers/archiveNote.ts`,
added to the service object in `main.ts`.

**Client**: `archiveNote(client, id)` in `src/data/api/notes.ts` calls
`client.archiveNote({ id })`; `useArchiveNote` is a `useMutation` that
gets the client from `useClient()` and invalidates the notes list key,
because the operation changes list membership; the row's Archive button
calls `mutate(item.id)`. On the Expo path the design board's fake backend
(`src/gallery/fixtures/backend.ts`) answers it too, setting `archived_at`
on its copy, or the interface's typecheck fails (after `pnpm proto:gen`
and `pnpm --filter <ORG_SCOPE>/protocol-buffers build`); see
`../maybloom-stack-shared/references/paths/client-expo/gallery.md`.

**Verify**: archive, then list (the note is gone), then list with
`include_archived: true` (it is back, first); archive it again and compare
`archived_at`; archive an unknown id and read `not_found`.

## Verification before claiming done

1. Typecheck the whole repo (or `go build ./...` and `go vet ./...`). On
   both paths the generated service type is what proves the RPC is wired.
2. Call it for real — a test through the generated client, or curl
   (Connect is POST + JSON:
   `curl -X POST http://localhost:<PORT>/<APP_SLUG>.service.v1.<APP_NAME>Service/<Method> -H 'content-type: application/json' -d '{...}'`, where the port is the backend's: 8080 on the Go path, 3000 on TypeScript).
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
