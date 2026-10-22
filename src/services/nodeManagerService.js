'use strict';
const { Client } = require('ssh2');
const { getDb } = require('../../database/database');
const logger = require('../monitoring/logger');
const { logChange } = require('./auditLogger');
const { encrypt, decrypt } = require('../utils/encryption');
const { parseMemoryTelemetry, isTelemetryStale } = require('../utils/memoryTelemetry');

const REMOTE_SITES_ROOT = '/var/www/nodesites';

const MEMORY_PROBE_COMMAND = [
  'cat /proc/meminfo 2>/dev/null || LC_ALL=C free -m 2>/dev/null',
  'echo "===CGROUP_LIMIT==="',
  'cat /sys/fs/cgroup/memory.max 2>/dev/null || cat /sys/fs/cgroup/memory/memory.limit_in_bytes 2>/dev/null || echo "NONE"',
  'echo "===CGROUP_USAGE==="',
  'cat /sys/fs/cgroup/memory.current 2>/dev/null || cat /sys/fs/cgroup/memory/memory.usage_in_bytes 2>/dev/null || echo "NONE"',
  'echo "===OPEN_VZ_UBC==="',
  'grep -E "physpages|oomguarpages" /proc/user_beancounters 2>/dev/null || echo "NONE"'
].join('\n');

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
        self.send_header('X-Powered-By', 'Commandor-Dev-Pack')
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

  let str = input.trim();
  let label = null;
  const hashIdx = str.indexOf('#');
  if (hashIdx > -1) {
    label = str.substring(hashIdx + 1).trim();
    str = str.substring(0, hashIdx).trim();
  }

  // Format: user:pass@host:port
  if (str.includes('@')) {
    const atParts = str.split('@');
    const userPass = atParts[0].split(':');
    const hostPort = atParts[1].split(':');
    return {
      username: (userPass[0] || 'root').trim(),
      password: userPass[1] ? userPass[1].trim() : '',
      host: hostPort[0].trim(),
      port: parseInt(hostPort[1], 10) || 22,
      name: label || null
    };
  }

  // Format: host:port:user:pass OR host:user:pass
  const parts = str.split(':');
  if (parts.length >= 4) {
    return {
      host: parts[0].trim(),
      port: parseInt(parts[1], 10) || 22,
      username: parts[2].trim() || 'root',
      password: parts.slice(3).join(':').trim(),
      name: label || null
    };
  } else if (parts.length === 3) {
    return {
      host: parts[0].trim(),
      port: 22,
      username: parts[1].trim() || 'root',
      password: parts[2].trim(),
      name: label || null
    };
  }

  throw new Error('Invalid connection format. Expected: host:port:user:pass (e.g. 192.168.1.10:22:root:password)');
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

/**
 * Connect to an SSH host with host key verification and decrypting credentials.
 */
function connectSsh(node, options = {}) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const timeoutMs = options.timeoutMs || 15000;
    let capturedFingerprint = null;

    const timeout = setTimeout(() => {
      try { conn.end(); } catch {}
      reject(new Error(`SSH connection timeout after ${timeoutMs}ms to ${node.host}:${node.port || 22}`));
    }, timeoutMs);

    conn.on('ready', () => {
      clearTimeout(timeout);
      conn.hostKeyFingerprint = capturedFingerprint;
      resolve(conn);
    });

    conn.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    const expectedFingerprint = options.expectedFingerprint || node.host_key_fingerprint;

    const connConfig = {
      host: node.host,
      port: parseInt(node.port, 10) || 22,
      username: node.username || 'root',
      readyTimeout: timeoutMs,
      hostHash: 'sha256',
      hostVerifier: (hashedKey, callback) => {
        capturedFingerprint = hashedKey;
        if (expectedFingerprint) {
          const match = String(hashedKey).trim().toLowerCase() === String(expectedFingerprint).trim().toLowerCase();
          if (!match) {
            return callback(new Error(`Host key verification failed: key ${hashedKey} does not match expected ${expectedFingerprint}`));
          }
        }
        callback(true);
      }
    };

    // Resolve private key or password (decrypt if stored encrypted)
    const rawPrivateKey = options.privateKey || node.private_key || node.privateKey;
    const rawPassword = options.password !== undefined ? options.password : node.password;

    if (rawPrivateKey) {
      connConfig.privateKey = decrypt(rawPrivateKey) || rawPrivateKey;
    } else if (rawPassword) {
      connConfig.password = decrypt(rawPassword) || rawPassword;
    }

    try {
      conn.connect(connConfig);
    } catch (err) {
      clearTimeout(timeout);
      reject(err);
    }
  });
}

