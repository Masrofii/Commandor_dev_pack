# Commandor Dev Pack — Agent Progress & Architecture Journal

## Phase A: Repository Audit & Technical Baseline

### 1. System Architecture Map
- **Backend**: Node.js v22 + Express 4.x (`server.js`) listening on port 3000.
  - Entry points: `server.js`, `src/api/*`, `src/middleware/*`.
  - Email ingestion: `POST /api/incoming` with idempotency, DNS/spam scoring (SPF, DKIM, DMARC), Cloudflare email routing integration, and automatic catch-all for claimed subdomains.
- **Telegram Bot**: Telegraf 4.16 (`src/bot/bot.js`, `src/bot/commands.js`, `src/bot/callbacks.js`).
  - Polling with webhook fallback, 5 categorized hubs (Quick Hub, Inbox, Aliases, Subdomains, Developer Tools), interactive callbacks, admin command center (`/health`, `/users`, `/errors`, `/version`, `/broadcasts`).
- **Web Frontend**: Next.js 14.2 App Router (`web/`) listening on port 3001.
  - SWR data fetching, WebSocket real-time alerts, Tailwind CSS, dark/light theme, full RTL support for Arabic/Urdu, error boundaries (`app/error.js`, `app/global-error.js`).
- **Database**: SQLite 3 with WAL mode, foreign keys enabled (`database/database.js`, `data/app.db`).
  - 15 migrations applied (`database/migrations/001_initial.sql` through `database/migrations/015_launchpad_and_templates.sql`).
- **Localization**: 12 complete language translation catalogs (`en`, `ar`, `ru`, `fr`, `es`, `de`, `tr`, `pt`, `zh`, `hi`, `id`, `ur`) verified 100% complete (92/92 keys, 0 missing).
- **Process Management**: PM2 (`commandor-api` / `temp-mail-api` ID 0 on port 3000, `commandor-web` / `temp-mail-web` ID 1 on port 3001).

---

## Phase B: Critical Bug Diagnoses & Fixes

### 1. Critical Bug: Historical Emails Missing from Website List
- **Symptom**: New incoming emails appeared in the right-hand message panel via WebSocket, but older historical emails visible in the Telegram bot were missing from the website's inbox list.
- **Root Cause Confirmed**:
  1. In `web/app/(dashboard)/inbox/page.js`, `inboxParams` sets `{ unread, starred, alias, q }` where inactive filters default to `undefined`.
  2. In `web/lib/api.js`, `getEmails` called `new URLSearchParams(p)`. In standard JavaScript, `new URLSearchParams({ alias: undefined, q: undefined })` serializes keys as literal strings: `?page=1&limit=20&alias=undefined&q=undefined`.
  3. In `src/api/emails.js` and `src/services/emailService.js`, the backend received `req.query.alias = "undefined"` and `req.query.q = "undefined"`.
  4. SQL executed `WHERE a.tg_id=? AND e.is_deleted=0 AND e.alias_address = 'undefined' AND e.id IN (SELECT rowid FROM emails_fts WHERE emails_fts MATCH 'undefined')`.
  5. Because no alias is named `'undefined'`, the query returned 0 historical emails.
  6. When a new email arrived live, the WebSocket pushed the event `{ type: 'email.received', data: { email } }` which directly populated `activeEmailId` and fetched `/api/emails/:id` directly by ID, explaining why only the new email showed in the right pane.
- **Implemented Fix**:
  1. Added `toQueryString(params)` in `web/lib/api.js` to strip `undefined`, `null`, and empty string values before URL construction.
  2. Sanitized `alias` and `q` in `src/api/emails.js` and `src/services/emailService.js` to treat `"undefined"`, `"null"`, and whitespace strings as null/omitted filters.
  3. Added `COLLATE NOCASE` to SQL alias joins and lookups in `emailService.js`.
  4. Updated `web/hooks/useInbox.js` with `useEffect` to reactively sync `params` with `initialParams` when filters or aliases change, resetting page to 1.
  5. Built automated regression test suite: `tests/api/historical_emails.test.js` (9/9 tests pass).

### 2. Telegram Bot `/start` Crash & Broadcast Confirmation
- **Bot `/start`**: Fixed SQL double-quote column error (`status="active"` -> `status='active'`) in `src/bot/commands.js`.
- **Broadcast System**: Fixed `broadcastConfirmKeyboard` ReferenceError, added HTML entity formatting, duplicate broadcast locks (`takeBroadcastConfirm`), and rate-limited chunking.

---

