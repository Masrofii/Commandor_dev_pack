# Commandor Dev Pack — System Architecture

**Version:** 1.0.0  
**Target Architecture:** Self-Hosted Cloud Platform & Developer Hub  

---

## 1. System Components

Commandor Dev Pack is organized into modular subsystems:

```
┌─────────────────────────────────────────────────────────────┐
│                    Commandor Dev Pack                       │
├─────────────────┬───────────────────┬───────────────────────┤
│    Frontend     │     Backend       │     Infrastructure    │
│  Next.js 14 Web │  Express REST API │  Nginx Reverse Proxy  │
│  Telegram Bot   │  WebSocket Alerts │  SSH2 Remote Nodes    │
│  PWA / Mobile   │  Background Jobs  │  SQLite Database(WAL) │
└─────────────────┴───────────────────┴───────────────────────┘
```

### 1.1 Ingress & Routing
- **Nginx Reverse Proxy**: Receives HTTP/HTTPS traffic on ports 80/443. Terminates TLS or passes to dynamic upstream blocks generated in `/nginx/routes/*.conf`.
- **API Server (`server.js`)**: Runs on port 3000 (Express).
- **Web Frontend (`web/`)**: Runs on port 3001 (Next.js App Router).
- **Subdomain Web Router (`src/api/subdomainWebRouter.js`)**: Matches incoming `Host` headers to registered subdomains and proxies or renders custom responses.

### 1.2 Authentication & Authorization Layer
- **Telegram Auth**: Single-use cryptographic login tokens (`/login` command in bot) exchanged for web sessions.
- **Web Sessions**: Cryptographically random 32-byte session tokens stored as SHA-256 hashes in `web_sessions` with sliding expiration.
- **API Keys**: Bearer keys (`tmk_...`) with granular permission scopes (`emails:read`, `aliases:read`, `apps:manage`, `subdomains:manage`, etc.).
- **RBAC**: Centralized `requireAuth`, `requireAdmin`, and `requireApiKey` middleware.

### 1.3 Database & Storage
- **Primary Database**: SQLite 3 using WAL (Write-Ahead Logging) mode, synchronous=NORMAL, 64MB memory cache, and strict foreign key constraints.
- **Migrations Engine**: Sequential SQL scripts in `database/migrations/` tracked in `migrations` table.
- **Physical Storage Drivers**: Local filesystem or S3-compatible storage with separate quota accounting for email versus hosting files.

---

## 2. Data Flow Pipelines

### 2.1 Inbound Email Processing Pipeline
```
[Cloudflare Email Routing / Postfix]
                 │
                 ▼
     [POST /api/incoming]
                 │
                 ├──► 1. Disk & User Quota Check (HTTP 507 if full)
                 ├──► 2. MIME Parsing (mailparser) & RFC822 EML Store
                 ├──► 3. DNS Auth (SPF, DKIM, DMARC evaluation)
                 ├──► 4. Spam Scoring & Heuristic Keyword Detection
                 ├──► 5. HTML Sanitization (sanitize-html)
                 ├──► 6. Attachment Extraction & Malware Signature Scan
                 ├──► 7. Database Persistence (emails, attachments, FTS)
                 └──► 8. Real-time Push Notification (Telegram Bot & WebSocket)
```

### 2.2 Application Deployment Pipeline
```
[User initiates deploy via Dashboard / Bot]
                 │
                 ▼
    [POST /api/applications/:id/deploy]
                 │
                 ├──► 1. Multi-tenant Authorization Gate
                 ├──► 2. Update status to 'deploying'
                 ├──► 3. Fetch/Clone Git Repository
                 ├──► 4. Run Build Command in sandbox
                 ├──► 5. Execute Start Command on allocated Port
                 ├──► 6. Probe HTTP Health Endpoint (/health)
                 └──► 7. Record commit history & stream logs
```
