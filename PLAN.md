# Late Service - Notion to getlate.dev Bridge

## Context

Alex manages 5-15 projects, each with its own Notion teamspace and social media accounts across LinkedIn, X, Pinterest, Bluesky, and Instagram. Currently there's no automated pipeline from content planning to publishing. This service automates the flow: create content in Notion, set status to "Scheduled", and the service handles posting via getlate.dev, then syncs analytics back.

**Key constraints from user:**
- One Late API key (single Late account, all social accounts connected)
- One Notion internal integration across all teamspaces
- Polling-based sync (every 5 min)
- Multi-platform posts with same content by default, per-platform overrides when needed
- Media from both Notion uploads and external URLs
- Analytics: hourly for first 48h, then daily
- Error alerts via email
- Simple web dashboard for monitoring
- TypeScript/Node.js stack
- Dedicated VM on Proxmox homelab

---

## Notion Database Schema (per project)

Each project gets a content calendar database with these properties:

**User-managed:**
| Property | Type | Purpose |
|---|---|---|
| Name | Title | Internal label for the post |
| Status | Select | `Draft` / `Scheduled` / `Publishing` / `Published` / `Failed` |
| Post Type | Select | `Post` (default) / `Thread` / `Story` / `Reel` |
| Scheduled Date | Date | When to publish (with timezone) |
| Content | Rich Text | Default post body. For threads: separate items with `---` delimiter |
| Platforms | Multi-select | Target platforms: `LinkedIn`, `X`, `Pinterest`, `Bluesky`, `Instagram` |
| Media | Files & Media | Attached images/videos/documents. Multiple files = carousel on Instagram |

**Post Type behavior:**
- **Post** (default): Standard single post. Multiple media files on Instagram auto-create a carousel (up to 10 items, first item sets aspect ratio). A PDF/PPTX on LinkedIn auto-creates a document post.
- **Thread**: Content field is split on `---` delimiter. Each segment becomes a thread item (X thread tweet, or LinkedIn multi-part post). Each thread item can reference media by index notation `[media:1]` to attach specific files.
- **Story**: Instagram Story. Requires media (image or ≤60s video). Text content is optional.
- **Reel**: Instagram Reel. Requires video media.

**Per-platform overrides (optional):**
| Property | Type | Purpose |
|---|---|---|
| LinkedIn Text | Rich Text | Override text for LinkedIn |
| X Text | Rich Text | Override text for X (also supports `---` delimiter for threads) |
| Pinterest Text | Rich Text | Override text for Pinterest |
| Bluesky Text | Rich Text | Override text for Bluesky |
| Instagram Text | Rich Text | Override text for Instagram |
| Pinterest Link | URL | Destination URL for pins |
| Pinterest Board | Select | Target board |
| LinkedIn Doc Title | Rich Text | Title for LinkedIn document/PDF posts |

**System-managed (written by service):**
| Property | Type | Purpose |
|---|---|---|
| Late Post ID | Rich Text | Late API post ID |
| Post URLs | Rich Text | Published URLs (one per platform per line) |
| Impressions | Number | Total impressions |
| Likes | Number | Total likes/reactions |
| Comments | Number | Total comments |
| Shares | Number | Total shares/reposts |
| Reach | Number | Total reach |
| Clicks | Number | Total clicks |
| Last Synced | Date | Last analytics sync timestamp |
| Sync Error | Rich Text | Error message if failed |

---

## Architecture

```
┌──────────┐     poll every 5min      ┌──────────────┐     schedule post     ┌──────────┐
│  Notion   │ ◄─────────────────────► │ late-service  │ ──────────────────► │ Late API │
│ databases │   write analytics back  │              │ ◄────────────────── │          │
└──────────┘                          │  SQLite DB   │   analytics/status   └──────────┘
                                      │  Dashboard   │
                                      │  Email alerts│
                                      └──────────────┘
```

**Core loops:**
1. **Notion Poller** (every 5 min): Query each project DB for `Status = Scheduled` + `Late Post ID is empty` → schedule in Late → write Late Post ID back → set status to `Publishing`
2. **Analytics Syncer** (every 15 min sweep): For published posts where `next_analytics_at <= now`, fetch metrics from Late → write to Notion → set next check interval
3. **Stale Checker** (every 30 min): Detect posts stuck in `scheduled` state past their due time → fetch status from Late → update accordingly

---

## Tech Stack

| Component | Choice | Rationale |
|---|---|---|
| Runtime | Node.js 22 + TypeScript | User preference, Late has official Node SDK |
| Late SDK | `@getlatedev/node` | Official SDK, handles auth/types |
| Notion SDK | `@notionhq/client` | Official SDK with auto-retry on 429 |
| Database | SQLite via `better-sqlite3` | Single-process service, no external DB needed |
| HTTP server | Fastify | Better TS support than Express, built-in validation |
| Dashboard UI | htmx + server-rendered HTML + Tailwind CDN | No frontend build step, simple admin tool |
| Scheduling | `node-cron` | Lightweight cron for poll/sync intervals |
| Email | `nodemailer` | SMTP-based error alerts |
| Config | `dotenv` + YAML (`yaml` package) + `zod` validation | Env vars for secrets, YAML for project mappings |
| Logging | `pino` | Structured JSON logs, Fastify ecosystem |
| Deployment | systemd + GitHub Actions self-hosted runner | Direct on Ubuntu VM, auto-deploy on push |

