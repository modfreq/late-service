import Fastify, { type FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { logger } from "../logger.js";
import { registerApiRoutes } from "./routes/api.js";
import { registerPageRoutes } from "./routes/pages.js";

export function createServer(config: AppConfig): FastifyInstance {
  const app = Fastify({ logger: false });

  // Allow HTMX POST requests with empty bodies
  app.addContentTypeParser("application/x-www-form-urlencoded", (_req, _payload, done) => {
    done(null, undefined);
  });

  registerApiRoutes(app, config);
  registerPageRoutes(app, config);

  return app;
}

export async function startServer(
  server: FastifyInstance,
  port: number
): Promise<void> {
  await server.listen({ port, host: "0.0.0.0" });
  logger.info(`Dashboard listening on :${port}`);
}
