import { getPostAnalytics } from "./client.js";
import { LATE_TO_NOTION_PLATFORM } from "./types.js";
import type { PostAnalytics } from "../notion/types.js";

export interface AnalyticsResult {
  metrics: PostAnalytics;
  postUrls: string;
  status: "ok" | "partial" | "unavailable";
}

export async function fetchPostAnalytics(latePostId: string): Promise<AnalyticsResult> {
  const data = await getPostAnalytics(latePostId);

  // Aggregate metrics across all platforms
  const metrics: PostAnalytics = {
    impressions: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    reach: 0,
    clicks: 0,
  };

  const urlLines: string[] = [];

  for (const entry of data.platforms) {
    const m = entry.metrics;
    metrics.impressions += m.impressions ?? 0;
    metrics.likes += m.likes ?? 0;
    metrics.comments += m.comments ?? 0;
    metrics.shares += m.shares ?? 0;
    metrics.reach += m.reach ?? 0;
    metrics.clicks += m.clicks ?? 0;

    if (entry.postUrl) {
      const label = LATE_TO_NOTION_PLATFORM[entry.platform] ?? entry.platform;
      urlLines.push(`${label}: ${entry.postUrl}`);
    }
  }

  const hasAnyMetrics = Object.values(metrics).some((v) => v > 0);
  const allHaveUrls = data.platforms.every((p) => p.postUrl);

  return {
    metrics,
    postUrls: urlLines.join("\n"),
    status: !hasAnyMetrics ? "unavailable" : allHaveUrls ? "ok" : "partial",
  };
}
