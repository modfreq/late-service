import { layout, esc } from "./layout.js";
import type { ProjectConfig } from "../../config.js";

interface LogsPageData {
  projects: ProjectConfig[];
  activity: Array<{
    id: number;
    level: string;
    project_id: string | null;
    message: string;
    details: string | null;
    created_at: string;
  }>;
  currentLevel: string;
  currentProject: string;
  limit: number;
  offset: number;
}

function levelBadge(level: string): string {
  const colors: Record<string, string> = {
    info: "bg-blue-100 text-blue-800",
    warn: "bg-yellow-100 text-yellow-800",
    error: "bg-red-100 text-red-800",
  };
  return `<span class="px-2 py-0.5 rounded text-xs font-medium ${colors[level] || "bg-gray-100 text-gray-800"}">${level}</span>`;
}

function buildUrl(params: Record<string, string | number>): string {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== "" && v !== "all" && v !== 0)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  return `/logs${qs ? `?${qs}` : ""}`;
}

export function logsPage(data: LogsPageData): string {
  const { activity, currentLevel, currentProject, limit, offset, projects } = data;

  const levelOptions = ["all", "info", "warn", "error"]
    .map((l) => `<option value="${l}"${l === currentLevel ? " selected" : ""}>${l}</option>`)
    .join("\n");

  const projectOptions = [
    `<option value="all"${currentProject === "all" ? " selected" : ""}>All projects</option>`,
    ...projects.map(
      (p) => `<option value="${esc(p.id)}"${p.id === currentProject ? " selected" : ""}>${esc(p.name)}</option>`
    ),
  ].join("\n");

  const rows = activity.length === 0
    ? `<tr><td colspan="5" class="px-4 py-8 text-center text-gray-400">No logs found</td></tr>`
    : activity
        .map(
          (a) => `<tr class="border-t border-gray-100">
            <td class="px-4 py-2 text-sm text-gray-500 whitespace-nowrap">${esc(a.created_at)}</td>
            <td class="px-4 py-2">${levelBadge(a.level)}</td>
            <td class="px-4 py-2 text-sm text-gray-500">${a.project_id ? esc(a.project_id) : "—"}</td>
            <td class="px-4 py-2 text-sm">${esc(a.message)}</td>
            <td class="px-4 py-2 text-sm text-gray-400 max-w-[300px] truncate">${a.details ? esc(a.details) : ""}</td>
          </tr>`
        )
        .join("\n");

  const prevOffset = Math.max(0, offset - limit);
  const nextOffset = offset + limit;
  const hasPrev = offset > 0;
  const hasNext = activity.length === limit;

  const prevUrl = buildUrl({ level: currentLevel, project: currentProject, limit, offset: prevOffset });
  const nextUrl = buildUrl({ level: currentLevel, project: currentProject, limit, offset: nextOffset });

  const body = `
    <h1 class="text-2xl font-bold mb-6">Activity Logs</h1>

    <form method="get" action="/logs" class="flex gap-4 mb-4 items-end">
      <div>
        <label class="block text-xs text-gray-500 mb-1">Level</label>
        <select name="level" class="border border-gray-300 rounded px-2 py-1 text-sm" onchange="this.form.submit()">
          ${levelOptions}
        </select>
      </div>
      <div>
        <label class="block text-xs text-gray-500 mb-1">Project</label>
        <select name="project" class="border border-gray-300 rounded px-2 py-1 text-sm" onchange="this.form.submit()">
          ${projectOptions}
        </select>
      </div>
      <input type="hidden" name="limit" value="${limit}">
      <input type="hidden" name="offset" value="0">
    </form>

    <div id="logs-table" hx-get="/logs?level=${encodeURIComponent(currentLevel)}&project=${encodeURIComponent(currentProject)}&limit=${limit}&offset=${offset}&partial=1" hx-trigger="every 30s" hx-swap="outerHTML">
      <div class="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
              <th class="px-4 py-3">Time</th>
              <th class="px-4 py-3">Level</th>
              <th class="px-4 py-3">Project</th>
              <th class="px-4 py-3">Message</th>
              <th class="px-4 py-3">Details</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>

      <div class="flex justify-between items-center mt-4">
        ${hasPrev ? `<a href="${prevUrl}" class="text-sm text-blue-600 hover:underline">&larr; Prev</a>` : `<span></span>`}
        <span class="text-xs text-gray-400">Showing ${offset + 1}–${offset + activity.length}</span>
        ${hasNext ? `<a href="${nextUrl}" class="text-sm text-blue-600 hover:underline">Next &rarr;</a>` : `<span></span>`}
      </div>
    </div>
  `;

  return layout("Logs", body, projects);
}

export function logsPartial(data: LogsPageData): string {
  const { activity, currentLevel, currentProject, limit, offset } = data;

  const rows = activity.length === 0
    ? `<tr><td colspan="5" class="px-4 py-8 text-center text-gray-400">No logs found</td></tr>`
    : activity
        .map(
          (a) => `<tr class="border-t border-gray-100">
            <td class="px-4 py-2 text-sm text-gray-500 whitespace-nowrap">${esc(a.created_at)}</td>
            <td class="px-4 py-2">${levelBadge(a.level)}</td>
            <td class="px-4 py-2 text-sm text-gray-500">${a.project_id ? esc(a.project_id) : "—"}</td>
            <td class="px-4 py-2 text-sm">${esc(a.message)}</td>
            <td class="px-4 py-2 text-sm text-gray-400 max-w-[300px] truncate">${a.details ? esc(a.details) : ""}</td>
          </tr>`
        )
        .join("\n");

  const prevOffset = Math.max(0, offset - limit);
  const nextOffset = offset + limit;
  const hasPrev = offset > 0;
  const hasNext = activity.length === limit;

  const prevUrl = buildUrl({ level: currentLevel, project: currentProject, limit, offset: prevOffset });
  const nextUrl = buildUrl({ level: currentLevel, project: currentProject, limit, offset: nextOffset });

  return `<div id="logs-table" hx-get="/logs?level=${encodeURIComponent(currentLevel)}&project=${encodeURIComponent(currentProject)}&limit=${limit}&offset=${offset}&partial=1" hx-trigger="every 30s" hx-swap="outerHTML">
    <div class="bg-white rounded-lg border border-gray-200 overflow-x-auto">
      <table class="w-full">
        <thead>
          <tr class="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
            <th class="px-4 py-3">Time</th>
            <th class="px-4 py-3">Level</th>
            <th class="px-4 py-3">Project</th>
            <th class="px-4 py-3">Message</th>
            <th class="px-4 py-3">Details</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>

    <div class="flex justify-between items-center mt-4">
      ${hasPrev ? `<a href="${prevUrl}" class="text-sm text-blue-600 hover:underline">&larr; Prev</a>` : `<span></span>`}
      <span class="text-xs text-gray-400">Showing ${offset + 1}–${offset + activity.length}</span>
      ${hasNext ? `<a href="${nextUrl}" class="text-sm text-blue-600 hover:underline">Next &rarr;</a>` : `<span></span>`}
    </div>
  </div>`;
}
