# 🛡️ Commandor Dev Pack

> **Modern Self-Hosted Developer, Infrastructure & Domain Management Platform**

Commandor Dev Pack transforms multi-cloud, VPS, and edge servers into a cohesive, secure, and developer-friendly control plane. From a unified dashboard, administrators and developers can add compute nodes, manage domain inventories, deploy applications, configure subdomains through an 8-step wizard, automate DNS and reverse proxy routes with zero downtime and automatic rollback, and orchestrate verified backups.

---

## 🏗️ System Architecture

```
                                  ┌──────────────────────────┐
                                  │      Incoming Traffic    │
                                  └─────────────┬────────────┘
                                                │
                                                ▼
                        ┌───────────────────────────────────────────────┐
                        │      Authoritative DNS / Cloudflare DNS       │
                        │        (Scoped API Tokens + Fallback)         │
                        └───────────────────────┬───────────────────────┘
                                                │
                                                ▼
                        ┌───────────────────────────────────────────────┐
                        │        Safe Nginx Reverse Proxy & TLS         │
                        │    (Syntax Validated, Backups & Rollback)     │
                        └───────┬───────────────────────────────┬───────┘
                                │                               │   
                ┌───────────────┴──────────────┐ ┌──────────────┴──────────────┐
                ▼                              ▼ ▼                             ▼
      ┌──────────────────┐           ┌──────────────────┐            ┌──────────────────┐
      │  Next.js 14 App  │           │   Commandor API  │            │  Deployed Apps   │
      │    Dashboard     │           │   (Node/Express) │            │ (Node/Py/Docker) │
      │   (Port 3001)    │           │    (Port 3000)   │            │   (Node Ports)   │
      └──────────────────┘           └─────────┬────────┘            └──────────────────┘
                                               │
                                 ┌─────────────┴─────────────┐
                                 ▼                           ▼
                       ┌───────────────────┐       ┌───────────────────┐
                       │   SQLite WAL DB   │       │ Remote VPS Nodes  │
                       │ (AES-256 Storage) │       │ (SSH Host Verify) │
                       └───────────────────┘       └───────────────────┘
```

---

## ✨ Core Platform Capabilities

### 1. 🖥️ Multi-Node Server Management
- **Strict SSH Host Key Verification**: Prevents MITM attacks with fingerprint inspection and explicit host enrollment.
- **Non-Destructive Connection Testing**: Safely tests credentials and queries OS, vCPU count, memory, disk usage, and uptime without modifying remote filesystems or launching background daemons.
- **Encrypted Credential Storage**: All SSH private keys and passwords are encrypted at rest using AES-256-GCM.
- **Bulk Node Import & Validation**: Dry-run preview and duplicate detection for bulk node onboarding.
- **Lifecycle Controls**: Enable, disable, health-ping, and safely decommission nodes with site-dependency checks.

### 2. 🌐 Domain Inventory & DNS Provider Abstraction
- **Multi-Root Domain Inventory**: Add, manage, and verify custom root domains with separate tracking for DNS, routing, and certificates.
- **Pluggable DNS Provider Engine**:
  - **Cloudflare DNS**: Scoped API tokens with least-privilege permissions, automatic zone discovery, record lifecycle management, and rate-limit handling.
  - **Manual DNS**: Step-by-step authoritative record generation with copyable instructions.
- **DNS Propagation & Health Inspector**: Real-time Node.js asynchronous DNS resolution checks for A, AAAA, CNAME, TXT, MX, SPF, and DMARC records.
- **Conflict Prevention**: Pre-flight checks preventing destructive CNAME and apex record collisions.

### 3. 🧙 8-Step Subdomain Creation Wizard
A guided wizard that simplifies complex routing into an intuitive step-by-step workflow:
1. **Select Domain**: Choose from verified root domains in your inventory.
2. **Enter Subdomain**: RFC 1123 hostname syntax validation, duplicate collision detection, and reserved word checks.
3. **Choose Destination**:
   - Application running on a selected cluster node
   - Internal service and port (`127.0.0.1:PORT`)
   - External URL / upstream hostname
   - DNS-only record
   - Static site deployment
4. **Configure DNS**: Select record type (A/CNAME), calculate changes, and preview.
5. **Configure Routing**: Generate structured, injection-safe reverse proxy configuration.
6. **Enable HTTPS**: TLS certificate issuance, renewal tracking, and expiry reporting.
7. **Review & Deploy**: Atomic apply sequence with confirmation.
8. **Verify & Health Check**: Independent multi-stage verification (DNS resolution, routing reachability, and TLS handshake) with actionable remediation steps.

