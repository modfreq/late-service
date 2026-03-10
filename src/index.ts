import { resolve } from "node:path";
import { loadConfig } from "./config.js";
import { initDb, closeDb } from "./db/connection.js";
import { runMigrations } from "./db/migrate.js";
import { initNotion } from "./notion/client.js";
import { pollAllProjects } from "./notion/poller.js";
import { initLate } from "./late/client.js";
import { validatePost, schedulePost } from "./late/scheduler.js";
import { validateMediaUrls } from "./media/handler.js";
import {
  findPostByNotionId,
  insertPost,
  updatePost,
  insertActivity,
} from "./db/queries.js";
import {
  writeLatePostId,
  writeSyncError,
  updateStatus,
  clearSyncError,
} from "./notion/writer.js";
import { logger } from "./logger.js";
import type { NotionPost } from "./notion/types.js";
import type { ProjectConfig } from "./config.js";

async function processPost(post: NotionPost, project: ProjectConfig): Promise<void> {
  const existing = findPostByNotionId(post.pageId);
  if (existing) {
    logger.debug({ pageId: post.pageId }, "Post already tracked, skipping");
    return;
  }

  // Validate
  const violations = validatePost(post, project);
  if (violations.length > 0) {
    const errorMsg = violations.map((v) => v.message).join("; ");
    logger.warn({ postName: post.name, violations }, "Validation failed");
    await writeSyncError(post.pageId, errorMsg);
    insertPost({
      notion_page_id: post.pageId,
      project_id: project.id,
      status: "failed",
    });
    insertActivity({
      level: "warn",
      project_id: project.id,
      message: `Validation failed for "${post.name}": ${errorMsg}`,
    });
    return;
  }

  // Validate media URLs are accessible
  if (post.media.length > 0) {
    try {
      await validateMediaUrls(post.media);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ postName: post.name }, `Media validation failed: ${msg}`);
      await writeSyncError(post.pageId, msg);
      insertPost({
        notion_page_id: post.pageId,
        project_id: project.id,
        status: "failed",
      });
      return;
    }
  }

  // Schedule via Late API
  try {
    await updateStatus(post.pageId, "Publishing");
    await clearSyncError(post.pageId);

    const { latePostId } = await schedulePost(post, project);

    // Write Late Post ID back to Notion
    await writeLatePostId(post.pageId, latePostId);

    // Insert/update DB row
    insertPost({
      notion_page_id: post.pageId,
      project_id: project.id,
      late_post_id: latePostId,
      status: "scheduled",
      scheduled_for: post.scheduledDate ?? undefined,
    });

    insertActivity({
      level: "info",
      project_id: project.id,
      message: `Scheduled "${post.name}" (Late ID: ${latePostId})`,
    });

    logger.info({ postName: post.name, latePostId }, "Post scheduled successfully");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ postName: post.name, err }, "Failed to schedule post");
    await writeSyncError(post.pageId, msg);
    insertPost({
      notion_page_id: post.pageId,
      project_id: project.id,
      status: "failed",
      scheduled_for: post.scheduledDate ?? undefined,
    });
    insertActivity({
      level: "error",
      project_id: project.id,
      message: `Failed to schedule "${post.name}": ${msg}`,
    });
  }
}

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

  // Initial poll and schedule
  const results = await pollAllProjects(config.projects);
  for (const [projectId, posts] of results) {
    const project = config.projects.find((p) => p.id === projectId);
    if (!project) continue;

    logger.info(
      { projectId, posts: posts.map((p) => ({ name: p.name, status: p.status, type: p.postType })) },
      `Polled ${posts.length} scheduled post(s)`
    );

    for (const post of posts) {
      await processPost(post, project);
    }
  }

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
