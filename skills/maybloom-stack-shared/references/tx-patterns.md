# Transaction patterns

Multi-step mutations on the backend run inside a Drizzle transaction so
that a partial failure leaves no half-written state. This file
collects the recurring shapes.

## Ground rules

1. Wrap with `server.db.transaction(async (tx) => { ... })`.
2. **Inside the transaction, always pass `tx`** — never call
   `server.db.foo()` from inside, that bypasses the transaction.
   Helper functions that participate in the transaction take a `tx`
   parameter typed as
   `Parameters<Parameters<typeof server.db.transaction>[0]>[0]` (or a
   named alias like `DbExecutor` in `core/<resources>/store.ts`).
3. Throw `ConnectError` from inside; Drizzle rolls back on throw.
4. Read `proto-conventions.md` for empty-string-vs-NULL: the adapter
   handles that, not the store. Stores work in DB-shaped values.

## Pattern: read-modify-write with derived state

The canonical shape, shown here as `updateBook` on a resource with an
event table and two child collections. Use this
whenever a single RPC has to: validate, compute new state from the
*old* state, write the row, and emit related side-effect rows
(events, notifications, child tables) — atomically.

The shape, in order:

1. **Validate** the request (id present, etc.). Throw `ConnectError` if
   broken before opening the transaction.
2. **Open the tx.**
3. **Load before-row.** A plain select on the row by id. Keep it as
   `before` — you'll diff against it later. Throw NotFound if missing.
4. **Mutate.** Apply adapter's `<resource>ToUpdate(input)` plus
   `updatedAt: new Date()` and `.returning()`.
5. **Recompute derived state.** Run state-machine functions (e.g.
   `nextBookState(row)`) against the new row; if they flip something,
   write again. Don't pre-compute before the first write — derived
   state often depends on the merged row.
6. **Emit events.** Diff `before` vs the new row to build event rows
   (`buildTransitionEvents(before, row, actorId)`). Insert into the
   event table only if the array is non-empty.
7. **Replace M:N children.** For each child collection on the proto
   (links, editions), call a `replace<Children>` helper
   that does `delete + insert` inside the same `tx`. See
   "Load + replace" below.
8. **Reload aggregates and shape the proto** via the adapter's
   `<resource>RowToProto(row, ...children)` helper.

In code, with the verbs labelled:

```ts
export async function updateBook(request: UpdateBookRequest) {
  const input = request.book;
  if (!input?.id) {
    throw new ConnectError("Book id is required", Code.InvalidArgument);
  }
  return server.db.transaction(async (tx) => {
    // 1. Load before-row.
    const [before] = await tx.select().from(books).where(eq(books.id, input.id));
    if (!before) throw new ConnectError("Book not found", Code.NotFound);

    // 2. Mutate.
    const [withFields] = await tx
      .update(books)
      .set({ ...bookToUpdate(input), updatedAt: new Date() })
      .where(eq(books.id, input.id))
      .returning();

    // 3. Recompute derived state.
    const nextState = nextBookState(withFields);
    const [row] =
      withFields.state === nextState
        ? [withFields]
        : await tx.update(books).set({ state: nextState })
            .where(eq(books.id, input.id)).returning();

    // 4. Emit events.
    const events = buildTransitionEvents(before, row, input.updatedBy ?? null);
    if (events.length) await tx.insert(bookEvents).values(events);

    // 5. Replace child collections.
    await replaceBookAuthorLinks(tx, row.id, input.authorLinks ?? []);
    await replaceBookEditions(tx, row.id, input.editions ?? []);

    // 6. Reload aggregates + shape proto.
    const aggregates = await loadBookAggregates(tx, [row.id]);
    return rowToProto(row, aggregates.authorMap, aggregates.editionMap);
  });
}
```

Why this order matters:

- Loading `before` *before* the update is the only way to compute
  transition events; once you write, the diff is gone.
- Recomputing derived state *after* the merge prevents re-deriving
  every time anyone calls the same store function from elsewhere — the
  state machine lives in one place.
- Replacing children *after* the parent is final means foreign-key
  constraints to the parent always succeed.
- Reloading aggregates from `tx` (not from `server.db`) ensures the
  proto reflects the just-replaced children, not stale ones.

Workflow RPCs like `checkOutBook` follow the same shape, just with the
transition predetermined by the RPC method (no diff against `before`
needed for the state — but `before` is still useful for the event
description).

## Pattern: load + replace for M:N children

Used inside `replaceBookAuthorLinks` and `replaceBookEditions`. The
proto sends the *full desired list*
of children; the store wipes the old set and inserts the new set
inside the same `tx`. Don't try to diff and apply minimal upserts —
the adapter would have to track ordering and identity, which is
brittle. Trust the transaction to make this atomic.

```ts
async function replaceBookAuthorLinks(
  db: DbExecutor,
  bookId: string,
  links: BookAuthorLink[],
): Promise<void> {
  await db.delete(bookAuthorLinks).where(eq(bookAuthorLinks.bookId, bookId));
  const rows = authorLinksToRows(bookId, links);
  if (rows.length === 0) return;
  await db.insert(bookAuthorLinks).values(rows);
}
```

Two notes:

- The `if (rows.length === 0) return;` guard is required: Drizzle's
  `.values([])` is an error, not a no-op.
- The function takes `db: DbExecutor` (the tx-typed alias) so it can
  be called either from inside a transaction or, in rare read-modify
  paths that don't need a tx, with `server.db` directly.

## Pattern: aggregate loaders for list queries

`loadBookAggregates(tx, bookIds)` is the model. For each child relation,
write a `loadXByBookIds(db, ids)` helper that returns
`Map<parentId, child[]>`. The store's list/get functions then call all
loaders in parallel via `Promise.all` and build proto messages from the
maps.

This pattern keeps the store O(parents) rather than O(parents × children)
in DB roundtrips, which is what makes a list RPC stay flat as the table
grows.

## What does *not* belong in a transaction

- External I/O (HTTP calls to push services, S3 uploads). Capture what
  you need *before* opening the transaction; perform side effects
  *after* the transaction commits, in the handler or store function.
  Network failures after a partial DB write are unrecoverable.
- Notifications that require the row's `id` to exist server-side — fine
  to enqueue *after* the transaction returns. The create function opens
  the tx, writes the row, closes it, and only then fans out
  notifications with the committed id.
- Long-running computations (e.g. iterating thousands of rrule
  occurrences). Compute outside, write the result inside.
