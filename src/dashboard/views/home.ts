import { layout, esc } from "./layout.js";
import type { ProjectConfig } from "../../config.js";

interface HomeData {
  projects: ProjectConfig[];
  uptime: number;
  dbPath: string;
  pollInterval: number;
  counts: Record<string, number>;
  activity: Array<{
    id: number;
    level: string;
    project_id: string | null;
    message: string;
    created_at: string;
  }>;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function statusCard(label: string, count: number, color: string): string {
  return `<div class="bg-white rounded-lg border border-gray-200 p-4">
    <div class="text-sm text-gray-500">${label}</div>
    <div class="text-2xl font-bold ${color}">${count}</div>
  </div>`;
}

function levelBadge(level: string): string {
  const colors: Record<string, string> = {
    info: "bg-blue-100 text-blue-800",
    warn: "bg-yellow-100 text-yellow-800",
    error: "bg-red-100 text-red-800",
  };
  return `<span class="px-2 py-0.5 rounded text-xs font-medium ${colors[level] || "bg-gray-100 text-gray-800"}">${level}</span>`;
}

export function activityRows(
  activity: HomeData["activity"]
): string {
  if (activity.length === 0) {
    return `<tr><td colspan="4" class="px-4 py-8 text-center text-gray-400">No activity yet</td></tr>`;
  }
  return activity
    .map(
      (a) => `<tr class="border-t border-gray-100">
        <td class="px-4 py-2 text-sm text-gray-500 whitespace-nowrap">${esc(a.created_at)}</td>
        <td class="px-4 py-2">${levelBadge(a.level)}</td>
        <td class="px-4 py-2 text-sm text-gray-500">${a.project_id ? esc(a.project_id) : "—"}</td>
        <td class="px-4 py-2 text-sm">${esc(a.message)}</td>
      </tr>`
    )
    .join("\n");
}

export function homePage(data: HomeData): string {
  const total = Object.values(data.counts).reduce((a, b) => a + b, 0);
  const get = (s: string) => data.counts[s] || 0;

  const body = `
    <h1 class="text-2xl font-bold mb-6">Dashboard</h1>

    <div class="bg-white rounded-lg border border-gray-200 p-4 mb-6">
      <h2 class="text-sm font-medium text-gray-500 mb-2">System Health</h2>
      <div class="grid grid-cols-3 gap-4 text-sm">
        <div><span class="text-gray-500">Uptime:</span> ${formatUptime(data.uptime)}</div>
        <div><span class="text-gray-500">DB:</span> ${esc(data.dbPath)}</div>
        <div><span class="text-gray-500">Poll interval:</span> ${data.pollInterval}m</div>
      </div>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mb-6">
      ${statusCard("Total", total, "text-gray-900")}
      ${statusCard("Pending", get("pending"), "text-yellow-600")}
      ${statusCard("Scheduled", get("scheduled"), "text-blue-600")}
      ${statusCard("Published", get("published"), "text-green-600")}
      ${statusCard("Failed", get("failed") + get("failed_retryable"), "text-red-600")}
    </div>

    <div class="bg-white rounded-lg border border-gray-200">
      <div class="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h2 class="text-sm font-medium text-gray-700">Recent Activity</h2>
        <span class="text-xs text-gray-400">Auto-refreshes every 30s</span>
      </div>
      <div id="activity-feed" hx-get="/api/activity-rows" hx-trigger="every 30s" hx-swap="innerHTML">
        <table class="w-full">
          <tbody>
            ${activityRows(data.activity)}
          </tbody>
        </table>
      </div>
    </div>
  `;

  return layout("Home", body, data.projects);
}
