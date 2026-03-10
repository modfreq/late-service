import { LateApiError } from "../late/client.js";

// --- Types ---

export type DbStatus = "scheduled" | "failed" | "failed_retryable" | "published";

export type StaleCheckOutcome = "published" | "failed" | "still_scheduled";

// --- State resolution functions ---

/** Map a scheduling error to the appropriate DB status */
export function resolveScheduleStatus(err: unknown): DbStatus {
  return isRetryableError(err) ? "failed_retryable" : "failed";
}

/** Map a Late API post status string to a stale-check outcome */
export function resolveStaleCheckStatus(lateStatus: string): StaleCheckOutcome {
  const s = lateStatus.toLowerCase();
  if (s === "published" || s === "completed") return "published";
  if (s === "failed" || s === "error") return "failed";
  return "still_scheduled";
}

/** Determine if retries are exhausted */
export function resolveRetryStatus(
  retryCount: number,
  max = 3
): "retry" | "exhausted" {
  return retryCount < max ? "retry" : "exhausted";
}

/** Classify whether an error is retryable (429, 5xx, network) or terminal (4xx, validation) */
export function isRetryableError(err: unknown): boolean {
  if (err instanceof LateApiError) {
    if (err.statusCode === 429) return true;
    if (err.statusCode >= 500) return true;
    return false; // 4xx (except 429) = terminal
  }

  // Network / fetch errors are retryable
  if (err instanceof TypeError) return true;

  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (
      msg.includes("network") ||
      msg.includes("timeout") ||
      msg.includes("econnrefused") ||
      msg.includes("econnreset") ||
      msg.includes("fetch")
    ) {
      return true;
    }
  }

  return false;
}

/** Check if a scheduled post is past due (scheduled time + buffer has elapsed) */
export function isStale(scheduledFor: string, bufferMinutes = 15): boolean {
  const scheduledTime = new Date(scheduledFor).getTime();
  const bufferMs = bufferMinutes * 60 * 1000;
  return Date.now() > scheduledTime + bufferMs;
}
