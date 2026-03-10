import { resolve } from "node:path";
import { loadConfig } from "./config.js";
import { initDb, closeDb } from "./db/connection.js";
import { runMigrations } from "./db/migrate.js";
import { logger } from "./logger.js";

async function main() {
  logger.info("Starting late-service...");

  // Load configuration
  const config = loadConfig();
  logger.info(
    { projects: config.projects.map((p) => p.id) },
    `Loaded ${config.projects.length} project(s)`
  );

  // Initialize database
  const dbPath = resolve(process.cwd(), config.env.DB_PATH);
  const db = initDb(dbPath);
  runMigrations(db);
  logger.info({ dbPath }, "Database initialized");

  // Graceful shutdown
  const shutdown = () => {
    logger.info("Shutting down...");
    closeDb();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  logger.info("late-service ready");
}

main().catch((err) => {
  logger.fatal(err, "Failed to start late-service");
  process.exit(1);
});
