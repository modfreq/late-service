import { fetchPostAnalytics } from "../late/analytics.js";
import { writeAnalytics } from "../notion/writer.js";
import {
  getPostsDueForAnalytics,
  insertAnalyticsSnapshot,
  insertActivity,
  updatePost,
} from "../db/queries.js";
import { logger } from "../logger.js";
import type { SyncPost } from "../db/queries.js";

/** Compute the next analytics check time based on post age.
 *  - < 48h since publish → check again in 60 min
 *  - < 30 days since publish → check again in 24h
 *  - >= 30 days → stop (return null)
 */
function computeNextAnalyticsAt(publishedAt: string): string | null {
  const publishedMs = new Date(publishedAt).getTime();
  const ageMs = Date.now() - publishedMs;

  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;

  if (ageMs < 48 * HOUR) {
    return new Date(Date.now() + HOUR).toISOString();
  } else if (ageMs < 30 * DAY) {
    return new Date(Date.now() + DAY).toISOString();
  }
  return null; // stop checking
}

async function syncPostAnalytics(post: SyncPost): Promise<void> {
  if (!post.late_post_id) return;

  try {
    const result = await fetchPostAnalytics(post.late_post_id);

    // Write metrics to Notion
    await writeAnalytics(post.notion_page_id, result.metrics, result.postUrls || undefined);

    // Log snapshot to SQLite
    insertAnalyticsSnapshot({
      sync_post_id: post.id,
      ...result.metrics,
    });

    // Update post URLs if we got them
    const postUrlsUpdate = result.postUrls ? { post_urls: result.postUrls } : {};

    // Schedule next check
    const nextAt = post.published_at ? computeNextAnalyticsAt(post.published_at) : null;

    updatePost(post.id, {
      next_analytics_at: nextAt,
      ...postUrlsUpdate,
    });

    if (nextAt) {
      logger.debug(
        { latePostId: post.late_post_id, nextAt },
        "Analytics synced, next check scheduled"
      );
    } else {
      logger.info(
        { latePostId: post.late_post_id },
        "Analytics synced, post aged out — no more checks"
      );
      insertActivity({
        level: "info",
        project_id: post.project_id,
        message: `Analytics tracking ended for post (Late ID: ${post.late_post_id}) — 30 day window elapsed`,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(
      { latePostId: post.late_post_id, err },
      "Failed to sync analytics"
    );
    // Don't fail the whole cycle — push next check back 15 min so we retry soon
    updatePost(post.id, {
      next_analytics_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });
    insertActivity({
      level: "warn",
      project_id: post.project_id,
      message: `Analytics sync failed for Late ID ${post.late_post_id}: ${msg}`,
    });
  }
}

export async function runAnalyticsSyncCycle(): Promise<void> {
  const posts = getPostsDueForAnalytics();
  if (posts.length === 0) return;

  logger.info({ count: posts.length }, "Syncing analytics");

  for (const post of posts) {
    await syncPostAnalytics(post);
  }
}