## Phase C: Core Email Experience & Message Viewer
- **Authentication Results**: Displayed SPF, DKIM, and DMARC verification badges in both reading pane and standalone detail view.
- **Message-ID Diagnostic**: Added copyable Message-ID row with clipboard integration.
- **Raw RFC822 EML Download**: Directly wired `GET /api/emails/:id/eml` with sanitized subject filename downloads.
- **Alias Lifecycle & Renewal**: Integrated 60-minute renewal button and deletion confirmations.

---

## Phase D: Telegram Bot Complete UX Upgrade
- **New Commands Added**:
  - `/export` — Interactive menu to request and download MBOX or ZIP archives of mailbox data.
  - `/privacy` — Explains data sovereignty, HTML sanitization, and 1-hour auto-burners.
  - `/support` — Diagnostic ID (`User #<tg_id>`), FAQs, and direct developer contact link.
  - `/notifications` — Interactive preference toggles for all incoming alerts, OTP-only filter, and silent delivery mode.
- **Silent Mode Delivery**: Updated `notificationService.js` to honor `disable_notification_sound` via Telegram Bot API's `disable_notification` parameter.

---

## Phase E: Dashboard & Domain Health Diagnostics
- **DNS Health Engine**: Built `checkDomainDnsHealth(domain, verificationToken)` in `src/services/domainService.js` using Node.js `dns.promises`:
  - MX resolution (`dns.resolveMx`) verifying priority and exchange routing.
  - SPF record inspection (`dns.resolveTxt`) validating `v=spf1` policies.
  - DMARC record inspection (`dns.resolveTxt`) validating `_dmarc.<domain>`.
- **API Endpoint**: Exposed `GET /api/domains/:id/health` for deep diagnostics.
- **Frontend Inspector**: Added interactive "DNS Health" diagnostic card to the custom domains manager in `web/app/(dashboard)/subdomains/page.js`.

---

## Phase F: Admin Center & PWA
- **Admin Center**: Real-time stats, user moderation, global emails feed, subdomain controls, node pool, threat logs, broadcast center, database VACUUM.
- **PWA Branding**: Updated `web/public/manifest.json` with official Commandor Dev Pack branding and metadata.

---

## Phase J: Full Platform Transformation (Commandor Dev Pack)
- **Product Rebranding**: Complete scrub of all residual "Commandor Mail" and temporary mail branding across the README, configs, bot strings, 15 locale packages, Next.js dashboard, service worker, and metadata.
- **Admin Node Management**:
  - Encrypted credential storage at rest using AES-256-GCM (`src/utils/encryption.js`).
  - Strict host-key verification with SHA-256 fingerprinting.
  - Non-destructive specifications probe (`uname -s`, `nproc`, `free -m`, `df -h`).
  - Zero exposure of credentials in API payloads or client storage.
  - Bulk node validation with syntax checking and duplicate IP detection.
  - Interactive ping and remote diagnostic execution with audit logging.
- **Domain & Subdomain Guided Engine**:
  - Extensible DNS provider abstraction (`BaseDnsProvider`, `CloudflareDnsProvider`, `ManualDnsProvider`).
  - 8-Step Subdomain Creation Wizard with RFC 1123 hostname validation and reserved route protection.
  - Reverse proxy Nginx virtual host generator with syntax validation, config backup, graceful reload, and automatic rollback.
  - Multi-stage route verification independently checking DNS resolution (`dns.promises`), HTTP reachability, and TLS handshake (`tls.connect`).
  - Safe subdomain deletion protecting DNS records and server data with explicit opt-in confirmation.
- **Applications Platform & Infrastructure Management**:
  - Applications module (`/applications`) with Git repository deployment, PM2/process control, environment variable secrets management, node association, and rollback support.
  - Monitoring & Telemetry module (`/monitoring`) with real-time host CPU load avg, memory percentage, disk usage, container health, cluster availability, and immutable event streaming.
  - Disaster Recovery & Backups module (`/backups`) with SQLite WAL checkpointing, full configuration zip archives, SHA-256 integrity verification, authenticated downloads, and safe typed-confirmation restore workflow.
  - Developer Tools (`/api-keys`) with granular permission scopes including `subdomains:manage`, `hosting:manage`, `webhooks:write`, and `emails:read`.
  - Settings Audit Trail (`/settings`) with real-time change logs, filtering by category, search, and role-based scoping.

---

## Phase K: Next-Generation Improvement Sprint (Launchpad, Templates, Visibility & Reliability)

### 1. Consistency & Metadata Scrubbing (Phase 1)
- Replaced residual legacy temporary email copy in `README.html`, `web/app/(dashboard)/api-keys/page.js`, and `src/bot/commands.js` with Commandor Dev Pack platform metadata.
- Preserved all email and Telegram bot features, burners, and routing in backward-compatible state.
- Fixed migration counts in documentation from 13 to 15.

