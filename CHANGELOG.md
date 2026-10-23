# Changelog

All notable changes to the Commandor Dev Pack platform are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-10-23

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
