# Commandor Dev Pack — Configuration Reference

All settings are read from environment variables (or a local `.env` file). The
server refuses to start in production when a required secret is missing or
still set to an unsafe default.

> Requires Node.js 22 or newer (`better-sqlite3@13`).

---

## 1. Core Server

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | String | `production` | Runtime environment: `production`, `development`, or `test` |
| `PORT` | Integer | `3000` | Port for the Express REST API |
| `WEB_PORT` | Integer | `3001` | Port for the Next.js dashboard |
| `BASE_URL` | String | `http://localhost:3000` | Public URL of the API (used in links and callbacks) |
| `WEB_URL` | String | `http://localhost:3001` | Public URL of the web dashboard |
| `DATABASE_PATH` | String | `./data/app.db` | SQLite database file |
| `TRUST_PROXY` | Integer | `1` | Number of reverse-proxy hops to trust for client IPs |
| `SERVER_PUBLIC_IP` | String | auto-detected | Public IP shown in DNS setup instructions |

`WEB_PORT` is only used by the web app, not by the API process.

---

## 2. Security & Cryptography

| Variable | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `SESSION_SECRET` | String | **Yes** (production) | Random secret used to sign session cookies |
| `JWT_SECRET` | String | **Yes** (production) | Random secret used to sign API tokens |
| `ENCRYPTION_KEY` | String | **Yes** (production) | Key used to encrypt SSH keys, DNS tokens, and application environment variables at rest |
| `SESSION_TTL_HOURS` | Integer | `168` | Web session lifetime in hours |
| `COOKIE_DOMAIN` | String | empty | Optional cookie domain override |
| `CORS_ORIGINS` | String | local dev URLs | Comma-separated list of allowed browser origins |
| `ALLOW_PRIVATE_OUTBOUND` | Boolean | `false` | Allow webhooks and external proxy targets to resolve to private/loopback addresses. Leave off on Internet-facing hosts. |
| `ADMIN_2FA_ISSUER` | String | `CommandorDevPack` | Issuer name shown in authenticator apps |

Generate secrets with `openssl rand -hex 32`. `ENCRYPTION_KEY` may be any
string of at least 16 characters; losing it makes encrypted credentials and
application environment variables unrecoverable.

---

## 3. Authentication

### Local password login (recommended default)

The local administrator works without a Telegram bot. The account is created
or updated at startup.

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `LOCAL_AUTH_ENABLED` | Boolean | `true` | Enable username/password login |
| `LOCAL_ADMIN_USERNAME` | String | `admin` | Local administrator username |
| `LOCAL_ADMIN_PASSWORD` | String | empty | Local administrator password. Required for password login; use a long random value. |
| `LOCAL_ADMIN_TG_ID` | Integer | `900000001` | Synthetic Telegram ID reserved for the local administrator. Do not reuse a real user's ID. |

### Telegram bot (optional)

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `TELEGRAM_BOT_TOKEN` | String | empty | BotFather token. Leave empty to run without Telegram. |
| `ADMIN_TELEGRAM_ID` | Integer | `0` | Numeric Telegram ID of the platform owner |
| `TELEGRAM_BOT_USERNAME` | String | `CommandorDevBot` | Bot username shown in the UI |
| `OWNER_USERNAME` | String | `xpT_T` | Owner handle displayed in About |

At least one login method (`LOCAL_ADMIN_PASSWORD` or `TELEGRAM_BOT_TOKEN`)
must be configured in production.

---

## 4. Domains & Inbound Email

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `DOMAINS` | String | empty | Comma-separated root domains for aliases and subdomains. No domain is enabled by default. |
| `DEFAULT_DOMAIN` | String | empty | Domain preselected in the UI; must be present in `DOMAINS` |
| `INCOMING_SECRET` | String | empty | Shared secret for inbound email ingestion. Ingestion is disabled while empty. |

Create MX records for the alias domains and point the Cloudflare Email Worker
at `POST /api/incoming/email` with the configured secret.

---

## 5. Quotas

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `MAX_ALIASES` | Integer | `5` | Maximum active aliases per user |
| `MAX_STORAGE_BYTES` | Integer | `104857600` | Per-user storage quota in bytes (100 MB) |
| `MAX_EMAIL_SIZE` | Integer | `10485760` | Maximum accepted email size in bytes (10 MB) |
| `MAX_ATTACHMENT_SIZE` | Integer | `5242880` | Maximum single attachment size in bytes (5 MB) |
| `MAX_WEBHOOKS` | Integer | `5` | Maximum webhooks per user |
| `MAX_API_KEYS` | Integer | `10` | Maximum API keys per user |
| `EMAIL_TTL_DAYS` | Integer | `7` | Inbox retention in days |
| `ALIAS_TTL_DAYS` | Integer | `30` | Inactive alias retention in days |
| `BURNER_TTL_MINUTES` | Integer | `60` | Burner alias lifetime in minutes |

---

## 6. Storage

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `STORAGE_DRIVER` | String | `local` | `local` or `r2` |
| `UPLOAD_DIR` | String | `./uploads` | Local attachment directory |
| `R2_ACCOUNT_ID` | String | empty | Cloudflare R2 account ID |
| `R2_ACCESS_KEY_ID` | String | empty | R2 access key |
| `R2_SECRET_ACCESS_KEY` | String | empty | R2 secret key |
| `R2_BUCKET` | String | empty | R2 bucket name |
| `R2_ENDPOINT` | String | empty | Optional custom S3-compatible endpoint |

