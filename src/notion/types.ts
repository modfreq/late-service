// --- Notion property name constants ---

/** Properties the user manages in each project's content calendar DB */
export const PROP = {
  // User-managed
  NAME: "Name",
  STATUS: "Status",
  POST_TYPE: "Post Type",
  SCHEDULED_DATE: "Scheduled Date",
  CONTENT: "Content",
  PLATFORMS: "Platforms",
  MEDIA: "Media",

  // Per-platform text overrides
  LINKEDIN_TEXT: "LinkedIn Text",
  X_TEXT: "X Text",
  PINTEREST_TEXT: "Pinterest Text",
  BLUESKY_TEXT: "Bluesky Text",
  INSTAGRAM_TEXT: "Instagram Text",

  // Platform-specific extras
  PINTEREST_LINK: "Pinterest Link",
  PINTEREST_BOARD: "Pinterest Board",
  LINKEDIN_DOC_TITLE: "LinkedIn Doc Title",

  // System-managed (written by this service)
  LATE_POST_ID: "Late Post ID",
  POST_URLS: "Post URLs",
  IMPRESSIONS: "Impressions",
  LIKES: "Likes",
  COMMENTS: "Comments",
  SHARES: "Shares",
  REACH: "Reach",
  CLICKS: "Clicks",
  LAST_SYNCED: "Last Synced",
  SYNC_ERROR: "Sync Error",
} as const;

// --- Enums ---

export type PostStatus = "Draft" | "Scheduled" | "Publishing" | "Published" | "Failed";

export type PostType = "Post" | "Thread" | "Story" | "Reel";

export type Platform = "LinkedIn" | "X" | "Pinterest" | "Bluesky" | "Instagram";

// --- Media file from Notion ---

export interface NotionMediaFile {
  name: string;
  url: string;
  type: "file" | "external";
}

// --- Parsed Notion post ---

export interface NotionPost {
  pageId: string;
  name: string;
  status: PostStatus;
  postType: PostType;
  scheduledDate: string | null;
  content: string;
  platforms: Platform[];
  media: NotionMediaFile[];

  // Per-platform text overrides (only present if the property has content)
  platformText: Partial<Record<Platform, string>>;

  // Platform-specific extras
  pinterestLink: string | null;
  pinterestBoard: string | null;
  linkedinDocTitle: string | null;
}

// --- Analytics data for writing back ---

export interface PostAnalytics {
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  reach: number;
  clicks: number;
}