/**
 * Non-destructive connection test:
 * Connects, checks host key, collects OS/CPU/RAM/Disk/Uptime specs.
 * DOES NOT write any files or start any processes.
 */
async function testNodeConnection({
  host,
  port = 22,
  username = 'root',
  password = null,
  privateKey = null,
  hostKeyFingerprint = null,
  timeoutMs = 15000
}) {
  const nodeConfig = {
    host,
    port: parseInt(port, 10) || 22,
    username,
    password,
    private_key: privateKey,
    host_key_fingerprint: hostKeyFingerprint
  };

  const startTime = Date.now();
  let conn;
  try {
    conn = await connectSsh(nodeConfig, { expectedFingerprint: hostKeyFingerprint, timeoutMs });
    const latencyMs = Date.now() - startTime;

    // Run non-destructive inventory queries
    const unameRes = await executeSshCommand(conn, 'uname -s -m && (cat /etc/os-release 2>/dev/null | grep PRETTY_NAME || true)');
    const cpuRes = await executeSshCommand(conn, 'nproc 2>/dev/null || grep -c ^processor /proc/cpuinfo || echo 1');
    const memRes = await executeSshCommand(conn, MEMORY_PROBE_COMMAND);
    const diskRes = await executeSshCommand(conn, "df -h / 2>/dev/null | tail -n 1 | awk '{print $2, $3, $4, $5}' || echo '10G 1G 9G 10%'");
    const uptimeRes = await executeSshCommand(conn, 'uptime -p 2>/dev/null || uptime 2>/dev/null || echo "up unknown"');

    const memData = parseMemoryTelemetry(memRes.stdout);
    const diskParts = diskRes.stdout.split(/\s+/);
    const osLine = unameRes.stdout.split('\n')[0] || 'Linux';
    const prettyNameMatch = unameRes.stdout.match(/PRETTY_NAME="?([^"\n]+)"?/);
    const osPretty = prettyNameMatch ? prettyNameMatch[1] : osLine;

    const sysInfo = {
      os: osPretty,
      cpus: parseInt(cpuRes.stdout, 10) || 1,
      ramTotalMb: memData.ramTotalMb,
      ramMb: memData.ramMb,
      ramUsedMb: memData.ramUsedMb,
      ramFreeMb: memData.ramFreeMb,
      ramAvailableMb: memData.ramAvailableMb,
      containerLimitMb: memData.containerLimitMb,
      containerUsedMb: memData.containerUsedMb,
      diskTotal: diskParts[0] || 'N/A',
      diskUsed: diskParts[1] || 'N/A',
      diskFree: diskParts[2] || 'N/A',
      diskUsagePercent: diskParts[3] || '0%',
      uptime: uptimeRes.stdout.trim(),
      latencyMs,
      testedAt: new Date().toISOString()
    };

    return {
      success: true,
      latencyMs,
      hostKeyFingerprint: conn.hostKeyFingerprint,
      systemInfo: sysInfo
    };
  } catch (err) {
    let friendlyError = err.message || 'SSH connection failed';
    if (friendlyError.includes('ECONNREFUSED')) {
      friendlyError = `Connection refused on ${host}:${port}. Verify SSH daemon is running and port is open.`;
    } else if (friendlyError.includes('All configured authentication methods failed') || friendlyError.includes('authentication')) {
      friendlyError = `Authentication failed for user "${username}". Check password or private key.`;
    } else if (friendlyError.includes('Host key verification failed')) {
      friendlyError = `Security Alert: ${friendlyError}`;
    }
    return {
      success: false,
      error: friendlyError
    };
  } finally {
    if (conn) {
      try { conn.end(); } catch {}
    }
  }
}

/**
 * Enroll or update a node in the database.
 * Encrypts private keys & passwords before persisting.
 */