### 2. Commandor Launchpad (Phase 2)
- Implemented guided 10-step service creation workflow (`src/services/launchpadService.js`, `src/api/launchpad.js`, `web/components/CommandorLaunchpad.js`):
  1. Source repository / application selection (Git URL, branch).
  2. Cluster node assignment (Local Host or remote VPS node).
  3. Runtime and build configuration (Node.js, Python, Go, Static, Docker; build/start scripts, ports).
  4. Environment variables & secrets management (masked in logs and encrypted at rest).
  5. Subdomain and base domain routing selection with HTTPS toggle.
  6. Configuration preview (DNS records, Nginx upstream and virtual host blocks).
  7. Explicit plan review and confirmation gate.
  8. Controlled deployment job execution with live log streaming.
  9. Runtime health check probe (`/health`) with honest reporting.
  10. Safe recovery & resume path: failure in later steps preserves already provisioned subdomains and routes, permitting step resumption without repeating work.

### 3. Reusable Subdomain Templates (Phase 3)
- Seeded and editable blueprint templates (`src/services/templateService.js`, `src/api/templates.js`, `web/components/SubdomainTemplates.js`):
  - `nodejs-express`: Node.js Express/Fastify REST API.
  - `fastapi-python`: FastAPI / Flask Python web service.
  - `vitepress-docs`: VitePress / Docusaurus static documentation.
  - `static-landing`: High-performance HTML/CSS static site.
  - `status-page`: Infrastructure monitoring & status dashboard.
- Strict security validation rejecting dangerous shell patterns (`curl | bash`, `rm -rf`, `nc -e`, `sudo`, `dd if=`).
- Pre-flight DNS and proxy route conflict detection preserving unrelated virtual hosts and records.

### 4. Deployment History & Safe Rollback (Phase 4)
- Release history logging in `application_deployments` (`commit_hash`, `duration_ms`, `health_check_result`, `is_rollback`, `rollback_from_id`).
- REST endpoints `GET /api/applications/:id/deployments` and `GET /api/applications/:id/deployments/:depId`.
- Safe rollback engine (`rollbackApplication`) that restores target release, performs live post-rollback HTTP health check, and reports health honestly without masking degradation.
- Interactive Release History and Rollback modal in `web/app/(dashboard)/applications/page.js`.

### 5. Infrastructure Visibility & Topology Map (Phase 5)
- Visual relationship topology engine (`src/services/monitoringService.js`, `src/api/monitoring.js`, `web/components/InfrastructureTopologyMap.js`):
  - Connects DNS Providers -> Custom Domains -> Subdomains -> Proxy Routes -> Applications -> VPS Nodes.
  - 4 distinct health states: `healthy` (green), `degraded` (yellow), `unhealthy` (red), `unknown` (gray).
  - Multi-stage health indicators for DNS resolution, HTTP reachability, TLS handshake, node availability, and app status.
  - Interactive node drawer displaying ports, hostnames, upstream targets, and live specifications.

### 6. Reliability & Operational Guardrails (Phase 6)
- **Webhook Retry Engine** (`src/services/webhookService.js`, `src/api/webhooks.js`, `web/app/(dashboard)/webhooks/page.js`):
  - Exponential backoff calculation and delivery tracking (`attempt_number`, `next_retry_at`).
  - Manual delivery retry endpoint `POST /api/webhooks/:id/deliveries/:deliveryId/retry`.
  - Deliveries & Retry Inspector modal in dashboard.
- **Backup Integrity & Sandbox Restore Testing** (`src/services/backupService.js`, `src/api/backups.js`, `web/app/(dashboard)/backups/page.js`):
  - Deep SHA-256 checksum and SQLite magic header verification (`POST /api/backups/:id/verify`).
  - Isolated dry-run sandbox restore (`POST /api/backups/:id/test-restore`): opens backup snapshot in ephemeral test database, verifies table counts and schema integrity without touching production.
- **Resource Capacity Warnings** (`src/services/monitoringService.js`):
  - Proactive warning banners for memory (>85%), disk (>90%), CPU (>90%), offline nodes, and failed applications.

---

## Phase L: User Management, Subscriptions & Voucher Engine

### 1. User Suspension & Session Purging
- **Ban & Unban Lifecycle** (`src/services/userService.js`, `src/api/admin.js`):
  - Added `ban_reason`, `banned_at`, and `banned_by` tracking to `users` table.
  - Multi-tier enforcement: instantly closes active WebSockets, purges active web sessions (`DELETE FROM web_sessions WHERE tg_id = ?`), revokes API keys, and rejects authentication middleware (`requireAuth`, `requireApiKey`) with `403 Account suspended`.
  - Telegram bot security gate (`src/bot/bot.js`): blocks banned users from executing bot commands or pressing inline keyboards.
  - Telegram bot administrative commands: `/ban <tg_id> [reason]` and `/unban <tg_id>`.

