import type { NotionMediaFile } from "../notion/types.js";
import type { LateMediaItem } from "../late/types.js";
import { logger } from "../logger.js";

// --- Extension sets ---

const VIDEO_EXTENSIONS = new Set([
  ".mp4", ".mov", ".avi", ".webm", ".mkv", ".m4v",
]);

const DOCUMENT_EXTENSIONS = new Set([
  ".pdf", ".pptx", ".ppt", ".doc", ".docx",
]);

// --- Helpers ---

function getExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

export function isVideoFile(name: string): boolean {
  return VIDEO_EXTENSIONS.has(getExtension(name));
}

export function isDocumentFile(name: string): boolean {
  return DOCUMENT_EXTENSIONS.has(getExtension(name));
}

export function inferMediaType(name: string): LateMediaItem["type"] {
  if (isVideoFile(name)) return "video";
  if (isDocumentFile(name)) return "document";
  return "image";
}

// --- Prepare media items for Late API ---

export function prepareMediaItems(files: NotionMediaFile[]): LateMediaItem[] {
  return files.map((f) => ({
    url: f.url,
    type: inferMediaType(f.name),
  }));
}

// --- Validate that media URLs are still accessible ---

export async function validateMediaUrls(files: NotionMediaFile[]): Promise<void> {
  const results = await Promise.allSettled(
    files.map(async (f) => {
      const res = await fetch(f.url, { method: "HEAD" });
      if (!res.ok) {
        throw new Error(`Media "${f.name}" URL returned ${res.status}`);
      }
    })
  );

  const failures = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => (r.reason as Error).message);

  if (failures.length > 0) {
    logger.warn({ failures }, "Some media URLs are inaccessible");
    throw new Error(`Inaccessible media: ${failures.join("; ")}`);
  }
}