async function enrollNode({
  name,
  host,
  port = 22,
  username = 'root',
  password = null,
  privateKey = null,
  authMethod = null,
  hostKeyFingerprint = null,
  labels = null,
  groups = null,
  notes = null,
  httpPort = 8080,
  publicUrl = null,
  testBeforeSave = true
}) {
  if (!host || !username) {
    throw new Error('Host and username are required');
  }

  const cleanPort = parseInt(port, 10) || 22;
  const determinedAuthMethod = authMethod || (privateKey ? 'key' : 'password');

  let testResult = null;
  if (testBeforeSave) {
    testResult = await testNodeConnection({
      host,
      port: cleanPort,
      username,
      password,
      privateKey,
      hostKeyFingerprint
    });

    if (!testResult.success) {
      throw new Error(`Cannot enroll node: ${testResult.error}`);
    }
  }

  const db = getDb();
  const nodeName = name || `node-${host.replace(/[^a-zA-Z0-9]/g, '-')}-${cleanPort}`;
  const autoPublicUrl = publicUrl || `http://${host}:${httpPort}`;
  const verifiedFingerprint = hostKeyFingerprint || testResult?.hostKeyFingerprint || null;
  const sysInfo = testResult?.systemInfo || {};

  // Encrypt credentials at rest
  const encPassword = password ? encrypt(password) : null;
  const encPrivateKey = privateKey ? encrypt(privateKey) : null;

  const existing = db.prepare('SELECT id, password, private_key FROM hosting_nodes WHERE host=? AND port=?').get(host, cleanPort);
  let nodeId;

  if (existing) {
    db.prepare(`
      UPDATE hosting_nodes
      SET name = ?, username = ?,
          password = COALESCE(?, password),
          private_key = COALESCE(?, private_key),
          auth_method = ?,
          host_key_fingerprint = COALESCE(?, host_key_fingerprint),
          labels = ?, groups = ?, notes = ?,
          http_port = ?, public_url = ?,
          status = 'online', last_ping_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
          system_info = ?, is_active = 1, last_error = NULL
      WHERE id = ?
    `).run(
      nodeName, username, encPassword, encPrivateKey,
      determinedAuthMethod, verifiedFingerprint,
      labels ? (typeof labels === 'object' ? JSON.stringify(labels) : labels) : null,
      groups || null, notes || null,
      httpPort, autoPublicUrl,
      JSON.stringify(sysInfo), existing.id
    );
    nodeId = existing.id;
  } else {
    const info = db.prepare(`
      INSERT INTO hosting_nodes (
        name, host, port, username, password, private_key,
        auth_method, host_key_fingerprint, labels, groups, notes,
        http_port, public_url, status, last_ping_at, system_info, is_active, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'online', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), ?, 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    `).run(
      nodeName, host, cleanPort, username, encPassword, encPrivateKey,
      determinedAuthMethod, verifiedFingerprint,
      labels ? (typeof labels === 'object' ? JSON.stringify(labels) : labels) : null,
      groups || null, notes || null,
      httpPort, autoPublicUrl, JSON.stringify(sysInfo)
    );
    nodeId = info.lastInsertRowid;
  }

  logChange({
    category: 'hosting',
    action: 'node_enrolled',
    details: `Enrolled node "${nodeName}" (${host}:${cleanPort}) with ${determinedAuthMethod} authentication`,
    metadata: { nodeId, host, port: cleanPort, name: nodeName, authMethod: determinedAuthMethod }
  }).catch(() => {});

  return getNodeById(nodeId);
}

/**
 * Update an existing node's configuration or metadata.
 */
