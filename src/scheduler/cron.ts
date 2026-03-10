import cron from "node-cron";
import {
  runPollCycle,
  runStaleCheck,
  runRetryCycle,
} from "../sync/orchestrator.js";
import { cleanOldActivity } from "../db/queries.js";
import { logger } from "../logger.js";
import type { AppConfig } from "../config.js";

interface CronEntry {
  name: string;
  task: cron.ScheduledTask;
}

const tasks: CronEntry[] = [];

/** Wrap an async job so overlapping invocations are skipped */
function withNoOverlap(
  name: string,
  fn: () => Promise<void>
): () => void {
  let running = false;
  return () => {
    if (running) {
      logger.debug({ job: name }, "Skipping overlapping execution");
      return;
    }
    running = true;
    fn()
      .catch((err) =>
        logger.error({ job: name, err }, `Cron job "${name}" failed`)
      )
      .finally(() => {
        running = false;
      });
  };
}

export function startCrons(config: AppConfig): void {
  const pollMinutes = config.env.NOTION_POLL_INTERVAL_MINUTES;

  // Poll cycle — every N minutes
  tasks.push({
    name: "poll",
    task: cron.schedule(
      `*/${pollMinutes} * * * *`,
      withNoOverlap("poll", () => runPollCycle(config))
    ),
  });

  // Stale check — every 30 minutes
  tasks.push({
    name: "stale-check",
    task: cron.schedule(
      "*/30 * * * *",
      withNoOverlap("stale-check", () => runStaleCheck())
    ),
  });

  // Retry cycle — every 10 minutes
  tasks.push({
    name: "retry",
    task: cron.schedule(
      "*/10 * * * *",
      withNoOverlap("retry", () => runRetryCycle(config))
    ),
  });

  // Activity log cleanup — daily at 3 AM
  tasks.push({
    name: "cleanup",
    task: cron.schedule(
      "0 3 * * *",
      withNoOverlap("cleanup", async () => {
        cleanOldActivity(7);
        logger.info("Cleaned activity log entries older than 7 days");
      })
    ),
  });

  logger.info(`Started ${tasks.length} cron jobs`);
}

export function stopCrons(): void {
  for (const { name, task } of tasks) {
    task.stop();
    logger.debug({ job: name }, "Stopped cron job");
  }
  tasks.length = 0;
  logger.info("Stopped cron jobs");
}
