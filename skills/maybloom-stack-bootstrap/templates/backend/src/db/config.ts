import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "db/schema";

/**
 * Drizzle query-builder type exposed to the rest of the backend.
 *
 * The prod driver (`node-postgres`) is the canonical shape. The dev driver
 * (PGlite) returns a structurally identical query builder that diverges only
 * on internal generics. The single cast in {@link initDb} reconciles the two
 * so every consumer can treat `server.db` uniformly.
 */
export type AppDb = ReturnType<typeof drizzlePg<typeof schema>>;

export interface DbHandle {
  readonly db: AppDb;
  readonly isEmbedded: boolean;
  migrate(): Promise<void>;
  close(): Promise<void>;
}

function migrationsFolder(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // src/db/config.ts → ../../drizzle; dist/main.js → ../drizzle
  return resolve(here, here.endsWith("dist") ? "../drizzle" : "../../drizzle");
}

function parsePgliteDataDir(url: string): string | undefined {
  if (url.startsWith("pglite-memory://") || url === "pglite://:memory:") {
    return undefined;
  }
  const stripped = url.replace(/^pglite:\/\//, "");
  return !stripped || stripped === ":memory:" ? undefined : stripped;
}

function initPgliteHandle(url: string): DbHandle {
  const dataDir = parsePgliteDataDir(url);
  if (dataDir) {
    mkdirSync(dataDir, { recursive: true });
  }
  const pglite = dataDir ? new PGlite(dataDir) : new PGlite();
  const pgliteDb = drizzlePglite(pglite, { schema });
  const db = pgliteDb as unknown as AppDb;
  return {
    db,
    isEmbedded: true,
    migrate: () =>
      migratePglite(pgliteDb, { migrationsFolder: migrationsFolder() }),
    close: () => pglite.close(),
  };
}

function initPgHandle(url: string): DbHandle {
  const pool = new Pool({ connectionString: url });
  const db = drizzlePg(pool, { schema });
  return {
    db,
    isEmbedded: false,
    migrate: () => migratePg(db, { migrationsFolder: migrationsFolder() }),
    close: () => pool.end(),
  };
}

export function initDb(url: string): DbHandle {
  if (url.startsWith("pglite://") || url.startsWith("pglite-memory://")) {
    return initPgliteHandle(url);
  }
  return initPgHandle(url);
}
