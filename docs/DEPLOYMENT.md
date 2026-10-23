# Commandor Dev Pack — Production Deployment & Operations Guide

**Version:** 1.0.0  
**Target Environment:** Linux (Ubuntu 22.04 LTS / Debian 12 / RHEL 9)  

---

## 1. Prerequisites

- **Node.js**: v20.0.0 or higher (v22.x LTS recommended)
- **Package Manager**: npm v10+
- **Database**: SQLite 3 (bundled via `better-sqlite3`)
- **Process Manager**: PM2 (`npm install -g pm2`)
- **Web Server**: Nginx (optional, for SSL termination and reverse proxy)
- **Build Tools**: `gcc`, `g++`, `make`, `python3` (for native sqlite/bcrypt addons)

```bash
# Ubuntu / Debian setup
sudo apt update && sudo apt install -y build-essential python3 curl git
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

---

## 2. Clean Installation

```bash
# 1. Clone repository
git clone https://github.com/Masrofii/Commandor_dev_pack.git /opt/temp-mail-manager
cd /opt/temp-mail-manager

# 2. Install backend dependencies
npm ci --omit=dev

# 3. Install frontend dependencies and build Next.js
cd web
npm ci --omit=dev
npm run build
cd ..

# 4. Copy environment configuration
cp .env.example .env
chmod 600 .env
nano .env

# 5. Run database migrations
npm run migrate
```

---

## 3. Starting Services with PM2

Commandor Dev Pack uses PM2 to run and monitor background processes:

```bash
# Start backend API and Telegram bot
pm2 start ecosystem.config.js

# Save process list for automatic reboot recovery
pm2 save
pm2 startup
```

Verify process health:
```bash
pm2 list
pm2 logs --lines 50
```

---

## 4. Reverse Proxy & SSL Configuration (Nginx)

```nginx
# /etc/nginx/sites-available/commandor.conf
server {
    listen 80;
    server_name myplatform.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name myplatform.example.com;

    ssl_certificate /etc/letsencrypt/live/myplatform.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/myplatform.example.com/privkey.pem;

    # Next.js Web App
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Express API
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 25M;
    }
}
```

---

## 5. Safe Update & Rollback Procedures

### Standard Update
```bash
git fetch origin
git pull --ff-only origin main
npm ci --omit=dev
npm run migrate
cd web && npm ci --omit=dev && npm run build && cd ..
pm2 reload all
```

### Emergency Rollback
```bash
git checkout <PREVIOUS_COMMIT_OR_TAG>
npm ci --omit=dev
cd web && npm run build && cd ..
pm2 reload all
```
