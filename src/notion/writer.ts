import { getNotion } from "./client.js";
import { PROP, type PostAnalytics, type PostStatus } from "./types.js";
import { logger } from "../logger.js";

// --- Update post status ---

export async function updateStatus(pageId: string, status: PostStatus): Promise<void> {
  await getNotion().pages.update({
    page_id: pageId,
    properties: {
      [PROP.STATUS]: { status: { name: status } },
    },
  });
  logger.debug({ pageId, status }, "Updated Notion status");
}

// --- Write Late Post ID after scheduling ---

export async function writeLatePostId(pageId: string, latePostId: string): Promise<void> {
  await getNotion().pages.update({
    page_id: pageId,
    properties: {
      [PROP.LATE_POST_ID]: {
        rich_text: [{ text: { content: latePostId } }],
      },
    },
  });
  logger.debug({ pageId, latePostId }, "Wrote Late Post ID to Notion");
}

// --- Write error to Sync Error field ---

export async function writeSyncError(pageId: string, error: string): Promise<void> {
  await getNotion().pages.update({
    page_id: pageId,
    properties: {
      [PROP.SYNC_ERROR]: {
        rich_text: [{ text: { content: error.slice(0, 2000) } }],
      },
      [PROP.STATUS]: { status: { name: "Failed" } },
    },
  });
  logger.debug({ pageId }, "Wrote sync error to Notion");
}

// --- Write post URLs after publishing ---

export async function writePostUrls(pageId: string, urls: string): Promise<void> {
  await getNotion().pages.update({
    page_id: pageId,
    properties: {
      [PROP.POST_URLS]: {
        rich_text: [{ text: { content: urls.slice(0, 2000) } }],
      },
    },
  });
}

// --- Write analytics + last synced timestamp ---

export async function writeAnalytics(
  pageId: string,
  analytics: PostAnalytics,
  postUrls?: string
): Promise<void> {
  await getNotion().pages.update({
    page_id: pageId,
    properties: {
      [PROP.IMPRESSIONS]: { number: analytics.impressions },
      [PROP.LIKES]: { number: analytics.likes },
      [PROP.COMMENTS]: { number: analytics.comments },
      [PROP.SHARES]: { number: analytics.shares },
      [PROP.REACH]: { number: analytics.reach },
      [PROP.CLICKS]: { number: analytics.clicks },
      [PROP.LAST_SYNCED]: { date: { start: new Date().toISOString() } },
      ...(postUrls
        ? { [PROP.POST_URLS]: { rich_text: [{ text: { content: postUrls.slice(0, 2000) } }] } }
        : {}),
    },
  });
  logger.debug({ pageId }, "Wrote analytics to Notion");
}

// --- Mark as published with URLs ---

export async function markPublished(pageId: string, postUrls: string): Promise<void> {
  await getNotion().pages.update({
    page_id: pageId,
    properties: {
      [PROP.STATUS]: { status: { name: "Published" } },
      [PROP.POST_URLS]: {
        rich_text: [{ text: { content: postUrls.slice(0, 2000) } }],
      },
    },
  });
  logger.debug({ pageId }, "Marked as published in Notion");
}

// --- Clear sync error (on successful retry) ---

export async function clearSyncError(pageId: string): Promise<void> {
  await getNotion().pages.update({
    page_id: pageId,
    properties: {
      [PROP.SYNC_ERROR]: {
        rich_text: [],
      },
    },
  });
}
