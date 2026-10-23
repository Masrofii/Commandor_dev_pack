# Commandor Dev Pack — REST API Reference

The Commandor Dev Pack platform exposes a RESTful JSON API on port 3000 (`/api/*`).

---

## 1. Authentication

Endpoints accept authentication via:
1. **Bearer Session Token**: `Authorization: Bearer <session_token>` (obtained from `/api/auth/login`).
2. **API Key**: `Authorization: Bearer tmk_<key>` (generated from the API Keys dashboard).

### Error Response Format
All errors return standard JSON:
```json
{
  "error": "Human-readable description of error",
  "requestId": "req_abc123"
}
```

---

## 2. Core Endpoints Summary

### Authentication
- `POST /api/auth/login` — Exchange one-time Telegram token for web session
- `GET /api/auth/config` — Public platform metadata and bot username
- `PATCH /api/auth/profile` — Update language and timezone preferences

### Emails & Ingestion
- `GET /api/emails` — List received emails with pagination, filter, and FTS
- `GET /api/emails/:id` — Get email content and attachment metadata
- `GET /api/emails/:id/eml` — Download raw RFC822 EML message
- `DELETE /api/emails/:id` — Soft-delete email and reclaim storage quota
- `POST /api/incoming` — Webhook/SMTP ingestion endpoint

### Aliases
- `GET /api/aliases` — List user aliases
- `POST /api/aliases` — Create a new custom or random alias
- `POST /api/aliases/burner` — Generate a 1-hour auto-expiring burner address
- `GET /api/aliases/:address/qr` — Generate QR code image for alias
- `DELETE /api/aliases/:address` — Delete an alias

### Applications & Git Deployments
- `GET /api/applications` — List user's applications
- `POST /api/applications` — Create a new application tracking Git repository
- `GET /api/applications/:id` — Application details, port, and health status
- `PUT /api/applications/:id` — Update application settings
- `POST /api/applications/:id/deploy` — Trigger deployment execution
- `POST /api/applications/:id/rollback` — Rollback to a previous release commit
- `POST /api/applications/:id/control` — Lifecycle control (`start`, `stop`, `restart`)
- `DELETE /api/applications/:id` — Delete application and release ports

### Subdomains & Reverse Proxy
- `GET /api/subdomains` — List user claimed subdomains
- `POST /api/subdomains` — Claim a subdomain with email/web routing
- `PUT /api/subdomains/:id` — Update reverse proxy destination or static content
- `DELETE /api/subdomains/:id` — Delete subdomain and unlink proxy routes

### VPS Nodes Management (Admin)
- `GET /api/hosting/nodes` — List enrolled VPS nodes and telemetry
- `POST /api/hosting/nodes` — Enroll a new VPS node with encrypted credentials
- `POST /api/hosting/nodes/:id/ping` — Live ping and specs verification
- `POST /api/hosting/nodes/:id/exec` — Execute diagnostic shell command (allowlist-checked)
- `DELETE /api/hosting/nodes/:id` — Safe delete unallocated node

### Backups (Admin)
- `GET /api/backups` — List backup snapshots
- `POST /api/backups` — Trigger immediate backup (`database` or `full`)
- `POST /api/backups/:id/verify` — SHA-256 and header integrity verification
- `POST /api/backups/:id/test-restore` — Dry-run sandbox restoration check
