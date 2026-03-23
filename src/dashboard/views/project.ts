import { layout, esc } from "./layout.js";
import type { ProjectConfig } from "../../config.js";
import type { SyncPost } from "../../db/queries.js";

interface ProjectPageData {
  project: ProjectConfig;
  projects: ProjectConfig[];
  posts: SyncPost[];
  counts: Record<string, number>;
  currentStatus: string;
}

const STATUSES = ["all", "pending", "scheduled", "published", "failed", "failed_retryable"];

function statusBadge(status: string): string {
  const colors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    scheduled: "bg-blue-100 text-blue-800",
    published: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
    failed_retryable: "bg-orange-100 text-orange-800",
  };
  return `<span class="px-2 py-0.5 rounded text-xs font-medium ${colors[status] || "bg-gray-100 text-gray-800"}">${esc(status)}</span>`;
}

export function projectPage(data: ProjectPageData): string {
  const { project, posts, counts, currentStatus } = data;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const tabs = STATUSES.map((s) => {
    const count = s === "all" ? total : (counts[s] || 0);
    const active = s === currentStatus;
    const href = s === "all" ? `/projects/${project.id}` : `/projects/${project.id}?status=${s}`;
    const cls = active
      ? "bg-gray-900 text-white"
      : "bg-white text-gray-600 hover:bg-gray-100";
    return `<a href="${href}" class="px-3 py-1.5 rounded text-sm font-medium ${cls}">${s === "all" ? "All" : s} (${count})</a>`;
  }).join("\n");

  const rows = posts.length === 0
    ? `<tr><td colspan="7" class="px-4 py-8 text-center text-gray-400">No posts</td></tr>`
    : posts.map((p) => `<tr class="border-t border-gray-100">
        <td class="px-4 py-2 text-sm font-mono text-gray-600 max-w-[200px] truncate">${esc(p.notion_page_id)}</td>
        <td class="px-4 py-2">${statusBadge(p.status)}</td>
        <td class="px-4 py-2 text-sm text-gray-500">${p.scheduled_for ? esc(p.scheduled_for) : "—"}</td>
        <td class="px-4 py-2 text-sm text-gray-500">${p.published_at ? esc(p.published_at) : "—"}</td>
        <td class="px-4 py-2 text-sm font-mono text-gray-500">${p.late_post_id ? esc(p.late_post_id) : "—"}</td>
        <td class="px-4 py-2 text-sm text-red-600 max-w-[200px] truncate">${p.last_error ? esc(p.last_error) : ""}</td>
        <td class="px-4 py-2">
          ${p.status === "failed" || p.status === "failed_retryable"
            ? `<button
                hx-post="/api/posts/${p.id}/retry"
                hx-swap="outerHTML"
                class="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">Retry</button>
              <button
                hx-post="/api/posts/${p.notion_page_id}/clear"
                hx-target="closest tr"
                hx-swap="outerHTML"
                class="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 ml-1">Clear</button>`
            : ""}
        </td>
      </tr>`).join("\n");

  const platforms = Object.keys(project.platforms).join(", ");

  const body = `
    <div class="mb-6">
      <h1 class="text-2xl font-bold">${esc(project.name)}</h1>
      <p class="text-sm text-gray-500">ID: ${esc(project.id)} &middot; Platforms: ${esc(platforms)}</p>
    </div>

    <div class="flex gap-2 mb-4 flex-wrap">
      ${tabs}
    </div>

    <div class="bg-white rounded-lg border border-gray-200 overflow-x-auto">
      <table class="w-full">
        <thead>
          <tr class="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
            <th class="px-4 py-3">Notion Page</th>
            <th class="px-4 py-3">Status</th>
            <th class="px-4 py-3">Scheduled</th>
            <th class="px-4 py-3">Published</th>
            <th class="px-4 py-3">Late Post ID</th>
            <th class="px-4 py-3">Error</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;

  return layout(project.name, body, data.projects);
}
