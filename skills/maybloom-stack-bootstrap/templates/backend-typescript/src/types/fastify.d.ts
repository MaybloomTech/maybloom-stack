import "fastify";
import type { Config } from "config";
import type { AppDb } from "db/config";

declare module "fastify" {
  interface FastifyInstance {
    config: Config;
    db: AppDb;
  }
  interface FastifyRequest {
    userId?: string;
  }
}
