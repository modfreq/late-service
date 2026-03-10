import { logger } from "../logger.js";
import type {
  CreatePostRequest,
  CreatePostResponse,
  GetPostResponse,
  PostAnalyticsResponse,
} from "./types.js";

// --- Error classes ---

export class LateApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public responseBody?: unknown
  ) {
    super(message);
    this.name = "LateApiError";
  }
}

export class RateLimitError extends LateApiError {
  constructor(
    public retryAfterMs: number,
    responseBody?: unknown
  ) {
    super(`Rate limited — retry after ${retryAfterMs}ms`, 429, responseBody);
    this.name = "RateLimitError";
  }
}

// --- Client singleton ---

const BASE_URL = "https://getlate.dev/api/v1";

let apiKey: string | null = null;

export function initLate(key: string): void {
  apiKey = key;
  logger.info("Late client initialized");
}

export function getLateApiKey(): string {
  if (!apiKey) {
    throw new Error("Late client not initialized — call initLate() first");
  }
  return apiKey;
}

// --- Raw fetch helper ---

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getLateApiKey()}`,
    "Content-Type": "application/json",
  };

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After");
    const retryMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60_000;
    const resBody = await res.json().catch(() => null);
    throw new RateLimitError(retryMs, resBody);
  }

  if (!res.ok) {
    const resBody = await res.json().catch(() => null);
    throw new LateApiError(
      `Late API ${method} ${path} returned ${res.status}`,
      res.status,
      resBody
    );
  }

  return res.json() as Promise<T>;
}

// --- Retry wrapper ---

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000, maxDelayMs = 30_000 } = opts;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt === maxRetries) break;

      // Don't retry 4xx errors (client errors) except 429
      if (err instanceof LateApiError && err.statusCode < 500 && err.statusCode !== 429) {
        break;
      }

      let delayMs: number;
      if (err instanceof RateLimitError) {
        delayMs = err.retryAfterMs;
      } else {
        delayMs = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      }

      logger.warn(
        { attempt: attempt + 1, maxRetries, delayMs },
        `Late API call failed, retrying in ${delayMs}ms`
      );

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

// --- Public API methods ---

export async function createPost(req: CreatePostRequest): Promise<CreatePostResponse> {
  const raw = await withRetry(() =>
    request<{ post: { _id: string; status: string }; message: string }>("POST", "/posts", req)
  );
  return {
    id: raw.post._id,
    status: raw.post.status,
  };
}

export async function getPost(postId: string): Promise<GetPostResponse> {
  return withRetry(() => request<GetPostResponse>("GET", `/posts/${postId}`));
}

export async function getPostAnalytics(postId: string): Promise<PostAnalyticsResponse> {
  return withRetry(() =>
    request<PostAnalyticsResponse>("GET", `/posts/${postId}/analytics`)
  );
}
