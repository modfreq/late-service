import type {
  PageObjectResponse,
  RichTextItemResponse,
} from "@notionhq/client/build/src/api-endpoints.js";
import { getNotion } from "./client.js";
import {
  PROP,
  type NotionPost,
  type NotionMediaFile,
  type Platform,
  type PostStatus,
  type PostType,
} from "./types.js";
import { logger } from "../logger.js";
import type { ProjectConfig } from "../config.js";

// --- Property extraction helpers ---

type Properties = PageObjectResponse["properties"];
type PropertyValue = Properties[string];

function getRichText(prop: PropertyValue | undefined): string {
  if (!prop || prop.type !== "rich_text") return "";
  return prop.rich_text.map((t: RichTextItemResponse) => t.plain_text).join("");
}

function getTitle(prop: PropertyValue | undefined): string {
  if (!prop || prop.type !== "title") return "";
  return prop.title.map((t: RichTextItemResponse) => t.plain_text).join("");
}

function getSelect(prop: PropertyValue | undefined): string | null {
  if (!prop) return null;
  if (prop.type === "select" && prop.select) return prop.select.name;
  if (prop.type === "status" && prop.status) return prop.status.name;
  return null;
}

function getMultiSelect(prop: PropertyValue | undefined): string[] {
  if (!prop || prop.type !== "multi_select") return [];
  return prop.multi_select.map((s) => s.name);
}

function getDate(prop: PropertyValue | undefined): string | null {
  if (!prop || prop.type !== "date" || !prop.date) return null;
  return prop.date.start;
}

function getUrl(prop: PropertyValue | undefined): string | null {
  if (!prop || prop.type !== "url") return null;
  return prop.url;
}

function getFiles(prop: PropertyValue | undefined): NotionMediaFile[] {
  if (!prop || prop.type !== "files") return [];
  return prop.files.map((f) => {
    if (f.type === "file") {
      return { name: f.name, url: f.file.url, type: "file" as const };
    }
    return { name: f.name, url: f.external.url, type: "external" as const };
  });
}

// --- Map of platform name → text override property ---

const PLATFORM_TEXT_PROP: Record<Platform, string> = {
  LinkedIn: PROP.LINKEDIN_TEXT,
  X: PROP.X_TEXT,
  Pinterest: PROP.PINTEREST_TEXT,
  Bluesky: PROP.BLUESKY_TEXT,
  Instagram: PROP.INSTAGRAM_TEXT,
};

// --- Parse a Notion page into a NotionPost ---

function parsePage(page: PageObjectResponse): NotionPost {
  const props = page.properties;

  const platforms = getMultiSelect(props[PROP.PLATFORMS]) as Platform[];

  const platformText: Partial<Record<Platform, string>> = {};
  for (const platform of platforms) {
    const propName = PLATFORM_TEXT_PROP[platform];
    if (propName) {
      const text = getRichText(props[propName]);
      if (text) {
        platformText[platform] = text;
      }
    }
  }

  return {
    pageId: page.id,
    name: getTitle(props[PROP.NAME]),
    status: (getSelect(props[PROP.STATUS]) ?? "Draft") as PostStatus,
    postType: (getSelect(props[PROP.POST_TYPE]) ?? "Post") as PostType,
    scheduledDate: getDate(props[PROP.SCHEDULED_DATE]),
    content: getRichText(props[PROP.CONTENT]),
    platforms,
    media: getFiles(props[PROP.MEDIA]),
    platformText,
    pinterestLink: getUrl(props[PROP.PINTEREST_LINK]),
    pinterestBoard: getSelect(props[PROP.PINTEREST_BOARD]),
    linkedinDocTitle: getRichText(props[PROP.LINKEDIN_DOC_TITLE]) || null,
  };
}

// --- Query database ---
// SDK v5 removed databases.query in favor of dataSources.query, but the
// /data_sources endpoint doesn't find databases in all workspaces.
// Use request() to hit /databases/{id}/query directly (works with pinned
// Notion-Version: 2022-06-28 in client.ts).

interface DatabaseQueryParams {
  filter?: unknown;
  sorts?: unknown;
  start_cursor?: string;
  page_size?: number;
}

interface DatabaseQueryResponse {
  results: PageObjectResponse[];
  has_more: boolean;
  next_cursor: string | null;
}

async function queryDatabase(
  notion: ReturnType<typeof getNotion>,
  databaseId: string,
  params: DatabaseQueryParams
): Promise<DatabaseQueryResponse> {
  return notion.request<DatabaseQueryResponse>({
    path: `databases/${databaseId}/query`,
    method: "post",
    body: params as Record<string, unknown>,
  });
}

// --- Poll a single project's Notion database ---

export async function pollProject(project: ProjectConfig): Promise<NotionPost[]> {
  const notion = getNotion();
  const posts: NotionPost[] = [];
  let cursor: string | undefined;

  do {
    const response = await queryDatabase(notion, project.notion.databaseId, {
      filter: {
        and: [
          {
            property: PROP.STATUS,
            status: { equals: "Scheduled" },
          },
          {
            property: PROP.LATE_POST_ID,
            rich_text: { is_empty: true },
          },
        ],
      },
      start_cursor: cursor,
      page_size: 100,
    });

    for (const page of response.results) {
      if ("properties" in page) {
        posts.push(parsePage(page));
      }
    }

    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return posts;
}

// --- Poll all enabled projects ---

export async function pollAllProjects(
  projects: ProjectConfig[]
): Promise<Map<string, NotionPost[]>> {
  const results = new Map<string, NotionPost[]>();

  for (const project of projects) {
    if (!project.enabled) continue;

    try {
      const posts = await pollProject(project);
      results.set(project.id, posts);

      if (posts.length > 0) {
        logger.info(
          { projectId: project.id, count: posts.length },
          `Found ${posts.length} scheduled post(s)`
        );
      }
    } catch (err) {
      logger.error(
        { projectId: project.id, err },
        `Failed to poll Notion database for project "${project.name}"`
      );
    }
  }

  return results;
}
