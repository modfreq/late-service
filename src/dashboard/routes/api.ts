import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../../config.js";
import {
  getPostCountsByStatus,
  getPostCountsByProjectAndStatus,
  getPostsByProjectFiltered,
  getActivityFiltered,
  getRecentActivity,
  updatePost,
  findPostByNotionId,
  deletePost,
} from "../../db/queries.js";
import { clearSyncError, updateStatus } from "../../notion/writer.js";
import { activityRows } from "../views/home.js";

const startTime = Date.now();

export function registerApiRoutes(
  app: FastifyInstance,
  config: AppConfig
): void {
  // Health
  app.get("/api/health", async () => {
    return {
      status: "ok",
      uptime: Math.floor((Date.now() - startTime) / 1000),
      projects: config.projects.length,
      pollInterval: config.env.NOTION_POLL_INTERVAL_MINUTES,
    };
  });

  // Projects list with counts
  app.get("/api/projects", async () => {
    return config.projects.map((p) => ({
      id: p.id,
      name: p.name,
      enabled: p.enabled,
      counts: getPostCountsByProjectAndStatus(p.id),
    }));
  });

  // Posts for a project
  app.get<{
    Params: { id: string };
    Querystring: { status?: string };
  }>("/api/projects/:id/posts", async (req) => {
    const { id } = req.params;
    const status = req.query.status || undefined;
    return getPostsByProjectFiltered(id, status);
  });

  // Activity log
  app.get<{
    Querystring: { level?: string; project?: string; limit?: string; offset?: string };
  }>("/api/activity", async (req) => {
    const level = req.query.level || undefined;
    const project = req.query.project || undefined;
    const limit = Math.min(parseInt(req.query.limit || "50", 10) || 50, 200);
    const offset = parseInt(req.query.offset || "0", 10) || 0;
    return getActivityFiltered({ level, project, limit, offset });
  });

  // Activity rows partial (for htmx home page refresh)
  app.get("/api/activity-rows", async (_req, reply) => {
    const activity = getRecentActivity(20);
    reply.type("text/html");
    return `<table class="w-full"><tbody>${activityRows(activity)}</tbody></table>`;
  });

  // Retry a failed post
  app.post<{ Params: { id: string } }>("/api/posts/:id/retry", async (req, reply) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      reply.status(400);
      return { error: "Invalid post ID" };
    }

    try {
      updatePost(id, { status: "pending", last_error: null, retry_count: 0 });
      reply.type("text/html");
      return `<span class="px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">pending</span>`;
    } catch {
      reply.status(500);
      return { error: "Failed to retry post" };
    }
  });

  // Clear a failed post (delete record, reset Notion status to Scheduled)
  app.post<{ Params: { id: string } }>("/api/posts/:id/clear", async (req, reply) => {
    const notionPageId = req.params.id;
    const post = findPostByNotionId(notionPageId);
    if (!post) {
      reply.status(404);
      return { error: "Post not found" };
    }

    try {
      deletePost(notionPageId);
      await clearSyncError(notionPageId);
      await updateStatus(notionPageId, "Scheduled");
      reply.type("text/html");
      return `<tr class="border-t border-gray-100"><td colspan="7" class="px-4 py-2 text-sm text-gray-400 text-center">Cleared — will be reprocessed next poll</td></tr>`;
    } catch {
      reply.status(500);
      return { error: "Failed to clear post" };
    }
  });
}
