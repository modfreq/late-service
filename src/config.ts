import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod/v4";
import dotenv from "dotenv";

dotenv.config();

// --- Environment schema ---

const envSchema = z.object({
  LATE_API_KEY: z.string().min(1),
  NOTION_TOKEN: z.string().min(1),
  DB_PATH: z.string().default("./data/late-service.sqlite"),
  DASHBOARD_PORT: z.coerce.number().int().default(3100),
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  ALERT_FROM: z.string().default(""),
  ALERT_TO: z.string().default(""),
  NOTION_POLL_INTERVAL_MINUTES: z.coerce.number().int().min(1).default(5),
  LOG_LEVEL: z.string().default("info"),
  R2_ACCOUNT_ID: z.string().default(""),
  R2_ACCESS_KEY_ID: z.string().default(""),
  R2_SECRET_ACCESS_KEY: z.string().default(""),
  R2_BUCKET_NAME: z.string().default(""),
  R2_PUBLIC_URL: z.string().default(""),
});

export type EnvConfig = z.infer<typeof envSchema>;

// --- Projects YAML schema ---

const platformSchema = z.object({
  accountId: z.string().min(1),
  textProperty: z.string().optional(),
});

const projectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  enabled: z.boolean().default(true),
  notion: z.object({
    databaseId: z.string().min(1),
  }),
  platforms: z.record(z.string(), platformSchema).refine(
    (p) => Object.keys(p).length > 0,
    { message: "At least one platform is required" }
  ),
});

const projectsFileSchema = z.object({
  projects: z.array(projectSchema).min(1),
});

export type ProjectConfig = z.infer<typeof projectSchema>;
export type PlatformConfig = z.infer<typeof platformSchema>;

// --- Load functions ---

export function loadEnv(): EnvConfig {
  return envSchema.parse(process.env);
}

export function loadProjects(configDir?: string): ProjectConfig[] {
  const dir = configDir || resolve(process.cwd(), "config");
  const filePath = resolve(dir, "projects.yaml");
  const raw = readFileSync(filePath, "utf-8");
  const parsed = parseYaml(raw);
  const validated = projectsFileSchema.parse(parsed);
  return validated.projects;
}

export interface AppConfig {
  env: EnvConfig;
  projects: ProjectConfig[];
}

export function loadConfig(configDir?: string): AppConfig {
  const env = loadEnv();
  const projects = loadProjects(configDir);
  return { env, projects };
}
