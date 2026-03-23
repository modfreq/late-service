import { getDb } from "./connection.js";

// --- sync_posts ---

export interface SyncPost {
  id: number;
  notion_page_id: string;
  project_id: string;
  late_post_id: string | null;
  status: string;
  scheduled_for: string | null;
  published_at: string | null;
  post_urls: string | null;
  last_error: string | null;
  retry_count: number;
  next_analytics_at: string | null;
  created_at: string;
  updated_at: string;
}

export function findPostByNotionId(notionPageId: string): SyncPost | undefined {
  return getDb()
    .prepare("SELECT * FROM sync_posts WHERE notion_page_id = ?")
    .get(notionPageId) as SyncPost | undefined;
}

export function insertPost(post: {
  notion_page_id: string;
  project_id: string;
  late_post_id?: string;
  status: string;
  scheduled_for?: string;
}): SyncPost {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO sync_posts (notion_page_id, project_id, late_post_id, status, scheduled_for)
    VALUES (@notion_page_id, @project_id, @late_post_id, @status, @scheduled_for)
  `);
  const info = stmt.run({
    notion_page_id: post.notion_page_id,
    project_id: post.project_id,
    late_post_id: post.late_post_id ?? null,
    status: post.status,
    scheduled_for: post.scheduled_for ?? null,
  });
  return db
    .prepare("SELECT * FROM sync_posts WHERE id = ?")
    .get(info.lastInsertRowid) as SyncPost;
}

export function updatePost(
  id: number,
  updates: Partial<
    Pick<
      SyncPost,
      | "late_post_id"
      | "status"
      | "published_at"
      | "post_urls"
      | "last_error"
      | "retry_count"
      | "next_analytics_at"
      | "scheduled_for"
    >
  >
): void {
  const setClauses: string[] = ["updated_at = datetime('now')"];
  const params: Record<string, unknown> = { id };

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      setClauses.push(`${key} = @${key}`);
      params[key] = value;
    }
  }

  getDb()
    .prepare(`UPDATE sync_posts SET ${setClauses.join(", ")} WHERE id = @id`)
    .run(params);
}

export function getPostsDueForAnalytics(): SyncPost[] {
  return getDb()
    .prepare(
      `SELECT * FROM sync_posts
       WHERE status = 'published'
         AND next_analytics_at IS NOT NULL
         AND next_analytics_at <= datetime('now')`
    )
    .all() as SyncPost[];
}

export function getPostsByProject(projectId: string): SyncPost[] {
  return getDb()
    .prepare("SELECT * FROM sync_posts WHERE project_id = ? ORDER BY created_at DESC")
    .all(projectId) as SyncPost[];
}

export function getScheduledPostsPastDue(): SyncPost[] {
  return getDb()
    .prepare(
      `SELECT * FROM sync_posts
       WHERE status = 'scheduled'
         AND scheduled_for IS NOT NULL
         AND scheduled_for <= datetime('now', '-15 minutes')`
    )
    .all() as SyncPost[];
}

export function getRetryablePosts(): SyncPost[] {
  return getDb()
    .prepare(
      "SELECT * FROM sync_posts WHERE status = 'failed_retryable' AND retry_count < 3"
    )
    .all() as SyncPost[];
}

// --- analytics_log ---

export function insertAnalyticsSnapshot(entry: {
  sync_post_id: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  reach: number;
  clicks: number;
}): void {
  getDb()
    .prepare(
      `INSERT INTO analytics_log (sync_post_id, impressions, likes, comments, shares, reach, clicks)
       VALUES (@sync_post_id, @impressions, @likes, @comments, @shares, @reach, @clicks)`
    )
    .run(entry);
}

// --- activity_log ---

export function insertActivity(entry: {
  level: "info" | "warn" | "error";
  project_id?: string;
  message: string;
  details?: string;
}): void {
  getDb()
    .prepare(
      `INSERT INTO activity_log (level, project_id, message, details)
       VALUES (@level, @project_id, @message, @details)`
    )
    .run({
      level: entry.level,
      project_id: entry.project_id ?? null,
      message: entry.message,
      details: entry.details ?? null,
    });
}

export function getRecentActivity(limit = 50): Array<{
  id: number;
  level: string;
  project_id: string | null;
  message: string;
  details: string | null;
  created_at: string;
}> {
  return getDb()
    .prepare(
      "SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?"
    )
    .all(limit) as any[];
}

export function cleanOldActivity(daysToKeep = 7): void {
  getDb()
    .prepare(
      `DELETE FROM activity_log WHERE created_at < datetime('now', '-' || ? || ' days')`
    )
    .run(daysToKeep);
}

// --- Dashboard queries ---

export function getPostCountsByStatus(): Record<string, number> {
  const rows = getDb()
    .prepare("SELECT status, COUNT(*) as count FROM sync_posts GROUP BY status")
    .all() as Array<{ status: string; count: number }>;
  const result: Record<string, number> = {};
  for (const row of rows) result[row.status] = row.count;
  return result;
}

export function getPostCountsByProjectAndStatus(
  projectId: string
): Record<string, number> {
  const rows = getDb()
    .prepare(
      "SELECT status, COUNT(*) as count FROM sync_posts WHERE project_id = ? GROUP BY status"
    )
    .all(projectId) as Array<{ status: string; count: number }>;
  const result: Record<string, number> = {};
  for (const row of rows) result[row.status] = row.count;
  return result;
}

export function getPostsByProjectFiltered(
  projectId: string,
  status?: string
): SyncPost[] {
  if (status) {
    return getDb()
      .prepare(
        "SELECT * FROM sync_posts WHERE project_id = ? AND status = ? ORDER BY created_at DESC"
      )
      .all(projectId, status) as SyncPost[];
  }
  return getPostsByProject(projectId);
}

export function getActivityFiltered(opts: {
  level?: string;
  project?: string;
  limit: number;
  offset: number;
}): Array<{
  id: number;
  level: string;
  project_id: string | null;
  message: string;
  details: string | null;
  created_at: string;
}> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts.level) {
    conditions.push("level = ?");
    params.push(opts.level);
  }
  if (opts.project) {
    conditions.push("project_id = ?");
    params.push(opts.project);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(opts.limit, opts.offset);

  return getDb()
    .prepare(
      `SELECT * FROM activity_log ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params) as any[];
}

export function deletePost(notionPageId: string): void {
  getDb()
    .prepare("DELETE FROM sync_posts WHERE notion_page_id = ?")
    .run(notionPageId);
}

export function getAllPosts(): SyncPost[] {
  return getDb()
    .prepare("SELECT * FROM sync_posts ORDER BY created_at DESC")
    .all() as SyncPost[];
}