### 2. Tiered Subscription Quota Management
- **Subscription Engine** (`database/migrations/016_user_management_subscriptions_redeem.sql`, `src/services/userService.js`, `src/api/subscriptions.js`):
  - Pre-seeded subscription tiers:
    - `free`: 10 aliases, 1 domain, 3 applications, 1 node, 1GB storage.
    - `starter`: 50 aliases, 3 domains, 10 applications, 3 nodes, 5GB storage.
    - `pro`: 200 aliases, 10 domains, 50 applications, 10 nodes, 25GB storage.
    - `enterprise`: Unlimited aliases/domains/applications/nodes, 100GB storage.
  - Admin subscription management: support for custom expiration dates, day-based renewals extending current expiry, or lifetime permanent access.
  - User subscription status endpoint: `GET /api/subscription/current` returning current tier, active quotas, usage counts, and expiration dates.
  - Telegram bot commands: `/plan` to check active quotas and subscription expiration.

### 3. Promo Codes & Voucher Redemptions
- **Voucher System** (`src/services/redeemService.js`, `src/api/subscriptions.js`, `src/api/admin.js`):
  - Voucher creation with code formatting (e.g. `COMMANDOR-PRO-2026`), title, max usages, expiration date, and reward payload:
    - `subscription`: upgrades tier and extends days.
    - `storage_boost`: grants additional storage bytes.
    - `alias_boost`: grants additional alias creation quota.
    - `domain_boost`: grants additional custom domain quota.
  - Duplicate redemption prevention: guarantees a user can redeem a single voucher code only once using unique composite tracking in `redeem_logs`.
  - Concurrency & usage limit protection: tracks `used_count` vs `max_uses`.
  - Multi-channel redemption: web dashboard card and Telegram bot command (`/redeem <code>`).
  - Redemptions audit log with user details, reward summary, IP address, and timestamp.

### 4. Admin & User Interface Components
- **Admin Center** (`web/app/(dashboard)/admin/page.js`):
  - Dedicated "Vouchers & Promo Codes" tab (`tab === 'redeem'`) with code search, creation modal, one-click clipboard copy, status toggle, delete, and real-time redemptions audit log.
  - Enhanced "Users Directory" tab with status filter (`all`, `active`, `banned`), plan filter (`all`, `free`, `starter`, `pro`, `enterprise`), user quota indicators, Ban/Unban modal with custom reason, and Subscription Tier management modal.
- **User Settings & Dashboard** (`web/app/(dashboard)/settings/page.js`, `web/components/VoucherRedeemCard.js`):
  - "Subscription & Vouchers" settings tab displaying user's active tier badge, quota progress bars (Aliases, Domains, Apps, Storage), expiration countdown, voucher code entry form, and tier comparison card.

---

## Verification & Test Results
- **Jest Test Suite**: 21 test suites, 185 tests passed (100% pass rate).
  - Added `tests/services/userManagementAndRedeem.test.js` (15/15 tests passing) covering ban enforcement, unbanning, session eviction, subscription plan upgrades, lifetime grants, voucher redemption rewards, duplicate prevention, revoked code rejection, and max usage exhaustion.
- **Next.js Production Build**: 19/19 static and dynamic routes compiled cleanly with 0 errors (`npm run build`).
- **Translation Completeness**: 15 languages verified 100% complete.
- **PM2 Production Status**:
  - `commandor-api` / `temp-mail-api` (Port 3000): Online, 0 errors.
  - `commandor-web` / `temp-mail-web` (Port 3001): Online, 0 errors.

---

## Phase Status Summary
- [x] Phase A: Repository Audit & Technical Baseline
- [x] Phase B: Critical Bug Fixes (Historical Emails & Broadcast Regression)
- [x] Phase C: Core Email Experience (Inbox, Search, Export, Aliases)
- [x] Phase D: Telegram Bot Complete UX (Onboarding, Commands, Callbacks)
- [x] Phase E: Web Dashboard Redesign & Domain Management
- [x] Phase F: Admin Center, Security & Operations
- [x] Phase G: Automation & Webhook Engine
- [x] Phase H: AI Tools, PWA & Quota Engine
- [x] Phase I: Verification & Production Deployment
- [x] Phase J: Commandor Dev Pack Master Transformation (Nodes, Subdomains, Apps, Monitoring, Backups, Audit)
- [x] Phase K: Next-Generation Improvement Sprint (Launchpad, Templates, Visibility & Reliability)
- [x] Phase L: User Management, Subscriptions & Voucher Engine
