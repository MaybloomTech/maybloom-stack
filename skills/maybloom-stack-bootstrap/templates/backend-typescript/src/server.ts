import fastifyEnv from "@fastify/env";
import fastifyCors from "@fastify/cors";
import { fastify } from "fastify";
import { Environment, configSchema } from "config";
import dbPlugin from "db/plugin";

export const server = fastify({
  logger: true,
});

let isInitialized = false;

type BootstrapCallback = (app: typeof server) => Promise<void> | void;

export async function bootstrapServer(callback: BootstrapCallback) {
  if (isInitialized) {
    return server;
  }

  await server.register(fastifyEnv, { schema: configSchema, dotenv: true });
  server.log.level = server.config.LOG_LEVEL;
  // The authenticator rule, checked before the database opens: production
  // never takes DEV_USER, and until a real identity is wired (kUserId in
  // main.ts's contextValues) nothing else can say who the caller is.
  if (server.config.ENVIRONMENT === Environment.PRODUCTION && server.config.DEV_USER) {
    throw new Error("DEV_USER is not allowed in production");
  }
  if (!server.config.DEV_USER) {
    throw new Error(
      "no authenticator: set DEV_USER in development, or set kUserId from a real credential in main.ts (contextValues) and change this rule",
    );
  }
  server.log.warn({ user: server.config.DEV_USER }, "DEV_USER is set: every request is this user");
  await server.register(fastifyCors, {
    origin: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  });
  await server.register(dbPlugin);

  server.get("/healthz", async () => ({ status: "ok" }));

  registerShutdownSignals();

  await callback(server);

  isInitialized = true;

  await server.listen({
    host: server.config.HOST,
    port: server.config.PORT,
  });

  return server;
}

function registerShutdownSignals() {
  const handleShutdown = async (signal: string) => {
    server.log.info({ signal }, "received shutdown signal");
    try {
      await server.close();
      process.exit(0);
    } catch (error) {
      server.log.error({ err: error }, "shutdown failed");
      process.exit(1);
    }
  };

  process.once("SIGTERM", () => void handleShutdown("SIGTERM"));
  process.once("SIGINT", () => void handleShutdown("SIGINT"));
}
