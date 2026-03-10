import type { ProjectConfig } from "../../config.js";

export function layout(
  title: string,
  bodyHtml: string,
  projects: ProjectConfig[] = []
): string {
  const projectLinks = projects
    .map(
      (p) =>
        `<a href="/projects/${p.id}" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">${esc(p.name)}</a>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)} — late-service</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/htmx.org@2.0.4"></script>
</head>
<body class="bg-gray-50 min-h-screen">
  <nav class="bg-white border-b border-gray-200">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between h-14 items-center">
        <div class="flex items-center space-x-8">
          <a href="/" class="text-lg font-semibold text-gray-900">late-service</a>
          <a href="/" class="text-sm text-gray-600 hover:text-gray-900">Home</a>
          <div class="relative group">
            <button class="text-sm text-gray-600 hover:text-gray-900">Projects</button>
            <div class="hidden group-hover:block absolute left-0 mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-10">
              ${projectLinks || '<span class="block px-4 py-2 text-sm text-gray-400">No projects</span>'}
            </div>
          </div>
          <a href="/logs" class="text-sm text-gray-600 hover:text-gray-900">Logs</a>
        </div>
      </div>
    </div>
  </nav>
  <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    ${bodyHtml}
  </main>
</body>
</html>`;
}

export function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
