'use strict';
const { Client } = require('ssh2');
const { getDb } = require('../../database/database');
const logger = require('../monitoring/logger');
const { logChange } = require('./auditLogger');

const REMOTE_SITES_ROOT = '/var/www/nodesites';

const SITESERVER_PYTHON_SCRIPT = `
import http.server, socketserver, os, urllib.parse, sys

ROOT = '/var/www/nodesites'
os.makedirs(ROOT, exist_ok=True)

class MultiSiteHandler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        host = self.headers.get('Host', '').split(':')[0].lower()
        site_name = None
        if '.' in host:
            sub = host.split('.')[0]
            if os.path.isdir(os.path.join(ROOT, sub)):
                site_name = sub

        clean_path = urllib.parse.unquote(path)
        if clean_path.startswith('/sites/'):
            parts = clean_path[7:].split('/', 1)
            cand = parts[0]
            if os.path.isdir(os.path.join(ROOT, cand)):
                site_name = cand
                clean_path = '/' + (parts[1] if len(parts) > 1 else '')

        if site_name:
            base = os.path.join(ROOT, site_name)
            rel = clean_path.lstrip('/')
            return os.path.normpath(os.path.join(base, rel))
        return os.path.normpath(os.path.join(ROOT, clean_path.lstrip('/')))

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('X-Powered-By', 'Commandor-NodeHosting')
        super().end_headers()

port = int(os.environ.get('PORT', 8080))
socketserver.TCPServer.allow_reuse_address = True
try:
    with socketserver.TCPServer(('', port), MultiSiteHandler) as httpd:
        print(f"Siteserver running on port {port}", flush=True)
        httpd.serve_forever()
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
`;

function parseNodeConnectionString(input) {
  if (!input || typeof input !== 'string') {
    throw new Error('Connection string is required');
  }

  const str = input.trim();

  // Format: user:pass@host:port
  if (str.includes('@')) {
    const atParts = str.split('@');
    const userPass = atParts[0].split(':');
    const hostPort = atParts[1].split(':');
    return {
      username: userPass[0] || 'root',
      password: userPass[1] || '',
      host: hostPort[0],
      port: parseInt(hostPort[1], 10) || 22
    };
  }

  // Format: host:port:user:pass OR host:user:pass
  const parts = str.split(':');
  if (parts.length >= 4) {
    return {
      host: parts[0],
      port: parseInt(parts[1], 10) || 22,
      username: parts[2] || 'root',
      password: parts.slice(3).join(':')
    };
  } else if (parts.length === 3) {
    return {
      host: parts[0],
      port: 22,
      username: parts[1] || 'root',
      password: parts[2]
    };
  }

  throw new Error('Invalid connection format. Expected: host:port:user:pass (e.g. proxy.rlwy.net:12345:root:password)');
}

function executeSshCommand(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      stream.on('close', (code) => {
        resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() });
      });
      stream.on('data', (data) => { stdout += data.toString(); });
      stream.stderr.on('data', (data) => { stderr += data.toString(); });
    });
  });
}

function connectSsh(node) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const timeout = setTimeout(() => {
      try { conn.end(); } catch {}
      reject(new Error(`SSH connection timeout to ${node.host}:${node.port}`));
    }, 15000);

    conn.on('ready', () => {
      clearTimeout(timeout);
      resolve(conn);
    });

    conn.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    const connConfig = {
      host: node.host,
      port: node.port || 22,
      username: node.username || 'root',
      readyTimeout: 15000
    };

    if (node.private_key || node.privateKey) {
      connConfig.privateKey = node.private_key || node.privateKey;
    } else if (node.password) {
      connConfig.password = node.password;
    }

    conn.connect(connConfig);
  });
}