### 4. 🔄 Reverse Proxy & Safe Configuration Engine
- **Nginx Route Management**: Generates clean, isolated upstream and server blocks.
- **Syntax Validation Pre-Flight**: Validates candidate configurations before touching active server processes.
- **Automatic Snapshot & Rollback**: Creates a timestamped configuration backup before every modification; automatically restores the last-known-good configuration if a reload fails.
- **Graceful Zero-Downtime Reloads**: Reloads workers smoothly without dropping live HTTP connections.

### 5. 🚀 Developer Platform & Application Deployments
- **Application Inventory**: Git repository tracking, branch selection, and port allocation.
- **Environment & Secret Management**: Store application environment variables securely encrypted with automated masking in API responses.
- **Real Local Runner**: Clone/fetch the repository, install dependencies, run the build, start a supervised process, and verify health (`APP_RUNNER=local`).
- **Honest Simulated Mode**: `APP_RUNNER=mock` keeps deterministic demo deployments for tests and tours, with clearly labelled simulated logs.
- **Runtime Control & Logs**: Start, stop, restart, inspect captured stdout/stderr, and roll back to a recorded commit.
- **Safety Gate**: Local execution is admin-only unless `APP_ALLOW_USER_DEPLOYMENTS=true`; build and start commands run with the API process's privileges.

### 6. 💾 Verified Backups & Disaster Recovery
- **Database Snapshots**: Online SQLite WAL-safe hot backups with millisecond-unique names.
- **Full System Archives**: A single ZIP containing the verified database, Nginx routes, configuration examples, package metadata, and migrations.
- **Deep Verification**: Checksum, SQLite header, `integrity_check`, and isolated dry-run restore tests.
- **Tiered Retention**: Keep recent backups, daily/weekly recovery points, the newest backup, and pre-restore safety snapshots.
- **Safe Restore Workflows**: Confirmation gates, automatic pre-restore snapshot, and protected deletion of the newest recovery point.
- **Lifecycle Controls**: Verify, test-restore, download, restore, prune, and delete from the dashboard or API.

### 7. 🛡️ Enterprise Security & Auditing
- **RBAC & Token Security**: Role-based access control (Admin / Developer) and HMAC/JWT sessions.
- **Local Administrator Login**: Optional bcrypt-backed username/password sign-in for installations that do not use Telegram, with rate limiting and audit logging.
- **SSRF Protection**: Outbound webhook and routing URLs are resolved and checked against private, loopback, link-local, metadata, 6to4, and IPv4-mapped IPv6 ranges.
- **Secret Redaction**: Zero credential exposure in frontend payloads, logs, or error responses.
- **Production Validation**: Startup refuses insecure default secrets in production and warns about risky runner/domain settings.
- **Comprehensive Audit Trail**: Every sensitive operation (node addition, DNS mutation, route update, deployment, login) is recorded in immutable audit logs.

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js**: v22.x or newer (tested on Node 22 and 24; required by `better-sqlite3` 13)
- **Nginx**: v1.18+ (optional with `PROXY_MODE=auto`; missing Nginx stores pending route files)
- **Git**: Required only for real application deployments
- **OpenSSL**: For cryptographic secret generation

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/Masrofii/Commandor_dev_pack.git
cd Commandor_dev_pack

# Install backend dependencies
npm install

# Install frontend dependencies
cd web && npm install && cd ..
```

### 3. Environment Configuration
```bash
cp .env.example .env
```
Generate your security keys:
```bash
# Generate 32-byte hex keys for JWT and AES-256 encryption
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
```
Edit `.env` and fill in:
- `JWT_SECRET`
- `ENCRYPTION_KEY`
- `SESSION_SECRET`
- `BASE_URL` (e.g. `http://localhost:3000`)
- `WEB_URL` (e.g. `http://localhost:3001`)
- `DOMAINS` and `DEFAULT_DOMAIN` (required for aliases and subdomain routing)
- `CLOUDFLARE_API_TOKEN` (optional for automated DNS management)

#### Sign in without Telegram
To use the dashboard without a Telegram bot, set a local administrator password:

```bash
# Generate a strong password and add it to .env
LOCAL_AUTH_ENABLED=true
LOCAL_ADMIN_USERNAME=admin
LOCAL_ADMIN_PASSWORD=<strong-random-password>
LOCAL_ADMIN_TG_ID=900000001
```

At startup the account is created (or its password synchronized) with the `admin`
role. The login page automatically offers the username/password form. Successful
and failed attempts are rate-limited and written to the audit log.

> **Upgrading note:** production now requires `SESSION_SECRET`, `JWT_SECRET`,
> `ENCRYPTION_KEY`, and at least one login method (`TELEGRAM_BOT_TOKEN` or
> `LOCAL_ADMIN_PASSWORD`). Missing values fail fast instead of silently using
> insecure defaults.

