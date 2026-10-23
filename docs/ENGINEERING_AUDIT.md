# Commandor Dev Pack — Comprehensive Engineering Audit & Technical Baseline

**Document Version:** 1.0.0  
**Target Platform:** Commandor Dev Pack  
**Audit Date:** October 2026  
**Auditor:** Principal Software Architect & Application Security Engineer  

---

## 1. Executive Summary

Commandor Dev Pack is an integrated self-hosted developer platform combining cloud hosting, VPS node management, custom subdomain routing with automated reverse proxy configuration, application Git deployments, telemetry monitoring, disaster recovery backups, and an enterprise temporary/disposable email system with Telegram bot and Next.js web interfaces.

This audit establishes the baseline health of the codebase, details confirmed defects and their root causes, verifies resolved vulnerabilities and regressions, and documents evidence-backed benchmarks across all architectural subsystems.

### Core Metrics Summary

| Area | Status | Measurements / Evidence |
| :--- | :---: | :--- |
| **Backend Test Suite** | PASS | 27 test suites, 245 tests passing (100% pass rate) |
| **Web Production Build** | PASS | Next.js 14.2.35 — 19/19 static and dynamic routes compiled cleanly |
| **Database Migrations** | PASS | 18 migrations applied cleanly (`001_initial.sql` to `018_applications_user_isolation.sql`) |
| **Tenant Isolation** | PASS | Strict multi-user ownership verified on applications, aliases, emails, and routes |
| **Internationalization** | PASS | 12 languages (en, ar, ru, fr, es, de, tr, pt, zh, hi, id, ur) with 0 missing keys |
| **Process State** | PASS | PM2 cluster/fork processes running stably on Node.js v22 |

---

## 2. Architecture Overview

```
                         [ Internet / User Ingress ]
                                      │
              ┌───────────────────────┴───────────────────────┐
              ▼                                               ▼
    [ Telegram Bot API ]                             [ Cloudflare / Reverse Proxy ]
   (Telegraf 4.16 Engine)                                     │
              │                                      ┌────────┴────────┐
              │                                      ▼                 ▼
              │                            [ Next.js 14 Web ]   [ Express API ]
              │                                (Port 3001)        (Port 3000)
              │                                      │                 │
              └──────────────────────┬───────────────┴─────────────────┘
                                     ▼
                     [ Business Services Layer ]
     ┌──────────────────────┬──────────────────────┬─────────────────────┐
     ▼                      ▼                      ▼                     ▼
[Hosting & VPS]      [Subdomains & DNS]     [Email Engine]       [Launchpad & Apps]
 (SSH2, Nginx)        (Cloudflare/Manual)   (Parser, Sanitizer)   (Git Deployments)
     │                      │                      │                     │
     └──────────────────────┴──────────┬───────────┴─────────────────────┘
                                       ▼
                       [ SQLite 3 Database (WAL Mode) ]
                        (/opt/temp-mail-manager/data)
```

### Components Inventory

1. **Backend Server (`server.js`)**:
   - Runtime: Node.js v22.x
   - Framework: Express 4.18
   - Security: Helmet with HSTS, CORS domain whitelisting, express-rate-limit, express-validator
   - Database: SQLite 3 via `better-sqlite3` 9.4 with WAL journal mode, 64MB cache, foreign keys enabled
   - Logging: Winston with daily rotation, request correlation IDs, secret redaction

2. **Web Frontend (`web/`)**:
   - Framework: Next.js 14.2 (App Router)
   - Styling: Tailwind CSS 3.4 with custom cyber/brand theme
   - Internationalization: 12 languages supported, native RTL stylesheet safeguards
   - Data Fetching: SWR with WebSocket real-time event updates

3. **Telegram Bot (`src/bot/`)**:
   - Framework: Telegraf 4.16
   - Hubs: Interactive Inline Keyboards, Reply Menus, 5 categorized functional hubs
   - Admin Suite: Telemetry, User Directory, Nodes Management, Broadcast Announcements

4. **Background Jobs & Daemons (`src/jobs/`)**:
   - Periodic Cleanup (`cleanup.js`): Deletes expired temporary mailboxes and soft-deleted records
   - Backups (`backups.js`): Nightly automated database and system configuration backups
   - Webhook Retry (`webhookRetry.js`): Exponential backoff retry engine for webhook deliveries
   - Telemetry (`healthChecks.js`): Automated node ping and system capacity warnings

---

## 3. Confirmed Defects & Root Cause Analyses

### Defect 1: Telegram Inbox Empty Literal Markup Regression
- **Symptom**: Tapping "Inbox" or running `/inbox` in the Telegram bot displayed literal HTML markup to users: `📭 <b>Inbox is empty.</b>`.
- **Root Cause**:
  In `src/bot/commands.js`, `showInbox()` contained a bifurcated return statement:
  ```javascript
  if (ctx.callbackQuery) return send(ctx, emptyTxt, { reply_markup: { inline_keyboard: emptyKb } });
  return ctx.reply(emptyTxt, { reply_markup: { inline_keyboard: emptyKb } });
  ```
  When invoked via text command or bottom reply keyboard, `ctx.callbackQuery` was falsy, calling `ctx.reply()` without `parse_mode: 'HTML'`. Telegram treated the translated string (which contains `<b>` tags) as plain text, exposing literal markup.
