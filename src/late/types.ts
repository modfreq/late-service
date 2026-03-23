import type { Platform } from "../notion/types.js";

// --- Late platform type ---

export type LatePlatform = "twitter" | "linkedin" | "instagram" | "pinterest" | "bluesky";

// --- Platform name mappings ---

/** Notion Title Case → Late API lowercase */
export const NOTION_TO_LATE_PLATFORM: Record<Platform, LatePlatform> = {
  X: "twitter",
  LinkedIn: "linkedin",
  Instagram: "instagram",
  Pinterest: "pinterest",
  Bluesky: "bluesky",
};

/** Late API lowercase → Notion Title Case */
export const LATE_TO_NOTION_PLATFORM: Record<LatePlatform, Platform> = {
  twitter: "X",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  pinterest: "Pinterest",
  bluesky: "Bluesky",
};

/** Config key lowercase → Late API lowercase */
export const CONFIG_TO_LATE_PLATFORM: Record<string, LatePlatform> = {
  x: "twitter",
  linkedin: "linkedin",
  instagram: "instagram",
  pinterest: "pinterest",
  bluesky: "bluesky",
};

/** Notion Title Case → config key lowercase */
export const NOTION_TO_CONFIG_KEY: Record<Platform, string> = {
  X: "x",
  LinkedIn: "linkedin",
  Instagram: "instagram",
  Pinterest: "pinterest",
  Bluesky: "bluesky",
};

// --- Character limits per platform ---

export const PLATFORM_CHAR_LIMITS: Record<LatePlatform, number> = {
  twitter: 280,
  bluesky: 300,
  linkedin: 3000,
  instagram: 2200,
  pinterest: 500,
};

/** Twitter wraps all URLs to 23 chars via t.co */
export const TWITTER_URL_LENGTH = 23;

// --- Late API interfaces ---

export interface LateMediaItem {
  url: string;
  type: "image" | "video" | "document";
  altText?: string;
  documentTitle?: string;
}

export interface LateThreadItem {
  content: string;
  mediaItems?: LateMediaItem[];
}

export interface LatePlatformEntry {
  platform: LatePlatform;
  accountId: string;
  customContent?: string;
  platformSpecificData?: Record<string, unknown>;
}

export interface CreatePostRequest {
  content: string;
  platforms: LatePlatformEntry[];
  mediaItems?: LateMediaItem[];
  threadItems?: LateThreadItem[];
  scheduledFor?: string;
  timezone?: string;
  publishNow?: boolean;
}

export interface CreatePostResponse {
  id: string;
  status: string;
  postUrl?: string;
  platformPostIds?: Record<string, string>;
}

export interface GetPostResponse {
  id: string;
  status: string;
  content: string;
  platforms: Array<{
    platform: LatePlatform;
    postId?: string;
    postUrl?: string;
    status: string;
  }>;
  scheduledFor?: string;
  publishedAt?: string;
}

export interface PostAnalyticsResponse {
  postId: string;
  platforms: Array<{
    platform: LatePlatform;
    postUrl?: string;
    metrics: {
      impressions?: number;
      likes?: number;
      comments?: number;
      shares?: number;
      reach?: number;
      clicks?: number;
    };
  }>;
}

export interface ValidationViolation {
  field: string;
  message: string;
  platform?: LatePlatform;
}
