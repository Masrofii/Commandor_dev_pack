# Commandor Dev Pack — Configuration Reference

This document details all configuration options for Commandor Dev Pack. All settings can be provided via environment variables in the `.env` file or host environment.

---

## 1. Core Server Settings

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | String | `development` | Runtime environment (`development`, `production`, `test`) |
| `PORT` | Integer | `3000` | Port for Express REST API |
| `WEB_PORT` | Integer | `3001` | Port for Next.js web application |
| `WEB_URL` | String | `http://localhost:3001` | Publicly accessible URL of the web dashboard |
| `DOMAINS` | String | `commandor.my.id` | Comma-separated list of active email/subdomain base domains |
| `DATABASE_PATH` | String | `./data/app.db` | Filesystem path to SQLite database file |

---

## 2. Security & Cryptography

| Variable | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `SESSION_SECRET` | String | **Yes** | Secret key used for signing session identifiers |
| `JWT_SECRET` | String | **Yes** | Secret key for signing web tokens |
| `ENCRYPTION_KEY` | String (64 hex) | **Yes** | 256-bit hexadecimal key used to encrypt node credentials and env vars at rest |
| `CORS_ORIGINS` | String | `""` | Comma-separated allowed external origins |

> [!CAUTION]
> The `ENCRYPTION_KEY` must be a 64-character hexadecimal string. Do not lose this key: losing it will make stored node credentials unrecoverable.

---

## 3. Telegram Bot Configuration

| Variable | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `TELEGRAM_BOT_TOKEN` | String | **Yes** | Bot API token provided by `@BotFather` |
| `TELEGRAM_ADMIN_ID` | String/Int | **Yes** | Numeric Telegram ID of the platform owner/super-admin |
| `TELEGRAM_BOT_USERNAME` | String | Optional | Bot username e.g. `CommandorDevBot` |

---

## 4. Quotas & Capacity Controls

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `DEFAULT_EMAIL_STORAGE_MB` | Integer | `1024` | Default user mailbox quota (1 GB) |
| `DEFAULT_HOSTING_STORAGE_MB` | Integer | `5120` | Default user website/apps hosting quota (5 GB) |
| `MAX_ATTACHMENT_SIZE_MB` | Integer | `25` | Maximum allowable single email attachment size |
| `MAX_ALIASES_PER_USER` | Integer | `50` | Maximum count of active aliases for free tier users |
