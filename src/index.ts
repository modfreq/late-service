import { resolve } from "node:path";
import { loadConfig } from "./config.js";
import { initDb, closeDb } from "./db/connection.js";
import { runMigrations } from "./db/migrate.js";
import { initNotion } from "./notion/client.js";
import { initLate } from "./late/client.js";
import { runPollCycle } from "./sync/orchestrator.js";
import { startCrons, stopCrons } from "./scheduler/cron.js";
import { createServer, startServer } from "./dashboard/server.js";
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

  // Initialize Notion client
  initNotion(config.env.NOTION_TOKEN);
  logger.info("Notion client initialized");

  // Initialize Late client
  initLate(config.env.LATE_API_KEY);

  // Initial poll cycle
  try {
    await runPollCycle(config);
  } catch (err) {
    logger.error(err, "Initial poll cycle failed");
  }

  // Start cron jobs
  startCrons(config);

  // Start dashboard
  const server = createServer(config);
  await startServer(server, config.env.DASHBOARD_PORT);

  // Graceful shutdown
  const shutdown = () => {
    logger.info("Shutting down...");
    stopCrons();
    server.close();
    closeDb();
    logger.info("Shutdown complete");
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