async function testAndProvisionNode({
  host,
  port = 22,
  username = 'root',
  password = null,
  privateKey = null,
  name = null,
  httpPort = 8080,
  publicUrl = null
}) {
  const nodeConfig = {
    host,
    port: parseInt(port, 10) || 22,
    username,
    password,
    privateKey
  };

  logger.info({ host, port: nodeConfig.port, username }, 'Attempting SSH connection to node');
  const conn = await connectSsh(nodeConfig);

  try {
    // 1. Gather System Info
    const unameRes = await executeSshCommand(conn, 'uname -s -m && (cat /etc/os-release | grep PRETTY_NAME || true)');
    const cpuRes = await executeSshCommand(conn, 'nproc || grep -c ^processor /proc/cpuinfo || echo 1');
    const ramRes = await executeSshCommand(conn, 'free -m | grep Mem | awk \'{print $2}\' || echo 512');
    const diskRes = await executeSshCommand(conn, 'df -h / | tail -n 1 | awk \'{print $4}\' || echo 10G');

    const sysInfo = {
      os: unameRes.stdout.split('\n')[0] || 'Linux',
      cpus: parseInt(cpuRes.stdout, 10) || 1,
      ramMb: parseInt(ramRes.stdout, 10) || 512,
      freeDisk: diskRes.stdout || 'N/A',
      testedAt: new Date().toISOString()
    };

    // 2. Setup hosting directory and runner script
    await executeSshCommand(conn, `mkdir -p ${REMOTE_SITES_ROOT}`);

    // Install Python runner script
    const b64Runner = Buffer.from(SITESERVER_PYTHON_SCRIPT).toString('base64');
    await executeSshCommand(conn, `echo "${b64Runner}" | base64 -d > /var/www/siteserver.py`);

    // Check if python3 is available and launch runner if not already running
    await executeSshCommand(conn, `
      if command -v python3 >/dev/null 2>&1; then
        if ! pgrep -f "/var/www/siteserver.py" >/dev/null; then
          nohup python3 /var/www/siteserver.py >/var/log/siteserver.log 2>&1 &
        fi
      fi
    `);

    // 3. Save to database
    const db = getDb();
    const nodeName = name || `node-${host.replace(/[^a-zA-Z0-9]/g, '-')}-${nodeConfig.port}`;
    const autoPublicUrl = publicUrl || `http://${host}:${httpPort}`;

    const existing = db.prepare('SELECT id FROM hosting_nodes WHERE host=? AND port=?').get(host, nodeConfig.port);
    let nodeId;

    if (existing) {
      db.prepare(`
        UPDATE hosting_nodes
        SET name = ?, username = ?, password = ?, private_key = ?, http_port = ?, public_url = ?,
            status = 'online', last_ping_at = datetime('now'), system_info = ?, is_active = 1
        WHERE id = ?
      `).run(nodeName, username, password, privateKey, httpPort, autoPublicUrl, JSON.stringify(sysInfo), existing.id);
      nodeId = existing.id;
    } else {
      const info = db.prepare(`
        INSERT INTO hosting_nodes (name, host, port, username, password, private_key, http_port, public_url, status, last_ping_at, system_info, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'online', datetime('now'), ?, 1, datetime('now'))
      `).run(nodeName, host, nodeConfig.port, username, password, privateKey, httpPort, autoPublicUrl, JSON.stringify(sysInfo));
      nodeId = info.lastInsertRowid;
    }

    logger.info({ nodeId, host, nodeName }, 'Hosting node successfully provisioned');
    logChange({
      category: 'hosting',
      action: 'node_provisioned',
      details: `Provisioned hosting server node "${nodeName}" (${host}:${nodeConfig.port})`,
      metadata: { nodeId, host, nodeName }
    }).catch(() => {});
    return getNodeById(nodeId);
  } finally {
    try { conn.end(); } catch {}
  }
}

function getNodeById(id) {
  const db = getDb();
  const node = db.prepare('SELECT * FROM hosting_nodes WHERE id=?').get(id);
  if (!node) return null;
  return {
    ...node,
    system_info: node.system_info ? safeJsonParse(node.system_info) : {}
  };
}

function listNodes(opts = {}) {
  const db = getDb();
  const { onlyActive = true } = opts;
  let q = 'SELECT id, name, host, port, http_port, public_url, status, last_ping_at, system_info, max_sites, current_sites, is_active, created_at FROM hosting_nodes';
  if (onlyActive) {
    q += ' WHERE is_active = 1';
  }
  q += ' ORDER BY created_at DESC';

  const rows = db.prepare(q).all();
  return rows.map(r => ({
    ...r,
    system_info: r.system_info ? safeJsonParse(r.system_info) : {}
  }));
}

function deleteNode(id) {
  const db = getDb();
  const siteCount = db.prepare('SELECT COUNT(*) as count FROM hosting_sites WHERE node_id=?').get(id).count;
  if (siteCount > 0) {
    throw new Error(`Cannot delete node: it currently hosts ${siteCount} site(s). Please move or delete the sites first.`);
  }
  return db.prepare('DELETE FROM hosting_nodes WHERE id=?').run(id).changes > 0;
}

function getAvailableNode() {
  const db = getDb();
  const node = db.prepare(`
    SELECT * FROM hosting_nodes
    WHERE status = 'online' AND is_active = 1 AND current_sites < max_sites
    ORDER BY current_sites ASC, id ASC
    LIMIT 1
  `).get();
  return node || null;
}

async function deployFilesToNode(node, siteName, files = []) {
  const conn = await connectSsh(node);
  try {
    const siteDir = `${REMOTE_SITES_ROOT}/${siteName}`;
    await executeSshCommand(conn, `rm -rf "${siteDir}" && mkdir -p "${siteDir}"`);

    let totalBytes = 0;
    let filesCount = 0;

    for (const f of files) {
      const cleanPath = f.name.replace(/\\/g, '/').replace(/^\/+/, '');
      const fullRemotePath = `${siteDir}/${cleanPath}`;
      const dirPart = fullRemotePath.substring(0, fullRemotePath.lastIndexOf('/'));

      if (dirPart && dirPart !== siteDir) {
        await executeSshCommand(conn, `mkdir -p "${dirPart}"`);
      }

      const content = Buffer.isBuffer(f.content) ? f.content : Buffer.from(f.content || '', 'utf8');
      totalBytes += content.length;
      filesCount++;

      const b64 = content.toString('base64');
      await executeSshCommand(conn, `echo "${b64}" | base64 -d > "${fullRemotePath}"`);
    }

    return {
      success: true,
      filesCount,
      totalBytes,
      siteDir
    };
  } finally {
    try { conn.end(); } catch {}
  }
}

async function removeSiteFromNode(node, siteName) {
  try {
    const conn = await connectSsh(node);
    try {
      await executeSshCommand(conn, `rm -rf "${REMOTE_SITES_ROOT}/${siteName}"`);
    } finally {
      conn.end();
    }
    return true;
  } catch (err) {
    logger.warn({ err: err.message, siteName, nodeId: node.id }, 'Error removing site directory on remote node');
    return false;
  }
}

function safeJsonParse(v) {
  try { return JSON.parse(v); } catch { return v; }
}

module.exports = {
  parseNodeConnectionString,
  connectSsh,
  testAndProvisionNode,
  getNodeById,
  listNodes,
  deleteNode,
  getAvailableNode,
  deployFilesToNode,
  removeSiteFromNode
};
