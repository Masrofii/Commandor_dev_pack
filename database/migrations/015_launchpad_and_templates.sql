-- Migration 015: Commandor Launchpad, Subdomain Templates & Deployment Health Check Tracking

-- 1. Extend application_deployments for health check tracking and rollback lineage
ALTER TABLE application_deployments ADD COLUMN health_check_result TEXT;
ALTER TABLE application_deployments ADD COLUMN rollback_from_id INTEGER;
ALTER TABLE application_deployments ADD COLUMN is_rollback INTEGER NOT NULL DEFAULT 0;

-- 2. Create Reusable, Editable Subdomain / Service Templates table
CREATE TABLE IF NOT EXISTS service_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_key TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'application', -- 'application' | 'api' | 'documentation' | 'static_site' | 'status_page'
    description TEXT,
    default_port INTEGER NOT NULL DEFAULT 8080,
    default_path TEXT NOT NULL DEFAULT '/',
    runtime TEXT NOT NULL DEFAULT 'nodejs', -- 'nodejs' | 'python' | 'go' | 'static' | 'docker'
    recommended_build TEXT,
    recommended_start TEXT,
    default_env TEXT DEFAULT '{}',
    nginx_config_template TEXT NOT NULL,
    websocket_support INTEGER NOT NULL DEFAULT 0,
    health_check_endpoint TEXT NOT NULL DEFAULT '/health',
    is_builtin INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_service_templates_cat ON service_templates(category);

-- 3. Create Launchpad Workflows table (guided multi-step creation with resume & recovery)
CREATE TABLE IF NOT EXISTS service_workflows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tg_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    service_type TEXT NOT NULL DEFAULT 'application',
    template_key TEXT,
    current_step INTEGER NOT NULL DEFAULT 1,
    total_steps INTEGER NOT NULL DEFAULT 10,
    status TEXT NOT NULL DEFAULT 'draft', -- 'draft' | 'in_progress' | 'deploying' | 'completed' | 'failed'
    workflow_data TEXT NOT NULL DEFAULT '{}',
    step_progress TEXT NOT NULL DEFAULT '{}',
    logs TEXT,
    error_message TEXT,
    remediation TEXT,
    application_id INTEGER,
    subdomain_id INTEGER,
    created_at DATETIME NOT NULL DEFAULT (datetime('now')),
    updated_at DATETIME NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE SET NULL,
    FOREIGN KEY (subdomain_id) REFERENCES subdomains(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_service_workflows_user ON service_workflows(tg_id, status);

-- 4. Seed built-in standard service templates
INSERT OR IGNORE INTO service_templates (
    template_key, name, category, description,
    default_port, default_path, runtime,
    recommended_build, recommended_start, default_env,
    nginx_config_template, websocket_support, health_check_endpoint, is_builtin
) VALUES
(
    'nodejs-express',
    'Node.js & Express Application',
    'application',
    'Production Node.js service with process clustering, graceful shutdown, and WebSocket support.',
    3000,
    '/',
    'nodejs',
    'npm ci && npm run build',
    'npm start',
    '{"NODE_ENV":"production","PORT":"3000"}',
    'location / { proxy_pass http://{{UPSTREAM_TARGET}}; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection $connection_upgrade; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; proxy_read_timeout 90s; }',
    1,
    '/health',
    1
),
(
    'fastapi-python',
    'Python FastAPI / Flask REST API',
    'api',
    'High-performance Python ASGI/WSGI API service with automated OpenAPI documentation.',
    8000,
    '/docs',
    'python',
    'pip install -r requirements.txt',
    'uvicorn main:app --host 0.0.0.0 --port 8000',
    '{"PYTHONUNBUFFERED":"1","PORT":"8000"}',
    'location / { proxy_pass http://{{UPSTREAM_TARGET}}; proxy_http_version 1.1; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; proxy_read_timeout 60s; }',
    0,
    '/health',
    1
),
(
    'vitepress-docs',
    'Technical Documentation (VitePress / Docusaurus)',
    'documentation',
    'Fast static documentation portal with search, client-side routing, and Markdown compilation.',
    4173,
    '/',
    'static',
    'npm ci && npm run docs:build',
    'npx serve -s docs/.vitepress/dist -p 4173',
    '{"NODE_ENV":"production"}',
    'location / { proxy_pass http://{{UPSTREAM_TARGET}}; proxy_http_version 1.1; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; add_header Cache-Control "public, max-age=3600"; }',
    0,
    '/',
    1
),
(
    'static-landing',
    'Edge Static Landing & Marketing Site',
    'static_site',
    'Modern static site or single page application with edge asset caching and Brotli/Gzip compression.',
    8080,
    '/',
    'static',
    'npm ci && npm run build',
    'npx serve -s out -p 8080',
    '{"NODE_ENV":"production"}',
    'location / { proxy_pass http://{{UPSTREAM_TARGET}}; proxy_http_version 1.1; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; add_header Cache-Control "public, max-age=86400, stale-while-revalidate=604800"; }',
    0,
    '/',
    1
),
(
    'status-page',
    'Public Infrastructure Status Page',
    'status_page',
    'Real-time service availability, incident reporting, and uptime status portal.',
    3002,
    '/',
    'nodejs',
    'npm ci && npm run build',
    'npm start',
    '{"NODE_ENV":"production","PORT":"3002"}',
    'location / { proxy_pass http://{{UPSTREAM_TARGET}}; proxy_http_version 1.1; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; proxy_read_timeout 30s; add_header Cache-Control "no-cache, must-revalidate"; }',
    0,
    '/api/status',
    1
);