function updateNode(id, fields = {}) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM hosting_nodes WHERE id=?').get(id);
  if (!existing) {
    throw new Error(`Node #${id} not found`);
  }

  const updates = [];
  const params = [];

  if (fields.name !== undefined) {
    updates.push('name = ?');
    params.push(fields.name.trim());
  }
  if (fields.username !== undefined) {
    updates.push('username = ?');
    params.push(fields.username.trim());
  }
  if (fields.password !== undefined && fields.password !== '') {
    updates.push('password = ?');
    params.push(encrypt(fields.password));
    updates.push("auth_method = 'password'");
  }
  if (fields.private_key !== undefined && fields.private_key !== '') {
    updates.push('private_key = ?');
    params.push(encrypt(fields.private_key));
    updates.push("auth_method = 'key'");
  }
  if (fields.labels !== undefined) {
    updates.push('labels = ?');
    params.push(typeof fields.labels === 'object' ? JSON.stringify(fields.labels) : fields.labels);
  }
  if (fields.groups !== undefined) {
    updates.push('groups = ?');
    params.push(fields.groups);
  }
  if (fields.notes !== undefined) {
    updates.push('notes = ?');
    params.push(fields.notes);
  }
  if (fields.host_key_fingerprint !== undefined) {
    updates.push('host_key_fingerprint = ?');
    params.push(fields.host_key_fingerprint);
  }
  if (fields.is_active !== undefined) {
    updates.push('is_active = ?');
    params.push(fields.is_active ? 1 : 0);
  }

  if (updates.length > 0) {
    params.push(id);
    db.prepare(`UPDATE hosting_nodes SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }

  return getNodeById(id);
}

/**
 * Explicit action to provision hosting runner / siteserver on a remote node.
 */
async function provisionNodeServices(id, userTgId = null) {
  const db = getDb();
  const rawNode = db.prepare('SELECT * FROM hosting_nodes WHERE id=?').get(id);
  if (!rawNode) throw new Error(`Node #${id} not found`);

  const conn = await connectSsh(rawNode);
  try {
    await executeSshCommand(conn, `mkdir -p ${REMOTE_SITES_ROOT}`);
    const b64Runner = Buffer.from(SITESERVER_PYTHON_SCRIPT).toString('base64');
    await executeSshCommand(conn, `echo "${b64Runner}" | base64 -d > /var/www/siteserver.py`);
    await executeSshCommand(conn, `
      if command -v python3 >/dev/null 2>&1; then
        if ! pgrep -f "/var/www/siteserver.py" >/dev/null; then
          nohup python3 /var/www/siteserver.py >/var/log/siteserver.log 2>&1 &
        fi
      fi
    `);

    db.prepare("UPDATE hosting_nodes SET status = 'online', last_ping_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?").run(id);

    logChange({
      tgId: userTgId,
      category: 'hosting',
      action: 'node_provisioned',
      details: `Provisioned hosting runner and siteserver on node "${rawNode.name}" (${rawNode.host})`,
      metadata: { nodeId: id }
    }).catch(() => {});

    return { success: true, message: 'Services provisioned successfully' };
  } finally {
    try { conn.end(); } catch {}
  }
}

/**
 * Backward compatible wrapper for legacy calls.
 */
async function testAndProvisionNode(params) {
  return enrollNode(params);
}

function sanitizeNode(node) {
  if (!node) return null;
  const { password, private_key, ...safe } = node;

  let lastPingIso = safe.last_ping_at;
  if (lastPingIso && typeof lastPingIso === 'string') {
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(lastPingIso)) {
      lastPingIso = lastPingIso.replace(' ', 'T') + 'Z';
    } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(lastPingIso) && !lastPingIso.endsWith('Z') && !lastPingIso.includes('+')) {
      lastPingIso = lastPingIso + 'Z';
    }
  }

  const isStale = isTelemetryStale(lastPingIso);

  return {
    ...safe,
    last_ping_at: lastPingIso,
    is_stale: isStale,
    has_password: Boolean(password),
    has_private_key: Boolean(private_key),
    auth_method: node.auth_method || (private_key ? 'key' : 'password'),
    system_info: safe.system_info ? safeJsonParse(safe.system_info) : {},
    labels: safe.labels ? safeJsonParse(safe.labels) : []
  };
}

function getNodeById(id) {
  const db = getDb();
  const node = db.prepare('SELECT * FROM hosting_nodes WHERE id=?').get(id);
  return sanitizeNode(node);
}

