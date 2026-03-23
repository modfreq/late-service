import type { NotionPost, Platform } from "../notion/types.js";
import type { ProjectConfig } from "../config.js";
import {
  NOTION_TO_LATE_PLATFORM,
  NOTION_TO_CONFIG_KEY,
  PLATFORM_CHAR_LIMITS,
  TWITTER_URL_LENGTH,
  type LatePlatform,
  type LatePlatformEntry,
  type LateMediaItem,
  type LateThreadItem,
  type CreatePostRequest,
  type ValidationViolation,
} from "./types.js";
import { createPost } from "./client.js";
import { prepareMediaItems, isDocumentFile } from "../media/handler.js";
import { logger } from "../logger.js";

// --- Timezone handling ---

const TIMEZONE = "America/Los_Angeles";

/**
 * Convert a bare datetime (no timezone) from the configured timezone to UTC ISO string.
 * Notion returns datetimes like "2026-03-25T10:00:00.000" with no offset.
 * Late treats all times as UTC, so we need to convert: 10:00 AM PST → 18:00 UTC.
 */
function applyTimezone(dateStr: string): string {
  // Already has timezone info — pass through
  if (/[Zz]$/.test(dateStr) || /[+-]\d{2}:\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  // Date-only (no time component) — pass through
  if (!dateStr.includes("T")) {
    return dateStr;
  }

  // Get the UTC offset for TIMEZONE at this date by comparing formatted local vs UTC
  const asUtc = new Date(dateStr + "Z");
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const localStr = formatter.format(asUtc);
  // localStr is like "03/25/2026, 03:00:00" — the TIMEZONE representation of the UTC time
  // The difference tells us the offset

  // Parse the local representation back
  const m = localStr.match(/(\d{2})\/(\d{2})\/(\d{4}),\s*(\d{2}):(\d{2}):(\d{2})/);
  if (!m) {
    logger.warn({ dateStr, TIMEZONE }, "Could not resolve timezone offset, passing through");
    return dateStr;
  }

  const localDate = new Date(`${m[3]}-${m[1]}-${m[2]}T${m[4]}:${m[5]}:${m[6]}Z`);
  const offsetMs = localDate.getTime() - asUtc.getTime();

  // The user's input IS in the local timezone, so subtract the offset to get UTC
  const utcMs = new Date(dateStr + "Z").getTime() - offsetMs;
  return new Date(utcMs).toISOString();
}

// --- Twitter text length calculation ---

const URL_REGEX = /https?:\/\/\S+/g;

function twitterTextLength(text: string): number {
  // Replace each URL with a 23-char placeholder for t.co wrapping
  let length = 0;
  let lastIndex = 0;

  for (const match of text.matchAll(URL_REGEX)) {
    length += match.index! - lastIndex;
    length += TWITTER_URL_LENGTH;
    lastIndex = match.index! + match[0].length;
  }

  length += text.length - lastIndex;
  return length;
}

function textLength(text: string, platform: LatePlatform): number {
  if (platform === "twitter") return twitterTextLength(text);
  return text.length;
}

// --- Thread parsing ---

function parseThreadSegments(content: string): string[] {
  return content
    .split(/^---$/m)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Parse `[media:N]` references from a thread segment and return remaining text + indices */
function parseMediaRefs(segment: string): { text: string; mediaIndices: number[] } {
  const indices: number[] = [];
  const text = segment.replace(/\[media:(\d+)\]/g, (_, n) => {
    indices.push(parseInt(n, 10));
    return "";
  }).trim();
  return { text, mediaIndices: indices };
}

// --- Validation ---

export function validatePost(
  post: NotionPost,
  project: ProjectConfig
): ValidationViolation[] {
  const violations: ValidationViolation[] = [];

  // Must have at least one platform
  if (post.platforms.length === 0) {
    violations.push({ field: "platforms", message: "No platforms selected" });
  }

  // Each platform must be configured in the project
  for (const platform of post.platforms) {
    const configKey = NOTION_TO_CONFIG_KEY[platform];
    if (!project.platforms[configKey]) {
      violations.push({
        field: "platforms",
        message: `Platform "${platform}" is not configured in project "${project.id}"`,
        platform: NOTION_TO_LATE_PLATFORM[platform],
      });
    }
  }

  // Post type-specific validation
  switch (post.postType) {
    case "Thread": {
      const segments = parseThreadSegments(post.content);
      if (segments.length < 2) {
        violations.push({
          field: "content",
          message: "Thread requires at least 2 segments separated by ---",
        });
      }
      // Validate each segment against platform char limits
      for (const platform of post.platforms) {
        const latePlatform = NOTION_TO_LATE_PLATFORM[platform];
        const limit = PLATFORM_CHAR_LIMITS[latePlatform];
        for (let i = 0; i < segments.length; i++) {
          const { text } = parseMediaRefs(segments[i]);
          const len = textLength(text, latePlatform);
          if (len > limit) {
            violations.push({
              field: "content",
              message: `Thread segment ${i + 1} is ${len} chars (limit: ${limit} for ${platform})`,
              platform: latePlatform,
            });
          }
        }
      }
      break;
    }

    case "Story":
      if (post.media.length === 0) {
        violations.push({
          field: "media",
          message: "Story requires at least one media file",
        });
      }
      if (!post.platforms.includes("Instagram")) {
        violations.push({
          field: "platforms",
          message: "Story is only supported on Instagram",
        });
      }
      break;

    case "Reel":
      if (post.media.length === 0) {
        violations.push({
          field: "media",
          message: "Reel requires at least one video file",
        });
      }
      if (!post.platforms.includes("Instagram")) {
        violations.push({
          field: "platforms",
          message: "Reel is only supported on Instagram",
        });
      }
      break;

    case "Post":
      if (!post.content && post.media.length === 0) {
        violations.push({
          field: "content",
          message: "Post must have content or media",
        });
      }
      break;
  }

  // Character limit checks for non-thread types
  if (post.postType !== "Thread") {
    for (const platform of post.platforms) {
      const latePlatform = NOTION_TO_LATE_PLATFORM[platform];
      const limit = PLATFORM_CHAR_LIMITS[latePlatform];
      // Use platform-specific text if available, else default content
      const text = post.platformText[platform] ?? post.content;
      const len = textLength(text, latePlatform);
      if (len > limit) {
        violations.push({
          field: "content",
          message: `Content is ${len} chars (limit: ${limit} for ${platform})`,
          platform: latePlatform,
        });
      }
    }
  }

  return violations;
}

// --- Build request ---

export function buildCreatePostRequest(
  post: NotionPost,
  project: ProjectConfig
): CreatePostRequest {
  const mediaItems = prepareMediaItems(post.media);
  const isThread = post.postType === "Thread";
  const segments = isThread ? parseThreadSegments(post.content) : [];

  // Build platform entries
  const platforms: LatePlatformEntry[] = [];
  for (const platform of post.platforms) {
    const configKey = NOTION_TO_CONFIG_KEY[platform];
    const latePlatform = NOTION_TO_LATE_PLATFORM[platform];
    const platformConfig = project.platforms[configKey];
    if (!platformConfig) continue;

    const entry: LatePlatformEntry = {
      platform: latePlatform,
      accountId: platformConfig.accountId,
    };

    // Per-platform text override
    const overrideText = post.platformText[platform];
    if (overrideText) {
      entry.customContent = overrideText;
    }

    // Platform-specific data
    const specificData: Record<string, unknown> = {};

    // Story/Reel on Instagram
    if (platform === "Instagram") {
      if (post.postType === "Story") {
        specificData.contentType = "story";
      } else if (post.postType === "Reel") {
        specificData.contentType = "reels";
      }
    }

    // Pinterest board + link
    if (platform === "Pinterest") {
      if (post.pinterestBoard) specificData.boardId = post.pinterestBoard;
      if (post.pinterestLink) specificData.link = post.pinterestLink;
    }

    if (Object.keys(specificData).length > 0) {
      entry.platformSpecificData = specificData;
    }

    platforms.push(entry);
  }

  // Build request
  const req: CreatePostRequest = {
    content: post.content,
    platforms,
  };

  // Media
  if (mediaItems.length > 0) {
    // Auto-detect document: PDF/PPTX targeting LinkedIn
    const hasLinkedIn = post.platforms.includes("LinkedIn");
    if (hasLinkedIn) {
      for (const item of mediaItems) {
        const fileName = post.media.find((m) => m.url === item.url)?.name ?? "";
        if (isDocumentFile(fileName)) {
          item.type = "document";
          if (post.linkedinDocTitle) {
            item.documentTitle = post.linkedinDocTitle;
          }
        }
      }
    }
    req.mediaItems = mediaItems;
  }

  // Thread handling
  if (isThread && segments.length >= 2) {
    const threadItems: LateThreadItem[] = segments.map((segment) => {
      const { text, mediaIndices } = parseMediaRefs(segment);
      const item: LateThreadItem = { content: text };
      if (mediaIndices.length > 0 && mediaItems.length > 0) {
        item.mediaItems = mediaIndices
          .filter((i) => i < mediaItems.length)
          .map((i) => mediaItems[i]);
      }
      return item;
    });
    req.threadItems = threadItems;
  }

  // Scheduling
  if (post.scheduledDate) {
    req.scheduledFor = applyTimezone(post.scheduledDate);
  } else {
    req.publishNow = true;
  }

  return req;
}

// --- Schedule a post ---

export async function schedulePost(
  post: NotionPost,
  project: ProjectConfig
): Promise<{ latePostId: string; postUrl?: string }> {
  const req = buildCreatePostRequest(post, project);

  logger.info(
    { postName: post.name, platforms: req.platforms.map((p) => p.platform) },
    "Scheduling post in Late"
  );

  const res = await createPost(req);

  logger.info(
    { latePostId: res.id, status: res.status },
    `Post scheduled: ${post.name}`
  );

  return { latePostId: res.id, postUrl: res.postUrl };
}
