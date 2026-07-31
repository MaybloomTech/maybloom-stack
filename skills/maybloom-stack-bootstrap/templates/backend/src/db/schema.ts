import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Drizzle table definitions. One pgTable() per persisted resource. Drizzle-kit
// reads this file to generate migrations into the drizzle/ folder via
// `pnpm db:generate`.
export const notes = pgTable("notes", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});