---

## Project Structure

```
late-service/
  package.json / tsconfig.json / .env.example
  .github/workflows/deploy.yml   # GitHub Actions CD pipeline
  config/
    projects.yaml              # Per-project Notion DB → Late account mappings
  src/
    index.ts                   # Entry point: load config, init DB, start cron + dashboard
    config.ts                  # Load .env + projects.yaml, Zod validation
    logger.ts                  # pino logger
    db/
      connection.ts            # better-sqlite3 init (WAL mode)
      schema.sql               # DDL for sync_posts, analytics_log, activity_log
      migrate.ts               # Forward-only migration runner
      queries.ts               # Prepared statement wrappers
    notion/
      client.ts                # @notionhq/client wrapper
      poller.ts                # Query DBs for scheduled posts
      writer.ts                # Update page properties (analytics, URLs, status)
      types.ts                 # NotionPost interface, property name constants
    late/
      client.ts                # @getlatedev/node wrapper
      scheduler.ts             # Create/schedule posts in Late
      analytics.ts             # Fetch post metrics from Late
      types.ts                 # Late API types
    media/
      handler.ts               # Download from Notion URLs → upload to Late via presigned URLs
    sync/
      orchestrator.ts          # Top-level loop: poll → schedule → track
      analytics-syncer.ts      # Sweep posts due for metric updates
      state-machine.ts         # Post lifecycle: pending → scheduled → published / failed
    notify/
      email.ts                 # nodemailer SMTP error alerts (with dedup)
    scheduler/
      cron.ts                  # node-cron job definitions
    dashboard/
      server.ts                # Fastify server
      routes/
        api.ts                 # REST: /api/health, /api/projects, /api/posts, /api/activity
        pages.ts               # Server-rendered HTML pages
      views/
        layout.html            # Base layout with Tailwind CDN
        index.html             # Dashboard home: health, summary cards, activity feed
        project.html           # Per-project detail: post table with filters
        logs.html              # Activity log with level/project filters
```

---

## Configuration

**`.env`** (secrets + tuning):
```
LATE_API_KEY=sk_xxx
NOTION_TOKEN=ntn_xxx
DB_PATH=./data/late-service.sqlite
DASHBOARD_PORT=3100
SMTP_HOST= / SMTP_PORT=587 / SMTP_USER= / SMTP_PASS=
ALERT_FROM= / ALERT_TO=
NOTION_POLL_INTERVAL_MINUTES=5
LOG_LEVEL=info
```

**`config/projects.yaml`** (per-project mappings):
```yaml
projects:
  - id: "project-alpha"
    name: "Project Alpha"
    enabled: true
    notion:
      databaseId: "897e5a76-..."
    platforms:
      linkedin:
        accountId: "acc_xxx"
        textProperty: "LinkedIn Text"
      x:
        accountId: "acc_yyy"
        textProperty: "X Text"
```

---

## SQLite Schema

**`sync_posts`** - Core state tracking (one row per Notion page):
- `notion_page_id` (UNIQUE) - idempotency key, prevents double-posting
- `project_id`, `late_post_id`, `status` (pending/scheduled/published/failed/failed_retryable)
- `scheduled_for`, `published_at`, `post_urls` (JSON), `last_error`, `retry_count`
- `next_analytics_at` - drives analytics sweep schedule

**`analytics_log`** - Time-series metric snapshots per post (for debugging/trends)

**`activity_log`** - Event log for dashboard display (auto-cleaned after 7 days)

---

## Key Flows

### Scheduling a Post
1. Poller queries Notion DB: `Status = "Scheduled"` AND `Late Post ID is empty`
2. Check SQLite: skip if already tracked with a `late_post_id` (idempotency)
3. **Validate content** (see Content Validation below). On failure: set status to `Failed`, write all violations to `Sync Error`, skip scheduling
4. Download media from Notion URLs (they expire in ~1hr) → upload to Late via presigned URLs
5. **Build Late API request** based on Post Type:
   - **Post**: Standard `content` + `mediaItems` + `platforms` array
   - **Thread**: Split content on `---`, build `platformSpecificData.threadItems` array for X. Each segment becomes a thread item with its own `content` and optional `mediaItems`
   - **Story/Reel**: Set `platformSpecificData.contentType` to `"story"` or `"reels"` on the Instagram platform entry
   - **Carousel** (auto-detected): Multiple items in `mediaItems` array — Late/Instagram handle it automatically
   - **LinkedIn Document** (auto-detected by file type): Set media `type: "document"`, add `platformSpecificData.documentTitle`
6. Create post in Late with mapped account IDs, scheduled time, content + per-platform overrides
7. On success: insert SQLite row, write Late Post ID to Notion, set status to `Publishing`
8. On failure: mark as `failed` or `failed_retryable`, write error to Notion, send email alert

