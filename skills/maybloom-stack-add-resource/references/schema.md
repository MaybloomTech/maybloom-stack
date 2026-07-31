# Schema + migration

Edit `packages/backend/src/db/schema.ts`. Add one `pgTable("<resources>", ...)`
export. Plural table name, plural variable name; matches the proto's
`repeated <Resource> <resources>` field on the list response.

## Mapping proto types to Drizzle columns

| Proto | Drizzle |
|---|---|
| `string id = ...;` (primary key) | `text("id").primaryKey()` |
| `string title = ...;` (required) | `text("title").notNull()` |
| `string body = ...;` (required, default empty) | `text("body").notNull().default("")` |
| `optional string description = ...;` | `text("description")` (nullable, no default) |
| `int32 quantity = ...;` | `integer("quantity").notNull()` |
| `bool archived = ...;` | `boolean("archived").notNull().default(false)` |
| `google.protobuf.Timestamp created_at = ...;` | `timestamp("created_at", { withTimezone: true }).notNull().defaultNow()` |
| `optional google.protobuf.Timestamp updated_at = ...;` | `timestamp("updated_at", { withTimezone: true })` |
| Foreign key to another resource | `text("author_id").references(() => authors.id)` |
| Enum (proto) | `pgEnum` declared above the table; column uses it |

## Pattern

```ts
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const <resources> = pgTable("<resources>", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});
```

Add an index inline if the resource needs one:

```ts
}, (table) => [
  uniqueIndex("<resources>_handle_idx").on(table.handle),
]);
```

## Enums

Proto enums don't have native Drizzle equivalents. Declare a `pgEnum` and
the adapter handles the proto-int ↔ string mapping:

```ts
import { pgEnum } from "drizzle-orm/pg-core";

export const <resource>StatusEnum = pgEnum("<resource>_status", [
  "DRAFT",
  "PUBLISHED",
  "ARCHIVED",
]);

export const <resources> = pgTable("<resources>", {
  // ...
  status: <resource>StatusEnum("status").notNull().default("DRAFT"),
});
```

A mature project on this stack usually grows a helper that derives the
Drizzle enum values from the proto enum at compile time, so the two lists
cannot drift. If the project has one, use it; if not, keep the lists in
sync by hand and add a comment pointing to the proto enum.

## Generate the migration

From the project root:

```bash
pnpm --filter <ORG_SCOPE>/backend db:generate
```

Drizzle-kit writes `drizzle/000N_<random_name>.sql`. Open it. It should
contain a single `CREATE TABLE "<resources>" ...` statement (plus index
and enum DDL if applicable). Commit it.

## Reviewing the generated SQL

The generator compares your edited `schema.ts` against the *current state*
of the dev DB. If your dev DB has drifted (you `db:push`ed an experimental
column, then deleted it from `schema.ts`), the migration will include
`DROP COLUMN` statements you didn't intend.

Two ways to handle drift:

1. **Reset the dev DB** if you don't need the data: delete `.dev-db/` and
   re-run `db:generate` against an empty DB.
2. **Hand-edit the migration SQL** to keep only the lines you want. The
   generator output is just a starting point — it's not sacred.

The user has explicit feedback on this: run `pnpm db:generate`, then
hand-edit the SQL file if needed.

If `db:generate` *hangs* without producing output, drizzle-kit is
sitting on a rename-vs-create prompt. See
`../../maybloom-stack-shared/references/gotchas.md` for the
precise workaround — it's not "always pipe newlines," only when the
generator actually hangs.
