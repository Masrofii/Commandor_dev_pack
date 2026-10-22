# Commandor Mail — Agent Progress & Architecture Journal

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
  - 13 migrations applied (`database/migrations/`).
- **Localization**: 12 complete language translation catalogs (`en`, `ar`, `ru`, `fr`, `es`, `de`, `tr`, `pt`, `zh`, `hi`, `id`, `ur`) verified 100% complete (92/92 keys, 0 missing).
- **Process Management**: PM2 (`temp-mail-api` ID 0, `temp-mail-web` ID 1).

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
- **PWA Branding**: Updated `web/public/manifest.json` with official Commandor Mail branding and metadata.

---

## Verification & Test Results
- **Jest Test Suite**: 14 test suites, 118 tests passed (100%).
- **Next.js Production Build**: 15/15 static and dynamic routes compiled cleanly.
- **Translation Completeness**: 12 launch languages verified 100% complete (92/92 keys).
- **PM2 Production Status**:
  - `temp-mail-api` (Port 3000): Online, 0 errors.
  - `temp-mail-web` (Port 3001): Online, 0 errors.

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