### Content Validation

Validation runs before any API calls. Checks both character limits and content type requirements.

**Character limits** — for each target platform, check the resolved text (platform override if set, otherwise default Content). For threads, each `---`-delimited segment is validated individually:

| Platform | Max Characters | Notes |
|---|---|---|
| X | 280 | Per tweet. URLs count as 23 chars (t.co wrapping) |
| Bluesky | 300 | |
| LinkedIn | 3,000 | |
| Instagram | 2,200 | |
| Pinterest | 500 | Pin description limit |

**Content type requirements:**
| Post Type | Requirements |
|---|---|
| Post | Content or media required |
| Thread | At least 2 segments after splitting on `---` |
| Story | Media required (image or video ≤60s). Instagram must be a target platform |
| Reel | Video media required. Instagram must be a target platform |
| Carousel (auto) | Multiple media items on Instagram. Up to 10 items, first sets aspect ratio |
| Document (auto) | PDF/PPTX file in media on LinkedIn. `LinkedIn Doc Title` recommended |

If any validation fails, the entire post is rejected (not partially scheduled). The `Sync Error` field lists all violations, not just the first one.

### Analytics Sync
1. Every 15 min: query SQLite for posts where `next_analytics_at <= now`
2. Fetch metrics from Late API for each post
3. Write impressions/likes/comments/shares/reach/clicks + Post URLs + status to Notion
4. Set next check: if < 48h old → +60min, if < 30 days → +24h, else stop

### Error Handling
- Retries with exponential backoff for transient errors (429, 5xx, ECONNRESET)
- Max 3 retries before marking as `failed`
- Email notifications with dedup (same error won't spam within 1 hour)
- Graceful shutdown on SIGTERM (stop crons, wait for in-flight ops, close DB)

---

## Dashboard

| Page | Shows |
|---|---|
| Home `/` | System health, last/next poll, summary cards (total/pending/published/failed), activity feed |
| Project `/projects/:id` | Post table with status/date/platform/metrics, filter by status, retry button for failed |
| Logs `/logs` | Paginated activity_log, filter by level and project |

Auto-refreshes via htmx polling (every 30s for activity feed).

---

## Deployment

**No Docker.** The service runs directly on an Ubuntu VM via systemd, with a self-hosted GitHub Actions runner for CI/CD.

### Ubuntu VM Setup
- Node.js 22 installed via NodeSource
- Self-hosted GitHub Actions runner installed and registered as a systemd service
- App lives at `/opt/late-service/` with a dedicated `late-service` system user
- SQLite data at `/opt/late-service/data/` (persists across deploys)
- Config at `/opt/late-service/config/projects.yaml` (managed on the VM, not in git)
- `.env` at `/opt/late-service/.env` (managed on the VM, not in git)

### systemd Unit (`/etc/systemd/system/late-service.service`)
```ini
[Unit]
Description=Late Service - Notion to getlate.dev bridge
After=network.target

[Service]
Type=simple
User=late-service
WorkingDirectory=/opt/late-service
EnvironmentFile=/opt/late-service/.env
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### GitHub Actions CD (`.github/workflows/deploy.yml`)
```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: self-hosted
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run build
      - run: |
          rsync -a --delete dist/ /opt/late-service/dist/
          rsync -a node_modules/ /opt/late-service/node_modules/
          cp package.json /opt/late-service/
      - run: sudo systemctl restart late-service
```

The self-hosted runner runs on the same VM. Push to `main` → build → copy to `/opt/late-service/` → restart the systemd service. Config and `.env` stay on the VM and aren't touched by deploys.

---

## Implementation Order

| Phase | What | Testable outcome |
|---|---|---|
| 1. Foundation | Project init, config loading, SQLite setup, logger, entry point | Service starts, creates DB, logs "ready" |
| 2. Notion Integration | Notion client, poller, writer | Poll a real DB, log parsed posts |
| 3. Late Integration | Late client, media handler, scheduler | Schedule a test post from Notion, verify in Late |
| 4. Full Sync Loop | Orchestrator, state machine, DB queries, cron jobs | End-to-end: Notion "Scheduled" → Late post → Late Post ID written back |
| 5. Analytics | Late analytics fetcher, analytics syncer | Published post metrics appear in Notion |
| 6. Dashboard | Fastify server, API routes, HTML views | Browse dashboard, see projects and posts |
| 7. Polish | Email alerts, graceful shutdown, systemd unit, GH Actions workflow | Deploy on VM, run end-to-end |

## Verification

1. **Unit test:** Set a Notion entry to "Scheduled" → service picks it up within 5 min → Late Post ID appears in Notion → status moves to "Publishing"
2. **Integration test:** After the post publishes in Late → status moves to "Published" → Post URLs appear → analytics numbers update over time
3. **Error test:** Create a post with invalid content → status becomes "Failed" → Sync Error shows details → email alert received
4. **Dashboard test:** Browse to `http://vm-ip:3100` → see all projects, posts, activity log, health status
5. **Restart test:** Kill and restart the service → no duplicate posts created → analytics continue updating
