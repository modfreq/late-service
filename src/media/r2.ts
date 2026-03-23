import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { logger } from "../logger.js";
import type { EnvConfig } from "../config.js";
import type { NotionMediaFile } from "../notion/types.js";

// --- Singleton ---

let s3: S3Client | null = null;
let bucketName = "";
let publicUrl = "";

export function isR2Enabled(): boolean {
  return s3 !== null;
}

export function initR2(env: EnvConfig): void {
  if (
    !env.R2_ACCOUNT_ID ||
    !env.R2_ACCESS_KEY_ID ||
    !env.R2_SECRET_ACCESS_KEY ||
    !env.R2_BUCKET_NAME ||
    !env.R2_PUBLIC_URL
  ) {
    logger.info("R2 not configured — media URLs will be passed through as-is");
    return;
  }

  s3 = new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });

  bucketName = env.R2_BUCKET_NAME;
  publicUrl = env.R2_PUBLIC_URL.replace(/\/+$/, "");

  logger.info({ bucket: bucketName }, "R2 client initialized");
}

// --- Helpers ---

function inferContentType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    pdf: "application/pdf",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };
  return map[ext] || "application/octet-stream";
}

function buildKey(notionPageId: string, fileName: string): string {
  const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const uuid = randomUUID().slice(0, 8);
  return `media/${notionPageId}/${uuid}-${sanitized}`;
}

async function uploadToR2(
  sourceUrl: string,
  key: string,
  contentType: string
): Promise<string> {
  const res = await fetch(sourceUrl);
  if (!res.ok) {
    throw new Error(`Failed to download media: HTTP ${res.status}`);
  }

  const body = Buffer.from(await res.arrayBuffer());

  await s3!.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  return `${publicUrl}/${key}`;
}

// --- Public API ---

/**
 * Upload Notion-hosted media files to R2 for permanent URLs.
 * External files (type: "external") are left as-is.
 * Returns original array unchanged if R2 is not configured.
 */
export async function uploadMediaToR2(
  notionPageId: string,
  files: NotionMediaFile[]
): Promise<NotionMediaFile[]> {
  if (!isR2Enabled()) return files;

  const results: NotionMediaFile[] = [];

  for (const file of files) {
    if (file.type !== "file") {
      results.push(file);
      continue;
    }

    const key = buildKey(notionPageId, file.name);
    const contentType = inferContentType(file.name);
    const r2Url = await uploadToR2(file.url, key, contentType);

    logger.info({ fileName: file.name, r2Key: key }, "Uploaded media to R2");
    results.push({ ...file, url: r2Url });
  }

  return results;
}
