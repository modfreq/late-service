import { Client } from "@notionhq/client";

let client: Client | null = null;

export function initNotion(token: string): Client {
  client = new Client({ auth: token });
  return client;
}

export function getNotion(): Client {
  if (!client) {
    throw new Error("Notion client not initialized — call initNotion() first");
  }
  return client;
}
