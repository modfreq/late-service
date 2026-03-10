import { pollAllProjects, fetchNotionPost } from "../notion/poller.js";
import { validatePost, schedulePost } from "../late/scheduler.js";
import { validateMediaUrls } from "../media/handler.js";
import { getPost } from "../late/client.js";
import {
  findPostByNotionId,
  insertPost,
  updatePost,
  insertActivity,
  getScheduledPostsPastDue,
  getRetryablePosts,
} from "../db/queries.js";
import {
  writeLatePostId,
  writeSyncError,
  updateStatus,
  clearSyncError,
  markPublished,
} from "../notion/writer.js";
import {
  resolveScheduleStatus,
  resolveStaleCheckStatus,
  resolveRetryStatus,
  isRetryableError,
} from "./state-machine.js";
import { logger } from "../logger.js";
import type { NotionPost } from "../notion/types.js";
import type { AppConfig, ProjectConfig } from "../config.js";

// --- Process a single post ---

export async function processPost(
  post: NotionPost,
  project: ProjectConfig
): Promise<void> {
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
    await writeLatePostId(post.pageId, latePostId);

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

    logger.info(
      { postName: post.name, latePostId },
      "Post scheduled successfully"
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = resolveScheduleStatus(err);
    logger.error({ postName: post.name, err }, "Failed to schedule post");
    await writeSyncError(post.pageId, msg);
    insertPost({
      notion_page_id: post.pageId,
      project_id: project.id,
      status,
      scheduled_for: post.scheduledDate ?? undefined,
    });
    insertActivity({
      level: "error",
      project_id: project.id,
      message: `Failed to schedule "${post.name}": ${msg}`,
    });
  }
}

// --- Poll cycle ---

export async function runPollCycle(config: AppConfig): Promise<void> {
  logger.info("Starting poll cycle");
  const results = await pollAllProjects(config.projects);

  for (const [projectId, posts] of results) {
    const project = config.projects.find((p) => p.id === projectId);
    if (!project) continue;

    if (posts.length > 0) {
      logger.info(
        { projectId, count: posts.length },
        `Processing ${posts.length} post(s)`
      );
    }

    for (const post of posts) {
      await processPost(post, project);
    }
  }

  logger.info("Poll cycle complete");
}

// --- Stale check ---

export async function runStaleCheck(): Promise<void> {
  const stalePosts = getScheduledPostsPastDue();
  if (stalePosts.length === 0) return;

  logger.info({ count: stalePosts.length }, "Checking stale posts");

  for (const post of stalePosts) {
    if (!post.late_post_id) continue;

    try {
      const latePost = await getPost(post.late_post_id);
      const outcome = resolveStaleCheckStatus(latePost.status);

      if (outcome === "published") {
        const postUrls = latePost.platforms
          .map((p) => p.postUrl)
          .filter(Boolean)
          .join("\n");

        updatePost(post.id, {
          status: "published",
          published_at:
            latePost.publishedAt ?? new Date().toISOString(),
          post_urls: postUrls || null,
          next_analytics_at: new Date(
            Date.now() + 24 * 60 * 60 * 1000
          ).toISOString(),
        });

        if (postUrls) {
          await markPublished(post.notion_page_id, postUrls);
        }

        insertActivity({
          level: "info",
          project_id: post.project_id,
          message: `Post confirmed published (Late ID: ${post.late_post_id})`,
        });
        logger.info(
          { latePostId: post.late_post_id },
          "Post confirmed published"
        );
      } else if (outcome === "failed") {
        updatePost(post.id, {
          status: "failed",
          last_error: "Late API reports post failed",
        });

        await writeSyncError(
          post.notion_page_id,
          "Post failed on Late platform"
        );
        insertActivity({
          level: "error",
          project_id: post.project_id,
          message: `Post failed on Late (Late ID: ${post.late_post_id})`,
        });
        logger.warn(
          { latePostId: post.late_post_id },
          "Post failed on Late"
        );
      }
      // "still_scheduled" — no action, check again next cycle
    } catch (err) {
      logger.error(
        { latePostId: post.late_post_id, err },
        "Failed to check stale post status"
      );
    }
  }
}

// --- Retry cycle ---

export async function runRetryCycle(config: AppConfig): Promise<void> {
  const retryable = getRetryablePosts();
  if (retryable.length === 0) return;

  logger.info({ count: retryable.length }, "Retrying failed posts");

  for (const post of retryable) {
    const retryStatus = resolveRetryStatus(post.retry_count);

    if (retryStatus === "exhausted") {
      updatePost(post.id, {
        status: "failed",
        last_error: "Max retries exhausted",
      });
      await writeSyncError(post.notion_page_id, "Max retries exhausted");
      insertActivity({
        level: "error",
        project_id: post.project_id,
        message: `Retries exhausted for post (Notion ID: ${post.notion_page_id})`,
      });
      continue;
    }

    const project = config.projects.find((p) => p.id === post.project_id);
    if (!project) {
      logger.warn(
        { projectId: post.project_id },
        "Project not found for retry"
      );
      continue;
    }

    try {
      // Re-fetch Notion page for fresh media URLs
      const freshPost = await fetchNotionPost(post.notion_page_id);
      if (!freshPost) {
        logger.warn(
          { pageId: post.notion_page_id },
          "Could not re-fetch Notion page"
        );
        updatePost(post.id, {
          retry_count: post.retry_count + 1,
          last_error: "Could not re-fetch Notion page",
        });
        continue;
      }

      // Re-validate media
      if (freshPost.media.length > 0) {
        await validateMediaUrls(freshPost.media);
      }

      // Re-attempt scheduling
      const { latePostId } = await schedulePost(freshPost, project);
      await writeLatePostId(post.notion_page_id, latePostId);
      await clearSyncError(post.notion_page_id);

      updatePost(post.id, {
        late_post_id: latePostId,
        status: "scheduled",
        retry_count: post.retry_count + 1,
        last_error: null,
        scheduled_for: freshPost.scheduledDate ?? undefined,
      });

      insertActivity({
        level: "info",
        project_id: post.project_id,
        message: `Retry ${post.retry_count + 1} succeeded (Late ID: ${latePostId})`,
      });

      logger.info(
        { latePostId, retry: post.retry_count + 1 },
        "Retry succeeded"
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const newStatus = isRetryableError(err) ? "failed_retryable" : "failed";

      updatePost(post.id, {
        status: newStatus,
        retry_count: post.retry_count + 1,
        last_error: msg,
      });

      logger.warn(
        { pageId: post.notion_page_id, retry: post.retry_count + 1, err },
        "Retry failed"
      );
    }
  }
}
