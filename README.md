# 🛡️ Commandor Mail — Self-Hosted Temporary Email & Alias Platform

**Commandor Mail** is an enterprise-grade, self-hosted temporary email and alias management system. It combines a Next.js 14 web dashboard, a full-featured Telegram bot, Cloudflare Email Routing integration, and multi-node SSH hosting orchestration.

---

## ✨ Features

- **🌐 Dual-Interface Control**:
  - **Modern Web Dashboard**: Built with Next.js 14 App Router, Tailwind CSS, Dark/Light theme, and live WebSocket updates.
  - **Telegram Bot**: Rich inline menus, session-free onboarding, TOS acceptance, broadcast messaging, and multi-language support.
- **✉️ Email Infrastructure**:
  - Cloudflare Email Worker integration for near-instant message parsing and routing.
  - Unlimited custom aliases and subdomains (`user@sub.domain.com`).
  - Threading, labels, attachments, spam scoring, auto-responders, and webhook forwarders.
- **🖥️ Multi-Node Server Hosting & SSH Management**:
  - Cluster inventory management with real-time specs (vCPU, RAM, free disk).
  - Bulk SSH import (`host:port:user:pass`) with parallel worker pool provisioning.
  - Nginx configuration generation and multi-site runner deployment.
- **🌍 Internationalization (i18n)**:
  - 12 supported languages including English, Arabic (with native RTL support), Spanish, French, German, Russian, Chinese, Turkish, Hindi, Urdu, Portuguese, and Indonesian.
- **🔒 Enterprise Security**:
  - Rate limiting, CSRF protection, two-factor authentication (2FA), API keys, and audit logging.
  - Zero sensitive credentials committed; environment-driven configuration.

---

## 🏗️ Architecture

```
                                  ┌───────────────────────────┐
                                  │   Inbound Email Traffic   │
                                  └─────────────┬─────────────┘
                                                │
                                                ▼
                                  ┌───────────────────────────┐
                                  │ Cloudflare Email Routing  │
                                  │    + Cloudflare Worker    │
                                  └─────────────┬─────────────┘
                                                │ POST /api/incoming
                                                ▼
                              ┌───────────────────────────────────┐
                              │    Commandor Mail Backend API     │
                              │       (Node.js / Express)         │
                              └───────┬───────────────────┬───────┘
                                      │                   │
                     ┌────────────────┴─────┐       ┌─────┴────────────────┐
                     ▼                      ▼       ▼                      ▼
           ┌───────────────────┐   ┌─────────────────┐   ┌───────────────────────┐
           │ Next.js Dashboard │   │  Telegram Bot   │   │ Multi-Node SSH Runner │
           │   (Port 3001)     │   │ (Long Polling)  │   │  (Remote Clusters)    │
           └───────────────────┘   └─────────────────┘   └───────────────────────┘
```

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js**: v18.0.0 or later (v20+ / v22 recommended)
- **SQLite3** / Python / Build tools for native modules

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

### 3. Environment Setup
Copy the example environment configuration:
```bash
cp .env.example .env
```
Fill in your configuration variables in `.env`:
- `JWT_SECRET`: Random 32+ character string
- `TELEGRAM_BOT_TOKEN`: Token obtained from [@BotFather](https://t.me/BotFather)
- `ADMIN_TELEGRAM_ID`: Your Telegram User ID
- `BASE_URL`: Public domain URL of the API

### 4. Database Migrations
Initialize the SQLite schema:
```bash
npm run migrate
```

### 5. Build & Run
```bash
# Build the Next.js frontend
npm run build

# Start with PM2
pm2 start ecosystem.config.js
```

---

## 🧪 Testing

Run the full automated test suite (database migrations, spam scoring, sessions, audit logging, bulk SSH provisioning, and i18n):

```bash
npm test
```

---

## 📜 License

MIT License. See [LICENSE](LICENSE) for details.