---

## 7. Outbound Email (SMTP)

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `SMTP_HOST` | String | empty | SMTP relay host |
| `SMTP_PORT` | Integer | `587` | SMTP port |
| `SMTP_SECURE` | Boolean | `false` | Use implicit TLS (usually `true` for port 465) |
| `SMTP_USER` | String | empty | SMTP username |
| `SMTP_PASS` | String | empty | SMTP password |
| `SMTP_FROM` | String | `noreply@localhost` | From address for replies and forwarding |

---

## 8. Reverse Proxy & TLS

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `PROXY_MODE` | String | `auto` | `auto` validates/reloads system Nginx when available and otherwise stores a pending route; `pending` only writes route files; `nginx` fails when Nginx is unavailable, invalid, or cannot reload |
| `TLS_CERT_DIR` | String | `/etc/letsencrypt/live` | Certificate root. HTTPS routes use `<TLS_CERT_DIR>/<domain>/fullchain.pem` and `privkey.pem`. |

Generated routes are written to `nginx/routes/` and are ignored by Git. When a
certificate does not exist yet, the route is created HTTP-only and marked as
pending a certificate; request HTTPS only after the files are in place.

---

## 9. Application Runner

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `APP_RUNNER` | String | `local` (`mock` under `NODE_ENV=test`) | `local` clones, installs, builds, starts, and health-checks applications on this host. `mock` simulates deployments and is intended for tests/demos only. |
| `APP_DEPLOY_DIR` | String | `./data/apps` | Application workspace root |
| `APP_COMMAND_TIMEOUT_MS` | Integer | `600000` | Install/build command timeout |
| `APP_START_TIMEOUT_MS` | Integer | `45000` | Startup health-check timeout |
| `APP_ALLOW_USER_DEPLOYMENTS` | Boolean | `false` | Allow non-admin application owners to execute build/start commands. This is equivalent to granting shell access; leave off unless every user is trusted. |

The local runner executes commands as the API process user. It is not a
container sandbox. Build/start commands are single-line and run without the
server's secret environment variables, but they still have the host
permissions of that user.

New applications default to port `8080`. Ports `80`, `443`, `PORT` (API), and
`WEB_PORT` (dashboard) are reserved and rejected before a process starts. The
runner also verifies the selected port is free; a failed deployment before the
old process is stopped leaves the previous version running and tracked.

---

## 10. Logging, Backups & Monitoring

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `LOG_LEVEL` | String | `info` | Pino log level |
| `LOG_DIR` | String | `./logs` | Log directory (also contains per-app runtime logs) |
| `BACKUP_DIR` | String | `./backups` | Backup archive directory |
| `BACKUP_RETENTION_DAYS` | Integer | `14` | Keep all backups newer than this |
| `BACKUP_RETENTION_DAILY` | Integer | `7` | Keep one backup per day within this window |
| `BACKUP_RETENTION_WEEKLY` | Integer | `4` | Keep one backup per week within this window |
| `HEALTH_ALERT_DISK_PERCENT` | Integer | `90` | Disk usage alert threshold |
| `HEALTH_ALERT_MEMORY_PERCENT` | Integer | `90` | Memory usage alert threshold |
| `DISCORD_ALERT_WEBHOOK` | String | empty | Discord webhook for health alerts |
| `WEBHOOK_RETRY_LIMIT` | Integer | `5` | Outbound webhook retry attempts |
| `WEBHOOK_RETRY_BASE_DELAY_MS` | Integer | `5000` | Outbound webhook exponential-backoff base delay |

---

## 11. Optional Integrations

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `CLOUDFLARE_API_TOKEN` | String | empty | Scoped Cloudflare token used for DNS record automation |
| `GEOIP_ENABLED` | Boolean | `false` | Enable MaxMind GeoIP lookups |
| `GEOIP_DATABASE_PATH` | String | `./data/GeoLite2-City.mmdb` | Path to the GeoLite2 City database |
| `CLAMAV_ENABLED` | Boolean | `false` | Scan inbound attachments with ClamAV |
| `CLAMAV_HOST` | String | `127.0.0.1` | ClamAV daemon host |
| `CLAMAV_PORT` | Integer | `3310` | ClamAV daemon port |
| `SPAM_THRESHOLD_SCORE` | Integer | `5` | Score at which a message is marked as spam |
| `SPAM_BLOCK_SCORE` | Integer | `8` | Score at which a message is rejected |

---

## Production Checklist

1. Set `NODE_ENV=production`, `SESSION_SECRET`, `JWT_SECRET`, and `ENCRYPTION_KEY`.
2. Set `LOCAL_ADMIN_PASSWORD` (or configure a Telegram bot) and change the default username.
3. Set `DOMAINS` and `WEB_URL` to your real domains and enable HTTPS.
4. Keep `ALLOW_PRIVATE_OUTBOUND=false` and `APP_ALLOW_USER_DEPLOYMENTS=false` unless you understand the risk.
5. Put the API behind a TLS-terminating reverse proxy and restrict `TRUST_PROXY` to the actual hop count.
6. Ensure `nginx/routes/`, `data/`, `logs/`, and `backups/` are writable by the service user and excluded from version control.