#### Application runner
`APP_RUNNER=local` is the default and performs real Git/install/build/process
supervision on the host. Because this is equivalent to granting shell access:

- keep local deployments admin-only (default), or explicitly set
  `APP_ALLOW_USER_DEPLOYMENTS=true` only on a trusted single-tenant host;
- use `APP_RUNNER=mock` for demos and tests;
- prefer a container or dedicated VM for untrusted repositories.

`PROXY_MODE=auto` validates and reloads system Nginx when available. If Nginx is
not installed, generated routes are stored with `pending` status so an external
reloader can apply them later. Use `PROXY_MODE=nginx` to require Nginx, or
`PROXY_MODE=pending` to always render without reloading.

### 4. Run Migrations
```bash
npm run migrate
```

### 5. Run Tests
```bash
npm test
```

### 6. Build & Launch

#### Development Mode:
```bash
# Terminal 1: Backend API
npm run dev

# Terminal 2: Web Dashboard
cd web && npm run dev
```

#### Production Mode with PM2:
```bash
# Build frontend
npm run build

# Start services
pm2 start ecosystem.config.js
```

---

## ⚙️ REST API Endpoints Overview

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/hosting/nodes/test` | Test SSH connection and query specs without modifying node |
| `GET` | `/api/hosting/nodes` | List all managed nodes with resource metrics |
| `POST` | `/api/hosting/nodes` | Enroll node with verified credentials and host key |
| `POST` | `/api/hosting/nodes/:id/ping` | Live latency and connectivity test |
| `POST` | `/api/hosting/nodes/:id/provision` | Explicit action to provision hosting runners |
| `GET` | `/api/domains` | List domain inventory with DNS & TLS statuses |
| `POST` | `/api/domains` | Add domain to inventory |
| `GET` | `/api/domains/:id/health` | Comprehensive DNS & authoritative health check |
| `POST` | `/api/auth/local/login` | Username/password login when local auth is enabled |
| `GET` | `/api/auth/config` | Available login methods and platform branding |
| `POST` | `/api/subdomains/wizard/preview` | Preview planned DNS, proxy, and TLS changes |
| `POST` | `/api/subdomains/wizard/deploy` | Atomic deploy of subdomain route & DNS |
| `POST` | `/api/subdomains/:id/verify` | Multi-stage verification (DNS, Route, HTTPS) |
| `GET` | `/api/applications` | List applications with health & deployment state |
| `POST` | `/api/applications` | Create application record |
| `POST` | `/api/applications/:id/deploy` | Trigger a local or simulated deployment job |
| `POST` | `/api/applications/:id/control` | Start, stop, or restart a local process |
| `GET` | `/api/applications/:id/logs` | Read recent runtime stdout/stderr |
| `GET` | `/api/monitoring/overview` | Admin-only aggregate metrics across nodes and services |
| `GET` | `/api/backups` | Admin-only list of verified database and full backups |
| `POST` | `/api/backups` | Trigger an on-demand verified backup |
| `POST` | `/api/backups/prune` | Apply the retention policy now |
| `DELETE` | `/api/backups/:id` | Delete a backup (newest requires `force=true`) |

---

## 🤝 Community & Contributing

We welcome community contributions! Please review our community guidelines before submitting code:

- **[Contributing Guide](CONTRIBUTING.md)**: Development prerequisites, setup guide, branch naming conventions, localization rules, and testing standards.
- **[Code of Conduct](CODE_OF_CONDUCT.md)**: Standards for a respectful, inclusive, and welcoming community.
- **[Security Policy](SECURITY.md)**: Vulnerability disclosure guidelines, supported release branches, and safe reporting procedures.
- **[Accessibility Statement](ACCESSIBILITY.md)**: Keyboard accessibility, screen-reader support, color contrast, and RTL layout design.

---

## 👑 Credits & Attribution

- **Project Owner & Creator**: [@xpT_T](https://t.me/xpT_T)
- **Project Contributor**: [fut0r](https://github.com/fut0r)
- **Official Telegram Bot**: [@CommandorDevBot](https://t.me/CommandorDevBot)
- **Platform**: **Commandor Dev Pack** — Modern Self-Hosted Infrastructure, Domain & Developer Management Platform
- **GitHub Repository**: [Masrofii/Commandor_dev_pack](https://github.com/Masrofii/Commandor_dev_pack)

Special thanks to **@xpT_T** for stewardship, product design, and architectural vision of the Commandor platform.

Special thanks also to **fut0r** for contributing and fixing bugs.

---

## 📄 License
MIT © Commandor Dev Pack Contributors. Licensed under MIT.
