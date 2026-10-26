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
- **Controlled Deployment Jobs**: Track deployment build logs, execution runtimes, and commit hashes.
- **Health Checks & Rollback**: Monitor HTTP endpoints and quickly restore previous successful releases.

### 6. 💾 Verified Backups & Disaster Recovery
- **Database Snapshots**: Online SQLite WAL-safe hot backups.
- **Configuration & Route Archives**: Zip archives of active platform configs, routes, and metadata.
- **Integrity Verification**: Automatic SQLite header validation and byte-size checks before confirming backups as healthy.
- **Retention Policies**: Configurable retention periods and automated pruning.
- **Safe Restore Workflows**: Confirmation gates and pre-restore safety snapshots.

### 7. 🛡️ Enterprise Security & Auditing
- **RBAC & Token Security**: Role-based access control (Admin / Developer) and HMAC/JWT sessions.
- **Secret Redaction**: Zero credential exposure in frontend payloads, logs, or error responses.
- **Comprehensive Audit Trail**: Every sensitive operation (node addition, DNS mutation, route update, deployment) is recorded in immutable audit logs.

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js**: v20.x or v22.x LTS
- **Nginx**: v1.18+ (optional for native proxy generation)
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
- `BASE_URL` (e.g. `http://localhost:3000`)
- `CLOUDFLARE_API_TOKEN` (optional for automated DNS management)

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
| `POST` | `/api/subdomains/wizard/preview` | Preview planned DNS, proxy, and TLS changes |
| `POST` | `/api/subdomains/wizard/deploy` | Atomic deploy of subdomain route & DNS |
| `POST` | `/api/subdomains/:id/verify` | Multi-stage verification (DNS, Route, HTTPS) |
| `GET` | `/api/applications` | List applications with health & deployment state |
| `POST` | `/api/applications` | Create application record |
| `POST` | `/api/applications/:id/deploy` | Trigger Git deployment job |
| `GET` | `/api/monitoring/overview` | Real aggregate metrics across nodes and services |
| `GET` | `/api/backups` | List verified database and config backups |
| `POST` | `/api/backups` | Trigger on-demand verified backup |

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