- **Remediation**:
  Replaced with `return send(ctx, emptyTxt, { reply_markup: { inline_keyboard: emptyKb } });`. The `send()` helper sets `parse_mode: 'HTML'` on all message dispatches.
- **Verification**: Regression test `showInbox enforces parse_mode: HTML on empty inbox` added and verified passing.

### Defect 2: Document Handler Block in Telegram Bot
- **Symptom**: Sending a `.zip` file to deploy a static website was ignored or failed to trigger the deployment parser.
- **Root Cause**:
  `bot.on(['photo', 'video', 'document', 'animation'])` was registered before `bot.on('document')`. Inside its wrapper, if the user was not an admin in active broadcast mode, the handler returned without calling `next()`. In Telegraf, unhandled middleware without `next()` terminates update processing, starving the document upload handler.
- **Remediation**:
  Updated the handler to accept `next` and return `if (typeof next === 'function') return next();`.
- **Verification**: Regression test `wrap middleware preserves and invokes next() callback` added and verified passing.

### Defect 3: Multi-Tenant Isolation Flaw in Applications Module
- **Symptom**: Applications in `/applications` lacked user ownership filtering. Any authenticated user could list, view environment secrets, deploy, restart, rollback, or delete applications created by another user.
- **Root Cause**:
  The `applications` table lacked a `user_tg_id` column. Neither `listApplications` nor `getApplicationById`, `updateApplication`, or `deleteApplication` enforced ownership checks against `req.tgId`.
- **Remediation**:
  1. Created migration `018_applications_user_isolation.sql` adding `user_tg_id INTEGER` and index `idx_applications_user`.
  2. Updated `createApplication` to record `user_tg_id`.
  3. Enforced `checkApplicationOwnership` across all application service and API functions (`list`, `get`, `update`, `deploy`, `rollback`, `control`, `delete`). Non-admins receive `403 Forbidden` if attempting to access another user's project.
- **Verification**: Automated test `enforces strict multi-tenant isolation` added and passing in `tests/services/applicationsAndBackups.test.js`.

### Defect 4: Unrestricted Destructive Shell Commands on Remote Nodes
- **Symptom**: `executeNodeCommand` accepted arbitrary shell input without validation against destructive patterns.
- **Root Cause**:
  Commands submitted via `POST /api/hosting/nodes/:id/exec` were passed directly to SSH `conn.exec()`. While restricted to administrators, an accidental or malicious payload (such as `rm -rf /` or `mkfs`) could wipe a provisioned node.
- **Remediation**:
  Added `FORBIDDEN_NODE_COMMANDS` regex allowlist/blocklist in `nodeManagerService.js` rejecting recursive root removals, filesystem formats, fork bombs, and raw device writes.
- **Verification**: Unit tests added in `tests/services/nodeSecurityAndEnrollment.test.js` validating command rejection.

### Defect 5: Broadcast Workflow Error History & Resolution
- **Symptom**: Entering an announcement previously produced a generic Arabic error.
- **Root Cause**:
  In historical log `logs/error-2026-10-21.log`, `promptBroadcastPreview` failed with `broadcastConfirmKeyboard is not defined` because the keyboard builder was unimported. The generic error wrapper caught the exception and displayed `t('error.generic')`.
- **Remediation**:
  Imported `broadcastConfirmKeyboard`, added entity HTML conversion, duplicate send locks, and comprehensive mock tests.
- **Verification**: Tested in `tests/bot/broadcast_and_i18n.test.js` covering successful delivery, invalid input, rate limiting retries, and blocked user handling.

---

## 4. Security Findings & Hardening

1. **Password & Secret Storage**:
   - Node SSH credentials, private keys, and application environment variables are encrypted at rest using AES-256-GCM with PBKDF2/SHA-256 key derivation.
   - Session tokens are stored strictly as SHA-256 hashes; raw tokens are never persisted.
2. **HTML & Email Sanitization**:
   - Email bodies are cleaned with `sanitize-html`, stripping scripts, iframes, trackers, and malicious URI schemes (`javascript:`, `data:`).
   - Links receive `rel="noopener noreferrer nofollow" target="_blank"`.
3. **Malware & File Upload Protection**:
   - Uploaded archives are inspected by `fileScannerService.js` for blocked executable extensions (`.exe`, `.dll`, `.sh`, `.elf`) and known malicious signatures (crypto miners, webshells, reverse shells).
4. **Network & Headers**:
   - Helmet sets strict security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, and HSTS.

---

## 5. Performance & Resource Baseline

- **Process Memory Footprint**:
  - API (PM2 ID 0): ~119 MB RAM
  - Web (PM2 ID 1): ~112 MB RAM
  - Bot (PM2 ID 5): ~77 MB RAM
  - Total system RAM utilization: < 8% of host capacity.
- **Database Performance**:
  - SQLite WAL mode ensures zero read locks during writes.
  - Query latency for paginated email and application lookups is < 2ms with indexed foreign keys.
- **Frontend Optimization**:
  - Static generation of 19 dashboard routes with Next.js App Router.
  - First Load JS shared by all pages: 87.3 kB.

---

## 6. Recommendations & Roadmap

1. **CI Automation**: Wire GitHub Actions workflow running `npm test` and `cd web && npm run build` on every pull request.
2. **DNS Provider Expansion**: Extend `DnsManager` with native Route53 and Namecheap integrations beyond existing Cloudflare and Manual providers.
3. **Containerized Workloads**: When infrastructure warrants, add optional Docker container runner alongside existing PM2 application execution.
