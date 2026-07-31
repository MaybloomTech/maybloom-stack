import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { initDb } from "db/config";

interface DatabaseTarget {
  driver: "pg" | "pglite";
  host?: string;
  port?: string;
  database?: string;
}

function getDatabaseTarget(url: string): DatabaseTarget | undefined {
  if (url.startsWith("pglite-memory://")) {
    return { driver: "pglite", database: ":memory:" };
  }
  if (url.startsWith("pglite://")) {
    return {
      driver: "pglite",
      database: url.replace(/^pglite:\/\//, "") || ":memory:",
    };
  }
  try {
    const parsed = new URL(url);
    return {
      driver: "pg",
      host: parsed.hostname || undefined,
      port: parsed.port || undefined,
      database: parsed.pathname.replace(/^\/+/, "") || undefined,
    };
  } catch {
    return undefined;
  }
}

async function dbPlugin(server: FastifyInstance): Promise<void> {
  const databaseTarget = getDatabaseTarget(server.config.DATABASE_URL);
  server.log.info({ databaseTarget }, "[database] Initializing");

  const handle = initDb(server.config.DATABASE_URL);
  server.decorate("db", handle.db);

  if (handle.isEmbedded) {
    await handle.migrate();
    server.log.info("[database] PGlite migrations applied");
  }

  try {
    await handle.db.execute(sql`select 1`);
    server.log.info({ databaseTarget }, "[database] Connection healthy");
  } catch (error) {
    server.log.error(
      { err: error, databaseTarget },
      "[database] Connection failed",
    );
  }
  server.log.info({ databaseTarget }, "[database] Initialized");

  server.addHook("preClose", async () => {
    try {
      server.log.info("[database] Closing connection...");
      await handle.close();
      server.log.info("[database] Connection closed");
    } catch (error) {
      server.log.error({ err: error }, "[database] Error closing connection");
    }
  });
}

export default fp(dbPlugin, {
  name: "dbPlugin",
});