function listNodes(opts = {}) {
  const db = getDb();
  const { onlyActive = true, search = null } = opts;
  let q = 'SELECT * FROM hosting_nodes WHERE 1=1';
  const params = [];

  if (onlyActive) {
    q += ' AND is_active = 1';
  }
  if (search) {
    q += ' AND (name LIKE ? OR host LIKE ? OR groups LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  q += ' ORDER BY created_at DESC';

  const rows = db.prepare(q).all(...params);
  return rows.map(sanitizeNode);
}

function deleteNode(id) {
  const db = getDb();
  const siteCount = db.prepare('SELECT COUNT(*) as count FROM hosting_sites WHERE node_id=?').get(id)?.count || 0;
  if (siteCount > 0) {
    throw new Error(`Cannot delete node: it currently hosts ${siteCount} site(s). Please move or delete the sites first.`);
  }

  // Check if any applications are running on this node
  try {
    const appCount = db.prepare('SELECT COUNT(*) as count FROM applications WHERE node_id=?').get(id)?.count || 0;
    if (appCount > 0) {
      throw new Error(`Cannot delete node: it currently hosts ${appCount} application(s). Please move or delete the applications first.`);
    }
  } catch {}

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
  let rawNode = node;
  if (!rawNode.password && !rawNode.private_key && node.id) {
    rawNode = getDb().prepare('SELECT * FROM hosting_nodes WHERE id=?').get(node.id);
  }

  const conn = await connectSsh(rawNode);
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
  let rawNode = node;
  if (!rawNode.password && !rawNode.private_key && node.id) {
    rawNode = getDb().prepare('SELECT * FROM hosting_nodes WHERE id=?').get(node.id);
  }

  try {
    const conn = await connectSsh(rawNode);
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

function parseBulkConnectionStrings(input) {
  if (!input) return [];
  let rawEntries = [];

  if (Array.isArray(input)) {
    for (const item of input) {
      if (typeof item === 'string') {
        rawEntries.push(...item.split(/[\r\n]+/));
      } else if (item && typeof item === 'object') {
        rawEntries.push(item);
      }
    }
  } else if (typeof input === 'string') {
    rawEntries = input.split(/[\r\n]+/);
  } else if (typeof input === 'object') {
    rawEntries = [input];
  }

  const results = [];
  for (const raw of rawEntries) {
    if (!raw) continue;

    if (typeof raw === 'object') {
      if (raw.host && (raw.username || raw.user)) {
        results.push({
          raw: raw.connection_string || `${raw.host}:${raw.port || 22}`,
          host: String(raw.host).trim(),
          port: parseInt(raw.port, 10) || 22,
          username: String(raw.username || raw.user || 'root').trim(),
          password: raw.password ? String(raw.password) : null,
          privateKey: raw.private_key || raw.privateKey || null,
          name: raw.name ? String(raw.name).trim() : null,
          labels: raw.labels || null,
          groups: raw.groups || null,
          notes: raw.notes || null,
          httpPort: parseInt(raw.http_port || raw.httpPort, 10) || 8080,
          publicUrl: raw.public_url || raw.publicUrl || null
        });
        continue;
      }
      if (raw.connection_string && typeof raw.connection_string === 'string') {
        const sub = parseBulkConnectionStrings(raw.connection_string);
        results.push(...sub);
        continue;
      }
      continue;
    }

    if (typeof raw !== 'string') continue;
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) {
      continue;
    }

    try {
      const parsed = parseNodeConnectionString(line);
      results.push({
        raw: line,
        host: parsed.host,
        port: parsed.port,
        username: parsed.username,
        password: parsed.password,
        name: parsed.name,
        httpPort: 8080,
        publicUrl: null
      });
    } catch (err) {
      results.push({
        raw: line,
        error: err.message,
        status: 'error'
      });
    }
  }

  return results;
}

/**
 * Validate bulk import input with duplicate detection and dry-run review.
 */
function validateBulkNodes(input) {
  const parsed = parseBulkConnectionStrings(input);
  const db = getDb();
  const existingNodes = db.prepare('SELECT host, port FROM hosting_nodes').all();
  const existingSet = new Set(existingNodes.map(n => `${n.host.toLowerCase()}:${n.port}`));

  const seenInBatch = new Set();
  const validated = [];

  for (const item of parsed) {
    if (item.error) {
      validated.push({ ...item, status: 'invalid' });
      continue;
    }

    const key = `${item.host.toLowerCase()}:${item.port}`;
    if (seenInBatch.has(key)) {
      validated.push({
        ...item,
        status: 'duplicate_batch',
        error: `Duplicate entry in current import: ${item.host}:${item.port}`
      });
      continue;
    }
    seenInBatch.add(key);

    const isExisting = existingSet.has(key);
    validated.push({
      ...item,
      status: isExisting ? 'update' : 'new',
      isExisting
    });
  }

  return {
    total: validated.length,
    newCount: validated.filter(v => v.status === 'new').length,
    updateCount: validated.filter(v => v.status === 'update').length,
    invalidCount: validated.filter(v => v.status === 'invalid' || v.status === 'duplicate_batch').length,
    items: validated
  };
}

async function provisionNodesBulk(input, options = {}) {
  const items = parseBulkConnectionStrings(input);
  if (items.length === 0) {
    return {
      total: 0,
      successful: 0,
      failed: 0,
      results: []
    };
  }

  const concurrency = Math.min(Math.max(parseInt(options.concurrency, 10) || 3, 1), 5);
  const results = new Array(items.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      const item = items[idx];

      if (item.error) {
        results[idx] = {
          input: item.raw,
          status: 'error',
          error: item.error
        };
        continue;
      }

      try {
        const node = await enrollNode({
          host: item.host,
          port: item.port,
          username: item.username,
          password: item.password,
          privateKey: item.privateKey,
          name: item.name,
          labels: item.labels,
          groups: item.groups,
          notes: item.notes,
          httpPort: item.httpPort || options.defaultHttpPort || 8080,
          publicUrl: item.publicUrl,
          testBeforeSave: options.testBeforeSave !== false
        });

        results[idx] = {
          input: item.raw,
          host: item.host,
          port: item.port,
          name: node.name,
          status: 'success',
          node
        };
      } catch (err) {
        results[idx] = {
          input: item.raw,
          host: item.host,
          port: item.port,
          name: item.name || item.host,
          status: 'error',
          error: err.message
        };
      }
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  const workers = [];
  for (let i = 0; i < workerCount; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  const successful = results.filter(r => r.status === 'success').length;
  const failed = results.filter(r => r.status === 'error').length;

  logChange({
    category: 'hosting',
    action: 'bulk_nodes_enrolled',
    details: `Bulk enrolled ${successful} nodes successfully (${failed} failed) out of ${items.length} total.`,
    metadata: { total: items.length, successful, failed }
  }).catch(() => {});

  return {
    total: items.length,
    successful,
    failed,
    results
  };
}

async function pingNode(id) {
  const db = getDb();
  const rawNode = db.prepare('SELECT * FROM hosting_nodes WHERE id=?').get(id);
  if (!rawNode) {
    throw new Error(`Node #${id} not found`);
  }

  const startTime = Date.now();
  let conn;
  try {
    conn = await connectSsh(rawNode);

    // Query runtime stats: uptime, loadavg, memory, disk, docker
    const uptimeRes = await executeSshCommand(conn, 'uptime -p 2>/dev/null || uptime 2>/dev/null || echo "up"');
    const loadRes = await executeSshCommand(conn, "cat /proc/loadavg 2>/dev/null | awk '{print $1, $2, $3}' || echo '0.00 0.00 0.00'");
    const memRes = await executeSshCommand(conn, MEMORY_PROBE_COMMAND);
    const diskRes = await executeSshCommand(conn, "df -h / 2>/dev/null | tail -n 1 | awk '{print $2, $3, $4, $5}' || echo '10G 1G 9G 10%'");
    const dockerRes = await executeSshCommand(conn, '(command -v docker >/dev/null 2>&1 && docker ps -q 2>/dev/null | wc -l) || echo "0"');

    const memData = parseMemoryTelemetry(memRes.stdout);
    const diskParts = diskRes.stdout.split(/\s+/);
    const latencyMs = Date.now() - startTime;

    const previousInfo = rawNode.system_info ? safeJsonParse(rawNode.system_info) : {};

    const updatedMetrics = {
      ...previousInfo,
      uptime: uptimeRes.stdout.trim() || 'N/A',
      loadAvg: loadRes.stdout.trim() || '0.00 0.00 0.00',
      ramTotalMb: memData.ramTotalMb || previousInfo.ramTotalMb || 0,
      ramMb: memData.ramMb || previousInfo.ramMb || memData.ramTotalMb || 0,
      ramUsedMb: memData.ramUsedMb || 0,
      ramFreeMb: memData.ramFreeMb || 0,
      ramAvailableMb: memData.ramAvailableMb || memData.ramFreeMb || 0,
      containerLimitMb: memData.containerLimitMb || null,
      containerUsedMb: memData.containerUsedMb || null,
      diskTotal: diskParts[0] || 'N/A',
      diskUsed: diskParts[1] || 'N/A',
      diskFree: diskParts[2] || 'N/A',
      diskUsagePercent: diskParts[3] || '0%',
      dockerContainers: parseInt(dockerRes.stdout.trim(), 10) || 0,
      latencyMs,
      testedAt: new Date().toISOString()
    };

    db.prepare(`
      UPDATE hosting_nodes
      SET status = 'online', last_ping_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), system_info = ?, last_error = NULL
      WHERE id = ?
    `).run(JSON.stringify(updatedMetrics), id);

    return {
      success: true,
      status: 'online',
      latencyMs,
      metrics: updatedMetrics,
      node: getNodeById(id)
    };
  } catch (err) {
    db.prepare(`
      UPDATE hosting_nodes
      SET status = 'offline', last_error = ?, last_error_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE id = ?
    `).run(err.message, id);

    return {
      success: false,
      status: 'offline',
      error: err.message,
      node: getNodeById(id)
    };
  } finally {
    if (conn) {
      try { conn.end(); } catch {}
    }
  }
}

async function executeNodeCommand(id, command, userTgId = null) {
  if (!command || typeof command !== 'string' || !command.trim()) {
    throw new Error('Command string is required');
  }

  const db = getDb();
  const rawNode = db.prepare('SELECT * FROM hosting_nodes WHERE id=?').get(id);
  if (!rawNode) {
    throw new Error(`Node #${id} not found`);
  }

  const cleanCmd = command.trim();
  const startTime = Date.now();
  let conn;
  try {
    conn = await connectSsh(rawNode);
    const result = await executeSshCommand(conn, cleanCmd);
    const durationMs = Date.now() - startTime;

    logChange({
      tgId: userTgId,
      category: 'hosting',
      action: 'node_command_executed',
      details: `Executed command on node "${rawNode.name}": ${cleanCmd.slice(0, 100)}`,
      metadata: { nodeId: id, nodeName: rawNode.name, command: cleanCmd.slice(0, 300), durationMs, exitCode: result.code }
    }).catch(() => {});

    return {
      success: result.code === 0,
      code: result.code,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs
    };
  } finally {
    if (conn) {
      try { conn.end(); } catch {}
    }
  }
}

function getNodeWithSites(id) {
  const node = getNodeById(id);
  if (!node) return null;
  const db = getDb();
  const sites = db.prepare('SELECT * FROM hosting_sites WHERE node_id=? ORDER BY created_at DESC').all(id);
  const apps = db.prepare('SELECT id, name, git_repo, git_branch, status, port FROM applications WHERE node_id=? ORDER BY created_at DESC').all(id);
  return {
    ...node,
    sites,
    applications: apps
  };
}

/**
 * Refreshes telemetry for all active hosting nodes.
 * Used by scheduled background health checks and dashboard sync.
 */
async function refreshAllNodesTelemetry() {
  const db = getDb();
  const activeNodes = db.prepare('SELECT id, name, host FROM hosting_nodes WHERE is_active = 1').all();
  const results = [];
  for (const n of activeNodes) {
    try {
      const res = await pingNode(n.id);
      results.push({ id: n.id, host: n.host, success: res.success, status: res.status });
    } catch (err) {
      logger.warn({ nodeId: n.id, host: n.host, err: err.message }, 'Scheduled background node ping failed');
      results.push({ id: n.id, host: n.host, success: false, error: err.message });
    }
  }
  return results;
}

module.exports = {
  parseNodeConnectionString,
  parseBulkConnectionStrings,
  connectSsh,
  testNodeConnection,
  enrollNode,
  updateNode,
  provisionNodeServices,
  validateBulkNodes,
  testAndProvisionNode,
  provisionNodesBulk,
  getNodeById,
  getNodeWithSites,
  listNodes,
  deleteNode,
  getAvailableNode,
  deployFilesToNode,
  removeSiteFromNode,
  pingNode,
  executeNodeCommand,
  refreshAllNodesTelemetry
};
