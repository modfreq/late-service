import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../../config.js";
import {
  getPostCountsByStatus,
  getPostCountsByProjectAndStatus,
  getPostsByProjectFiltered,
  getRecentActivity,
  getActivityFiltered,
} from "../../db/queries.js";
import { homePage } from "../views/home.js";
import { projectPage } from "../views/project.js";
import { logsPage, logsPartial } from "../views/logs.js";

const startTime = Date.now();

export function registerPageRoutes(
  app: FastifyInstance,
  config: AppConfig
): void {
  // Home page
  app.get("/", async (_req, reply) => {
    const counts = getPostCountsByStatus();
    const activity = getRecentActivity(20);
    const uptime = Math.floor((Date.now() - startTime) / 1000);

    reply.type("text/html");
    return homePage({
      projects: config.projects,
      uptime,
      dbPath: config.env.DB_PATH,
      pollInterval: config.env.NOTION_POLL_INTERVAL_MINUTES,
      counts,
      activity,
    });
  });

  // Project detail page
  app.get<{
    Params: { id: string };
    Querystring: { status?: string };
  }>("/projects/:id", async (req, reply) => {
    const { id } = req.params;
    const project = config.projects.find((p) => p.id === id);
    if (!project) {
      reply.status(404).type("text/html");
      return "<h1>Project not found</h1>";
    }

    const currentStatus = req.query.status || "all";
    const statusFilter = currentStatus === "all" ? undefined : currentStatus;
    const posts = getPostsByProjectFiltered(id, statusFilter);
    const counts = getPostCountsByProjectAndStatus(id);

    reply.type("text/html");
    return projectPage({
      project,
      projects: config.projects,
      posts,
      counts,
      currentStatus,
    });
  });

  // Logs page
  app.get<{
    Querystring: { level?: string; project?: string; limit?: string; offset?: string; partial?: string };
  }>("/logs", async (req, reply) => {
    const currentLevel = req.query.level || "all";
    const currentProject = req.query.project || "all";
    const limit = Math.min(parseInt(req.query.limit || "50", 10) || 50, 200);
    const offset = parseInt(req.query.offset || "0", 10) || 0;

    const levelFilter = currentLevel === "all" ? undefined : currentLevel;
    const projectFilter = currentProject === "all" ? undefined : currentProject;

    const activity = getActivityFiltered({
      level: levelFilter,
      project: projectFilter,
      limit,
      offset,
    });

    const data = {
      projects: config.projects,
      activity,
      currentLevel,
      currentProject,
      limit,
      offset,
    };

    reply.type("text/html");
    if (req.query.partial === "1") {
      return logsPartial(data);
    }
    return logsPage(data);
  });
}
