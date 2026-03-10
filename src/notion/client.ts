import { Client } from "@notionhq/client";

let client: Client | null = null;

export function initNotion(token: string): Client {
  client = new Client({
    auth: token,
    // Pin to a stable API version — SDK v5 defaults to 2025-09-03 which
    // routes database queries through /data_sources, but that endpoint
    // may not recognize databases in all workspaces yet.
    notionVersion: "2022-06-28",
  });
  return client;
}

export function getNotion(): Client {
  if (!client) {
    throw new Error("Notion client not initialized — call initNotion() first");
  }
  return client;
}
