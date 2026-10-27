# Changelog

All notable changes to the Commandor Dev Pack platform are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased] - 2026-10-26

### Added
- **Local Administrator Login**: Optional bcrypt-backed username/password sign-in (`/api/auth/local/login`) with automatic admin bootstrap, login rate limiting, audit logging, and a Telegram-free dashboard login form.
- **Real Application Runner**: `APP_RUNNER=local` clones/fetches Git repositories, installs dependencies, runs builds, starts detached processes, captures stdout/stderr, health-checks deployments, and supports start/stop/restart/rollback and runtime log viewing. `APP_RUNNER=mock` remains available for tests and demos.
- **Application Runtime API/UI**: `GET /api/applications/:id/logs` plus a runtime-log modal in the applications dashboard.
- **Backup Lifecycle Controls**: Tiered retention, prune endpoint/button, verified database restore from database or full archives, pre-restore safety snapshots recorded as recovery points, protected deletion of the newest backup, and millisecond-unique backup filenames. Full archives keep Nginx routes and configuration for manual recovery; automatic restore applies the database only.
- **SSRF Guard**: Outbound webhook and routing URLs are checked against private, loopback, link-local, metadata, 6to4, Teredo, and IPv4-mapped IPv6 addresses.
- **Pending Proxy Mode**: `PROXY_MODE=auto|pending|nginx`; missing Nginx stores route files with pending status instead of falsely reporting an active proxy.
- **Configuration Validation**: Production refuses insecure default secrets and requires encryption plus at least one login method; startup logs actionable warnings.
- **CI Workflow**: GitHub Actions installs backend/frontend dependencies, runs Jest, and builds the Next.js dashboard.

### Fixed
- Removed fabricated `commandor.my.id` and server-IP fallbacks from API, bot, and dashboard flows; base domains now come from `DOMAINS`/`DEFAULT_DOMAIN` plus the tenant's verified custom domains.
- Enforced tenant ownership on subdomain verify/repair/delete/request inspection and hosting site deletion, including admin-aware projections.
- Fixed backup retention pruning that retained every row and backup filename collisions within the same second.
- Fixed local webhook fetches following redirects and bypassing SSRF checks.
- Made monitoring overview/topology/host endpoints admin-only and hid admin-only navigation from non-admin users.
- Fixed export downloads to include the authenticated session token.
- Added missing translations for local login and wired bot messages to the configured primary domain.
- Replaced hardcoded CORS IP/product-domain wildcards with `CORS_ORIGINS`, `WEB_URL`, and `BASE_URL`; localhost is only auto-allowed outside production.
- New applications default to port `8080`; ports `80`, `443`, the API port, and the dashboard port are rejected, and the runner verifies port availability before spawning.
- Failed deployments or rollbacks no longer orphan or untrack a still-running previous version; its PID and `running` status are preserved.
- Added HTTPS-upstream SNI (`proxy_ssl_server_name`/`proxy_ssl_name`) and default `:443` to generated Nginx configs.
- Pre-restore safety snapshots use millisecond timestamps, preventing filename collisions.
- Clarified in the dashboard that restoring a full archive applies only its database, not Nginx routes or configuration files.
- Fixed configuration validation test environment isolation when a local `.env` exists on the host filesystem.

### Changed
- Upgraded `better-sqlite3` to `^13.0.0` for Node 22/24 compatibility.
- Removed unused dependencies (`freebuff`, `express-session`, `node-forge`).
- Increased the general API rate limit to 600/15 min while keeping login attempts at 20/15 min and incoming mail at 120/min.
- Sanitized localized example addresses to use `example.com` instead of a specific operator domain.

### Added
- **Multi-Tenant Applications Isolation**: Migration `018_applications_user_isolation.sql` introducing `user_tg_id` to `applications` table and indexing for user-scoped security.
- **Node Remote Command Defense**: Implemented `FORBIDDEN_NODE_COMMANDS` pattern filter in `nodeManagerService.js` blocking destructive commands (`rm -rf /`, `mkfs`, fork bombs).
- **Comprehensive Documentation Suite**:
  - `docs/ENGINEERING_AUDIT.md`: Complete audit, root cause analyses, and baseline measurements.
  - `docs/INTERNATIONALIZATION.md`: 12-language catalog architecture, fallback cascade, and RTL guide.
  - `docs/ARCHITECTURE.md`: Subsystem overview and data flow diagrams.
  - `docs/DEPLOYMENT.md`: Step-by-step production installation and update guides.
  - `docs/CONFIGURATION.md`: Exhaustive environment variable reference.
  - `docs/SECURITY.md`: Threat model, multi-tenant isolation, and vulnerability reporting.
  - `docs/BACKUP_AND_RESTORE.md`: Automated backups, verification, and sandbox test restores.
  - `docs/API.md`: Comprehensive REST API endpoint reference.
  - `docs/TROUBLESHOOTING.md`: Operational incident response runbook.
- **Automated Regression Tests**:
  - Empty inbox HTML parse mode formatting verification.
  - Middleware `next()` delegation verification for document uploads.
  - Applications tenant isolation unit and integration test suite.
  - Destructive remote node command rejection tests.

### Fixed
- **Telegram Empty Inbox Literal HTML**: Fixed bug where tapping "Inbox" displayed literal HTML tags (`📭 <b>Inbox is empty.</b>`) when invoked as a text command or reply keyboard button.
- **Telegram Document Upload Pass-Through**: Repaired middleware starvation where non-broadcast document uploads failed to reach the static site ZIP deployment handler.
- **Application Cross-Tenant Access**: Resolved authorization vulnerability where non-admin users could view, edit, deploy, control, or delete applications owned by other users.
- **RTL Technical Field Layout**: Enforced `direction: ltr; unicode-bidi: isolate;` on email, phone, and technical input fields in Arabic and Urdu interfaces.
- **Translation File Synchronization**: Synchronized all 12 language catalogs across `src/i18n/locales/` and `web/i18n/`.
