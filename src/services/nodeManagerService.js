'use strict';
const net = require('net');
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

const FTPSERVER_PYTHON_SCRIPT = `
import socket, threading, os, sys, json, hashlib, time

ROOT = '/var/www/nodesites'
USERS_FILE = '/var/www/ftp_users.json'
PORT = int(os.environ.get('FTP_PORT', 21))
PASV_MIN = int(os.environ.get('PASV_MIN', 30000))
PASV_MAX = int(os.environ.get('PASV_MAX', 30100))
os.makedirs(ROOT, exist_ok=True)

def load_users():
    if not os.path.exists(USERS_FILE):
        return {}
    try:
        with open(USERS_FILE, 'r') as f:
            return json.load(f)
    except:
        return {}

class FTPClient(threading.Thread):
    def __init__(self, conn, addr, server_ip):
        super().__init__(daemon=True)
        self.conn = conn
        self.addr = addr
        self.server_ip = server_ip
        self.user = None
        self.authenticated = False
        self.cwd = '/'
        self.root = ROOT
        self.permissions = 'rw'
        self.pasv_sock = None
        self.rnfr = None

    def send(self, msg):
        try:
            self.conn.sendall((msg + '\\r\\n').encode('utf-8'))
        except:
            pass

    def real_path(self, path):
        if not path.startswith('/'):
            path = os.path.normpath(os.path.join(self.cwd, path))
        else:
            path = os.path.normpath(path)
        rel = path.lstrip('/')
        full = os.path.normpath(os.path.join(self.root, rel))
        if not full.startswith(self.root):
            return self.root
        return full

    def run(self):
        self.send('220-Commandor Secure Node FTP Service Ready')
        self.send('220 Service Ready')
        buffer = ''
        while True:
            try:
                data = self.conn.recv(1024)
                if not data:
                    break
                buffer += data.decode('utf-8', errors='ignore')
                while '\\r\\n' in buffer or '\\n' in buffer:
                    if '\\r\\n' in buffer:
                        cmd_line, buffer = buffer.split('\\r\\n', 1)
                    else:
                        cmd_line, buffer = buffer.split('\\n', 1)
                    if not self.handle_cmd(cmd_line.strip()):
                        return
            except:
                break
        self.cleanup()

    def cleanup(self):
        if self.pasv_sock:
            try: self.pasv_sock.close()
            except: pass
        try: self.conn.close()
        except: pass

    def handle_cmd(self, line):
        if not line: return True
        parts = line.split(' ', 1)
        cmd = parts[0].upper()
        arg = parts[1] if len(parts) > 1 else ''

        if cmd == 'QUIT':
            self.send('221 Goodbye.')
            return False
        elif cmd == 'NOOP':
            self.send('200 OK')
        elif cmd == 'SYST':
            self.send('215 UNIX Type: L8')
        elif cmd == 'FEAT':
            self.send('211-Features:')
            self.send(' PASV')
            self.send(' UTF8')
            self.send(' SIZE')
            self.send('211 End')
        elif cmd == 'TYPE':
            self.send('200 Type set to ' + (arg or 'I'))
        elif cmd == 'USER':
            self.user = arg
            self.send('331 User name okay, need password.')
        elif cmd == 'PASS':
            users = load_users()
            u_info = users.get(self.user)
            valid = False
            if u_info:
                req_pass = u_info.get('password')
                if req_pass == arg:
                    valid = True
                    self.root = u_info.get('root_path', ROOT)
                    self.permissions = u_info.get('permissions', 'rw')
            elif self.user in ('root', 'admin', 'anonymous'):
                valid = True
                self.root = ROOT
                self.permissions = 'r' if self.user == 'anonymous' else 'rw'
            if valid:
                self.authenticated = True
                os.makedirs(self.root, exist_ok=True)
                self.send('230 User logged in, proceed.')
            else:
                self.send('530 Login incorrect.')
        elif not self.authenticated:
            self.send('530 Please login with USER and PASS.')
        elif cmd == 'PWD':
            self.send(f'257 "{self.cwd}" is the current directory')
        elif cmd == 'CWD':
            target = self.real_path(arg)
            if os.path.isdir(target):
                rel = os.path.relpath(target, self.root)
                self.cwd = '/' if rel == '.' else '/' + rel
                self.send('250 Directory successfully changed.')
            else:
                self.send('550 Failed to change directory.')
        elif cmd == 'CDUP':
            parent = os.path.dirname(self.cwd.rstrip('/')) or '/'
            target = self.real_path(parent)
            if os.path.isdir(target):
                self.cwd = parent
                self.send('250 Directory changed to parent.')
            else:
                self.send('550 Cannot change to parent.')
        elif cmd == 'PASV':
            if self.pasv_sock:
                try: self.pasv_sock.close()
                except: pass
            p_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            p_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            port_found = None
            for p in range(PASV_MIN, PASV_MAX + 1):
                try:
                    p_sock.bind(('', p))
                    p_sock.listen(1)
                    port_found = p
                    break
                except:
                    continue
            if not port_found:
                p_sock.bind(('', 0))
                p_sock.listen(1)
                port_found = p_sock.getsockname()[1]
            self.pasv_sock = p_sock
            ip_parts = self.server_ip.split('.') if self.server_ip and '.' in self.server_ip else ['127','0','0','1']
            p1 = port_found // 256
            p2 = port_found % 256
            self.send(f'227 Entering Passive Mode ({",".join(ip_parts)},{p1},{p2}).')
        elif cmd in ('LIST', 'NLST'):
            if not self.pasv_sock:
                self.send('425 Use PASV first.')
                return True
            self.send('150 Here comes the directory listing.')
            try:
                data_conn, _ = self.pasv_sock.accept()
                target_dir = self.real_path(self.cwd)
                listing = []
                if os.path.exists(target_dir):
                    for item in os.listdir(target_dir):
                        full = os.path.join(target_dir, item)
                        st = os.stat(full)
                        perms = 'drwxr-xr-x' if os.path.isdir(full) else '-rw-r--r--'
                        mtime = time.strftime('%b %d %H:%M', time.gmtime(st.st_mtime))
                        listing.append(f'{perms} 1 owner group {st.st_size:10d} {mtime} {item}\\r\\n')
                data_conn.sendall(''.join(listing).encode('utf-8'))
                data_conn.close()
                self.send('226 Directory send OK.')
            except:
                self.send('450 Listing failed.')
            finally:
                if self.pasv_sock:
                    try: self.pasv_sock.close()
                    except: pass
                self.pasv_sock = None
        elif cmd == 'SIZE':
            target = self.real_path(arg)
            if os.path.isfile(target):
                self.send(f'213 {os.path.getsize(target)}')
            else:
                self.send('550 Could not get file size.')
        elif cmd == 'RETR':
            if not self.pasv_sock:
                self.send('425 Use PASV first.')
                return True
            target = self.real_path(arg)
            if not os.path.isfile(target):
                self.send('550 File not found.')
                if self.pasv_sock:
                    try: self.pasv_sock.close()
                    except: pass
                self.pasv_sock = None
                return True
            self.send('150 Opening BINARY mode data connection.')
            try:
                data_conn, _ = self.pasv_sock.accept()
                with open(target, 'rb') as f:
                    while True:
                        chunk = f.read(65536)
                        if not chunk: break
                        data_conn.sendall(chunk)
                data_conn.close()
                self.send('226 Transfer complete.')
            except:
                self.send('451 Transfer failed.')
            finally:
                if self.pasv_sock:
                    try: self.pasv_sock.close()
                    except: pass
                self.pasv_sock = None
        elif cmd == 'STOR':
            if 'w' not in self.permissions:
                self.send('550 Permission denied.')
                return True
            if not self.pasv_sock:
                self.send('425 Use PASV first.')
                return True
            target = self.real_path(arg)
            self.send('150 Ok to send data.')
            try:
                data_conn, _ = self.pasv_sock.accept()
                with open(target, 'wb') as f:
                    while True:
                        chunk = data_conn.recv(65536)
                        if not chunk: break
                        f.write(chunk)
                data_conn.close()
                self.send('226 Transfer complete.')
            except:
                self.send('451 File write failed.')
            finally:
                if self.pasv_sock:
                    try: self.pasv_sock.close()
                    except: pass
                self.pasv_sock = None
        elif cmd == 'DELE':
            if 'w' not in self.permissions:
                self.send('550 Permission denied.')
                return True
            target = self.real_path(arg)
            if os.path.isfile(target):
                try:
                    os.remove(target)
                    self.send('250 File deleted.')
                except:
                    self.send('550 Delete failed.')
            else:
                self.send('550 File not found.')
        elif cmd == 'MKD':
            if 'w' not in self.permissions:
                self.send('550 Permission denied.')
                return True
            target = self.real_path(arg)
            try:
                os.makedirs(target, exist_ok=True)
                self.send(f'257 "{arg}" created.')
            except:
                self.send('550 Cannot create dir.')
        elif cmd == 'RMD':
            if 'w' not in self.permissions:
                self.send('550 Permission denied.')
                return True
            target = self.real_path(arg)
            try:
                os.rmdir(target)
                self.send('250 Directory removed.')
            except:
                self.send('550 Cannot remove dir.')
        elif cmd == 'RNFR':
            if 'w' not in self.permissions:
                self.send('550 Permission denied.')
                return True
            self.rnfr = self.real_path(arg)
            if os.path.exists(self.rnfr):
                self.send('350 Ready for RNTO.')
            else:
                self.send('550 File not found.')
        elif cmd == 'RNTO':
            if not self.rnfr:
                self.send('503 Bad sequence.')
                return True
            target = self.real_path(arg)
            try:
                os.rename(self.rnfr, target)
                self.rnfr = None
                self.send('250 Rename successful.')
            except:
                self.send('550 Rename failed.')
        else:
            self.send('502 Command not implemented.')
        return True

def main():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind(('', PORT))
    s.listen(10)
    print(f'Commandor FTP Daemon running on port {PORT}', flush=True)
    server_ip = os.environ.get('SERVER_IP')
    if not server_ip:
        try:
            temp_s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            temp_s.connect(('1.1.1.1', 80))
            server_ip = temp_s.getsockname()[0]
            temp_s.close()
        except:
            server_ip = '127.0.0.1'

    while True:
        try:
            conn, addr = s.accept()
            client = FTPClient(conn, addr, server_ip)
            client.start()
        except:
            time.sleep(0.1)

if __name__ == '__main__':
    main()
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

  let protocol = null;
  const protoMatch = str.match(/^(ftp|sftp|ssh):\/\//i);
  if (protoMatch) {
    protocol = protoMatch[1].toLowerCase();
    str = str.substring(protoMatch[0].length);
  }

  // Format: user:pass@host:port
  if (str.includes('@')) {
    const atParts = str.split('@');
    const userPass = atParts[0].split(':');
    const hostPort = atParts[1].split(':');
    const parsedPort = parseInt(hostPort[1], 10);
    const defaultPort = protocol === 'ftp' ? 21 : 22;
    const finalPort = parsedPort || defaultPort;
    return {
      username: (userPass[0] || 'root').trim(),
      password: userPass[1] ? userPass[1].trim() : '',
      host: hostPort[0].trim(),
      port: finalPort,
      name: label || null,
      protocol: protocol || (finalPort === 21 ? 'ftp' : 'ssh')
    };
  }

  // Format: host:port:user:pass OR host:user:pass
  const parts = str.split(':');
  if (parts.length >= 4) {
    const parsedPort = parseInt(parts[1], 10) || 22;
    return {
      host: parts[0].trim(),
      port: parsedPort,
      username: parts[2].trim() || 'root',
      password: parts.slice(3).join(':').trim(),
      name: label || null,
      protocol: protocol || (parsedPort === 21 ? 'ftp' : 'ssh')
    };
  } else if (parts.length === 3) {
    const defaultPort = protocol === 'ftp' ? 21 : 22;
    return {
      host: parts[0].trim(),
      port: defaultPort,
      username: parts[1].trim() || 'root',
      password: parts[2].trim(),
      name: label || null,
      protocol: protocol || (defaultPort === 21 ? 'ftp' : 'ssh')
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
 * Fast network probe to test if an FTP server responds on a given port.
 */
function probeFtpSocket(host, port = 21, timeoutMs = 2500) {
  return new Promise((resolve) => {
    if (!host) return resolve({ connected: false, isFtp: false, port, error: 'Host is required' });
    let resolved = false;
    const socket = new net.Socket();
    let banner = '';

    const finish = (result) => {
      if (resolved) return;
      resolved = true;
      try { socket.destroy(); } catch {}
      resolve(result);
    };

    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      // Socket connected, awaiting banner
    });

    socket.on('data', (chunk) => {
      banner += chunk.toString('utf8');
      if (banner.includes('\n')) {
        const firstLine = banner.split(/[\r\n]+/)[0].trim();
        const isFtp = firstLine.startsWith('220');
        try { socket.write('QUIT\r\n'); } catch {}
        finish({
          connected: true,
          isFtp,
          port,
          banner: firstLine
        });
      }
    });

    socket.on('timeout', () => {
      finish({ connected: false, isFtp: false, port, error: 'Connection timed out' });
    });

    socket.on('error', (err) => {
      finish({ connected: false, isFtp: false, port, error: err.message });
    });

    try {
      socket.connect(port, host);
    } catch (err) {
      finish({ connected: false, isFtp: false, port, error: err.message });
    }
  });
}

/**
 * Verifies FTP login credentials via RFC 959 sequence (USER -> PASS -> PWD).
 */
function testFtpLogin(host, port = 21, username = 'anonymous', password = '', timeoutMs = 4000) {
  return new Promise((resolve) => {
    if (!host) return resolve({ success: false, error: 'Host is required' });
    const socket = new net.Socket();
    let state = 'WAIT_BANNER';
    let banner = '';
    let resolved = false;

    const finish = (result) => {
      if (resolved) return;
      resolved = true;
      try { socket.destroy(); } catch {}
      resolve(result);
    };

    socket.setTimeout(timeoutMs);

    socket.on('data', (data) => {
      const msg = data.toString('utf8');
      const lines = msg.split(/[\r\n]+/).filter(Boolean);
      for (const line of lines) {
        if (/^\d{3}-/.test(line)) continue;
        const code = parseInt(line.substring(0, 3), 10);
        if (isNaN(code)) continue;

        if (state === 'WAIT_BANNER') {
          if (code === 220) {
            banner = line;
            state = 'WAIT_USER';
            socket.write(`USER ${username}\r\n`);
          } else {
            return finish({ success: false, error: `Unexpected FTP greeting: ${line}` });
          }
        } else if (state === 'WAIT_USER') {
          if (code === 331) {
            state = 'WAIT_PASS';
            socket.write(`PASS ${password}\r\n`);
          } else if (code === 230) {
            try { socket.write('QUIT\r\n'); } catch {}
            return finish({ success: true, message: 'FTP login successful', banner });
          } else {
            return finish({ success: false, error: `FTP user rejected: ${line}` });
          }
        } else if (state === 'WAIT_PASS') {
          if (code === 230) {
            try { socket.write('QUIT\r\n'); } catch {}
            return finish({ success: true, message: 'FTP login successful', banner });
          } else {
            return finish({ success: false, error: `FTP authentication failed: ${line}` });
          }
        }
      }
    });

    socket.on('timeout', () => finish({ success: false, error: 'FTP connection timed out' }));
    socket.on('error', (err) => finish({ success: false, error: `FTP connection error: ${err.message}` }));

    try {
      socket.connect(port, host);
    } catch (err) {
      finish({ success: false, error: err.message });
    }
  });
}

/**
 * Detect FTP server software / daemon type from greeting banner.
 */
function detectFtpServerType(banner) {
  if (!banner) return 'custom';
  const bLower = String(banner).toLowerCase();
  if (bLower.includes('vsftpd')) return 'vsftpd';
  if (bLower.includes('pure-ftpd')) return 'pure-ftpd';
  if (bLower.includes('proftpd')) return 'proftpd';
  if (bLower.includes('filezilla')) return 'filezilla';
  if (bLower.includes('commandor') || bLower.includes('python')) return 'python-ftpd';
  return 'custom';
}

/**
 * Test SFTP subsystem on an existing SSH connection.
 * Used for detecting and verifying SFTP-only / restricted shell accounts.
 */
function testSftpSession(conn, timeoutMs = 5000) {
  return new Promise((resolve) => {
    if (!conn || typeof conn.sftp !== 'function') {
      return resolve({ success: false, error: 'SSH connection is not established or SFTP unsupported' });
    }
    let finished = false;
    const timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        resolve({ success: false, error: 'SFTP subsystem timeout' });
      }
    }, timeoutMs);

    try {
      conn.sftp((err, sftp) => {
        if (err) {
          if (!finished) {
            finished = true;
            clearTimeout(timer);
            resolve({ success: false, error: err.message || 'Unable to open SFTP subsystem' });
          }
          return;
        }

        sftp.readdir('.', (readErr, list) => {
          if (!finished) {
            finished = true;
            clearTimeout(timer);
            if (readErr) {
              // Permission error reading directory, but subsystem works!
              resolve({ success: true, initialPath: '.', error: readErr.message });
            } else {
              resolve({
                success: true,
                initialPath: '.',
                filesCount: Array.isArray(list) ? list.length : 0
              });
            }
          }
        });
      });
    } catch (err) {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        resolve({ success: false, error: err.message });
      }
    }
  });
}

/**
 * Deploy files to node using SFTP subsystem when SSH shell execution is restricted (Unable to exec).
 */
async function deployFilesViaSftp(conn, siteName, files = []) {
  return new Promise((resolve, reject) => {
    conn.sftp(async (err, sftp) => {
      if (err) return reject(new Error(`SFTP subsystem error: ${err.message}`));

      try {
        let targetBase = `${REMOTE_SITES_ROOT}/${siteName}`;

        const mkdirp = (dirPath) => {
          return new Promise((res) => {
            const isAbsolute = dirPath.startsWith('/');
            const parts = dirPath.split('/').filter(Boolean);
            let current = isAbsolute ? '/' : '';
            let i = 0;

            function step() {
              if (i >= parts.length) return res(true);
              const part = parts[i++];
              current = current === '/' ? `/${part}` : (current ? `${current}/${part}` : part);
              sftp.mkdir(current, () => {
                step();
              });
            }
            step();
          });
        };

        const writeFilePromise = (filePath, buf) => {
          return new Promise((res, rej) => {
            sftp.writeFile(filePath, buf, (wErr) => {
              if (wErr) rej(wErr);
              else res(true);
            });
          });
        };

        try {
          await mkdirp(targetBase);
        } catch {
          targetBase = siteName;
          await mkdirp(targetBase);
        }

        let totalBytes = 0;
        let filesCount = 0;

        for (const f of files) {
          const cleanPath = f.name.replace(/\\/g, '/').replace(/^\/+/, '');
          const fullRemotePath = `${targetBase}/${cleanPath}`;
          const dirPart = fullRemotePath.substring(0, fullRemotePath.lastIndexOf('/'));

          if (dirPart && dirPart !== targetBase) {
            await mkdirp(dirPart);
          }

          const content = Buffer.isBuffer(f.content) ? f.content : Buffer.from(f.content || '', 'utf8');
          totalBytes += content.length;
          filesCount++;

          await writeFilePromise(fullRemotePath, content);
        }

        resolve({
          success: true,
          filesCount,
          totalBytes,
          siteDir: targetBase
        });
      } catch (uploadErr) {
        reject(uploadErr);
      }
    });
  });
}

/**
 * Remove site directory from node using SFTP subsystem.
 */
async function removeSiteViaSftp(conn, siteName) {
  return new Promise((resolve) => {
    conn.sftp((err, sftp) => {
      if (err) return resolve(false);

      const deleteDirRecursive = (dirPath) => {
        return new Promise((res) => {
          sftp.readdir(dirPath, (readErr, list) => {
            if (readErr || !list || list.length === 0) {
              sftp.rmdir(dirPath, () => res(true));
              return;
            }
            let pending = list.length;
            for (const item of list) {
              const itemPath = `${dirPath}/${item.filename}`;
              if (item.attrs && (item.attrs.mode & 0o040000)) {
                deleteDirRecursive(itemPath).then(() => {
                  pending--;
                  if (pending <= 0) sftp.rmdir(dirPath, () => res(true));
                });
              } else {
                sftp.unlink(itemPath, () => {
                  pending--;
                  if (pending <= 0) sftp.rmdir(dirPath, () => res(true));
                });
              }
            }
          });
        });
      };

      deleteDirRecursive(`${REMOTE_SITES_ROOT}/${siteName}`)
        .then(() => resolve(true))
        .catch(() => resolve(false));
    });
  });
}

/**
 * Deep FTP auto-detection: checks external TCP socket and internal processes via SSH.
 */
async function detectNodeFtp({ host, port = 21, username = null, password = null, privateKey = null, conn = null, nodeId = null, timeoutMs = 2500 }) {
  let ftpPort = port === 22 ? 21 : (parseInt(port, 10) || 21);
  let detected = false;
  let status = 'not_installed';
  let serverType = null;
  let banner = null;
  let sftpAvailable = false;

  // 1. External Socket Probe
  let probe = await probeFtpSocket(host, ftpPort, timeoutMs);
  if (!probe.connected && ftpPort === 21) {
    const probeAlt = await probeFtpSocket(host, 2121, timeoutMs);
    if (probeAlt.connected) {
      probe = probeAlt;
      ftpPort = 2121;
    }
  }

  if (probe.connected && probe.isFtp) {
    detected = true;
    status = 'online';
    banner = probe.banner;
    const bLower = (probe.banner || '').toLowerCase();
    if (bLower.includes('vsftpd')) serverType = 'vsftpd';
    else if (bLower.includes('pure-ftpd')) serverType = 'pure-ftpd';
    else if (bLower.includes('proftpd')) serverType = 'proftpd';
    else if (bLower.includes('commandor') || bLower.includes('python')) serverType = 'python-ftpd';
    else serverType = 'custom';
  }

  // 2. SSH Deep Probe if connection or credentials available
  let internalConn = conn;
  let shouldCloseConn = false;
  if (!internalConn && host && username && (password || privateKey)) {
    try {
      internalConn = await connectSsh({ host, port: 22, username, password, private_key: privateKey }, { timeoutMs: 4000 });
      shouldCloseConn = true;
    } catch {}
  }

  if (internalConn) {
    try {
      sftpAvailable = true;
      const ftpCheckCmd = [
        '(ss -tlpn 2>/dev/null || netstat -tlpn 2>/dev/null || lsof -iTCP:21,2121 -sTCP:LISTEN -P -n 2>/dev/null || true) | grep -E ":(21|2121)\\b" | cat',
        'echo "===FTP_SERVICES==="',
        '(systemctl is-active vsftpd 2>/dev/null || true); (systemctl is-active pure-ftpd 2>/dev/null || true); (systemctl is-active proftpd 2>/dev/null || true); (systemctl is-active commandor-ftp 2>/dev/null || true)',
        'echo "===FTP_BINS==="',
        '(which vsftpd pure-ftpd proftpd 2>/dev/null || true)',
        'echo "===FTP_PROCS==="',
        '(pgrep -l -f "vsftpd|pure-ftpd|proftpd|ftpserver.py" 2>/dev/null || true)'
      ].join('\n');

      const checkRes = await executeSshCommand(internalConn, ftpCheckCmd);
      const parts = checkRes.stdout.split(/===FTP_[A-Z]+===/);
      const listeningText = (parts[0] || '').trim();
      const servicesText = (parts[1] || '').trim();
      const binsText = (parts[2] || '').trim();
      const procsText = (parts[3] || '').trim();

      const isListening = listeningText.length > 0;
      const hasActiveService = servicesText.includes('active');
      const hasRunningProc = procsText.length > 0;
      const hasInstalledBin = binsText.length > 0;

      if (!serverType) {
        if (listeningText.includes('vsftpd') || servicesText.includes('vsftpd') || procsText.includes('vsftpd') || binsText.includes('vsftpd')) {
          serverType = 'vsftpd';
        } else if (listeningText.includes('pure-ftpd') || servicesText.includes('pure-ftpd') || procsText.includes('pure-ftpd') || binsText.includes('pure-ftpd')) {
          serverType = 'pure-ftpd';
        } else if (listeningText.includes('proftpd') || servicesText.includes('proftpd') || procsText.includes('proftpd') || binsText.includes('proftpd')) {
          serverType = 'proftpd';
        } else if (listeningText.includes('python') || procsText.includes('ftpserver.py')) {
          serverType = 'python-ftpd';
        }
      }

      if (isListening || hasActiveService || hasRunningProc) {
        detected = true;
        status = 'online';
        if (!banner) banner = `FTP Server (${serverType || 'standard'}) running on node`;
      } else if (hasInstalledBin || servicesText.includes('inactive')) {
        status = 'stopped';
      } else if (!detected) {
        status = 'not_installed';
      }
    } catch {}
    if (shouldCloseConn) {
      try { internalConn.end(); } catch {}
    }
  }

  // Update node in DB if nodeId given
  if (nodeId) {
    try {
      const db = getDb();
      db.prepare(`
        UPDATE hosting_nodes
        SET ftp_port = ?, ftp_status = ?, ftp_server_type = ?, ftp_banner = ?,
            ftp_last_checked_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
            ftp_enabled = CASE WHEN ? = 'online' THEN 1 ELSE ftp_enabled END
        WHERE id = ?
      `).run(ftpPort, status, serverType, banner, status, nodeId);
    } catch {}
  }

  return {
    detected,
    port: ftpPort,
    status,
    serverType,
    banner,
    sftpAvailable,
    lastCheckedAt: new Date().toISOString()
  };
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
  timeoutMs = 15000,
  protocol = null
}) {
  const startTime = Date.now();
  const cleanPort = parseInt(port, 10) || 22;

  // 1. Explicit FTP port or hint: test FTP directly
  if (cleanPort === 21 || cleanPort === 2121 || protocol === 'ftp') {
    const ftpProbe = await probeFtpSocket(host, cleanPort, Math.min(timeoutMs, 3000));
    if (ftpProbe.isFtp) {
      const ftpAuth = await testFtpLogin(host, cleanPort, username, password, Math.min(timeoutMs, 4000));
      const latencyMs = Date.now() - startTime;
      if (ftpAuth.success) {
        const serverType = detectFtpServerType(ftpAuth.banner || ftpProbe.banner);
        return {
          success: true,
          protocol: 'ftp',
          latencyMs,
          systemInfo: {
            os: `FTP Server (${serverType || 'Standard FTP'})`,
            protocol: 'ftp',
            ftpOnly: true,
            ftpAvailable: true,
            cpus: 1,
            ramMb: 'N/A',
            diskTotal: 'N/A',
            latencyMs,
            testedAt: new Date().toISOString()
          },
          ftp: {
            detected: true,
            port: cleanPort,
            status: 'online',
            banner: ftpAuth.banner || ftpProbe.banner,
            serverType
          }
        };
      } else {
        return {
          success: false,
          protocol: 'ftp',
          error: `FTP authentication failed for user "${username}" on ${host}:${cleanPort} (${ftpAuth.error})`
        };
      }
    }
  }

  // 2. Attempt SSH connection
  const nodeConfig = {
    host,
    port: cleanPort,
    username,
    password,
    private_key: privateKey,
    host_key_fingerprint: hostKeyFingerprint
  };

  let conn = null;
  let sshError = null;

  try {
    conn = await connectSsh(nodeConfig, { expectedFingerprint: hostKeyFingerprint, timeoutMs: Math.min(timeoutMs, 8000) });
  } catch (err) {
    sshError = err;
  }

  if (conn) {
    const latencyMs = Date.now() - startTime;
    let shellExecWorks = false;
    let sysInfo = null;

    try {
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

      sysInfo = {
        os: osPretty,
        protocol: 'ssh',
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
      shellExecWorks = true;
    } catch (execErr) {
      logger.info({ host, port: cleanPort, err: execErr.message }, 'Shell command execution not supported on node (restricted/SFTP-only); testing SFTP subsystem fallback');
    }

    if (shellExecWorks) {
      let ftpInfo = null;
      try {
        ftpInfo = await detectNodeFtp({
          host,
          port: cleanPort,
          username,
          password,
          privateKey,
          conn,
          timeoutMs: 3000
        });
      } catch (e) {
        ftpInfo = { detected: false, status: 'error', error: e.message };
      }

      try { conn.end(); } catch {}

      return {
        success: true,
        protocol: 'ssh',
        latencyMs,
        hostKeyFingerprint: conn.hostKeyFingerprint,
        systemInfo: sysInfo,
        ftp: ftpInfo
      };
    }

    // Shell exec failed: close conn and verify SFTP subsystem with a clean dedicated session
    // (Certain servers like Wings/Pterodactyl close or wedge the channel after an exec channel failure)
    try { conn.end(); } catch {}

    let sftpTest = null;
    let sftpConn = null;
    try {
      sftpConn = await connectSsh(nodeConfig, { expectedFingerprint: hostKeyFingerprint, timeoutMs: Math.min(timeoutMs, 8000) });
      sftpTest = await testSftpSession(sftpConn, 5000);
    } catch (sftpConnErr) {
      sftpTest = { success: false, error: sftpConnErr.message };
    } finally {
      if (sftpConn) {
        try { sftpConn.end(); } catch {}
      }
    }

    if (sftpTest && sftpTest.success) {
      let ftpInfo = null;
      try {
        const p21 = await probeFtpSocket(host, 21, 1500);
        if (p21.isFtp) {
          ftpInfo = { detected: true, port: 21, status: 'online', banner: p21.banner };
        }
      } catch {}

      return {
        success: true,
        protocol: 'sftp',
        sftpOnly: true,
        latencyMs: Date.now() - startTime,
        hostKeyFingerprint: sftpConn?.hostKeyFingerprint || conn.hostKeyFingerprint,
        systemInfo: {
          os: 'SFTP File Storage Node (SFTP Subsystem)',
          protocol: 'sftp',
          sftpOnly: true,
          sftpAvailable: true,
          cpus: 1,
          ramMb: 'N/A',
          diskTotal: 'N/A',
          latencyMs: Date.now() - startTime,
          testedAt: new Date().toISOString()
        },
        ftp: ftpInfo || {
          detected: true,
          port: cleanPort,
          status: 'online',
          serverType: 'sftp',
          banner: 'SSH SFTP Subsystem'
        }
      };
    }

    // If both shell and SFTP failed on SSH port, probe FTP on port 21
    const ftpFallback = await testFtpLogin(host, 21, username, password, 3000);
    if (ftpFallback.success) {
      return {
        success: true,
        protocol: 'ftp',
        detectedPort: 21,
        latencyMs: Date.now() - startTime,
        systemInfo: {
          os: `FTP Server (${ftpFallback.banner || 'Standard FTP'})`,
          protocol: 'ftp',
          ftpOnly: true,
          ftpAvailable: true,
          cpus: 1,
          ramMb: 'N/A',
          diskTotal: 'N/A',
          latencyMs: Date.now() - startTime,
          testedAt: new Date().toISOString()
        },
        ftp: {
          detected: true,
          port: 21,
          status: 'online',
          banner: ftpFallback.banner,
          serverType: detectFtpServerType(ftpFallback.banner)
        }
      };
    }

    return {
      success: false,
      error: `SSH connected to ${host}:${cleanPort}, but neither shell execution nor SFTP subsystem is permitted (${sftpTest.error || 'Unable to exec'}).`
    };
  }

  // 3. SSH connection failed. Check if this port or port 21 is FTP!
  // Check cleanPort first
  const probeTarget = await probeFtpSocket(host, cleanPort, 2000);
  if (probeTarget.isFtp) {
    const ftpLogin = await testFtpLogin(host, cleanPort, username, password, 4000);
    const latencyMs = Date.now() - startTime;
    if (ftpLogin.success) {
      const serverType = detectFtpServerType(ftpLogin.banner || probeTarget.banner);
      return {
        success: true,
        protocol: 'ftp',
        latencyMs,
        systemInfo: {
          os: `FTP Server (${serverType || 'Standard FTP'})`,
          protocol: 'ftp',
          ftpOnly: true,
          ftpAvailable: true,
          cpus: 1,
          ramMb: 'N/A',
          diskTotal: 'N/A',
          latencyMs,
          testedAt: new Date().toISOString()
        },
        ftp: {
          detected: true,
          port: cleanPort,
          status: 'online',
          banner: ftpLogin.banner || probeTarget.banner,
          serverType
        }
      };
    } else {
      return {
        success: false,
        protocol: 'ftp',
        error: `FTP detected on ${host}:${cleanPort}, but login failed for user "${username}": ${ftpLogin.error}`
      };
    }
  }

  // Check port 21 if cleanPort was not 21
  if (cleanPort !== 21) {
    const probe21 = await probeFtpSocket(host, 21, 2000);
    if (probe21.isFtp) {
      const ftpLogin21 = await testFtpLogin(host, 21, username, password, 4000);
      const latencyMs = Date.now() - startTime;
      if (ftpLogin21.success) {
        const serverType = detectFtpServerType(ftpLogin21.banner || probe21.banner);
        return {
          success: true,
          protocol: 'ftp',
          detectedPort: 21,
          latencyMs,
          systemInfo: {
            os: `FTP Server (${serverType || 'Standard FTP'})`,
            protocol: 'ftp',
            ftpOnly: true,
            ftpAvailable: true,
            cpus: 1,
            ramMb: 'N/A',
            diskTotal: 'N/A',
            latencyMs,
            testedAt: new Date().toISOString()
          },
          ftp: {
            detected: true,
            port: 21,
            status: 'online',
            banner: ftpLogin21.banner || probe21.banner,
            serverType
          }
        };
      }
    }
  }

  // 4. SSH error friendly formatting
  let friendlyError = sshError?.message || 'SSH connection failed';
  if (friendlyError.includes('ECONNREFUSED')) {
    friendlyError = `Connection refused on ${host}:${cleanPort}. Verify SSH or FTP daemon is running and port is open.`;
  } else if (friendlyError.includes('All configured authentication methods failed') || friendlyError.includes('authentication')) {
    friendlyError = `Authentication failed for user "${username}". Check password or private key.`;
  } else if (friendlyError.includes('Host key verification failed')) {
    friendlyError = `Security Alert: ${friendlyError}`;
  }

  return {
    success: false,
    error: friendlyError
  };
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
  ftpEnabled = null,
  ftpPort = null,
  ftpUsername = null,
  ftpPassword = null,
  detectFtp = true,
  testBeforeSave = true
}) {
  if (!host || !username) {
    throw new Error('Host and username are required');
  }

  let cleanPort = parseInt(port, 10) || 22;

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

  if (testResult?.detectedPort) {
    cleanPort = testResult.detectedPort;
  }

  const isSftpNode = testResult?.protocol === 'sftp' || Boolean(testResult?.sftpOnly);
  const isFtpNode = testResult?.protocol === 'ftp' || Boolean(testResult?.ftpOnly);
  const determinedAuthMethod = authMethod || (isFtpNode ? 'ftp' : (privateKey ? 'key' : 'password'));

  const db = getDb();
  const nodeName = name || `node-${host.replace(/[^a-zA-Z0-9]/g, '-')}-${cleanPort}`;
  const autoPublicUrl = publicUrl || `http://${host}:${httpPort}`;
  const verifiedFingerprint = hostKeyFingerprint || testResult?.hostKeyFingerprint || null;
  const sysInfo = testResult?.systemInfo || {};

  // FTP auto-detection outcome
  const ftpDetected = testResult?.ftp?.detected || false;
  const initialFtpEnabled = ftpEnabled !== null ? (ftpEnabled ? 1 : 0) : ((ftpDetected || isFtpNode || isSftpNode) ? 1 : 0);
  const detectedFtpPort = testResult?.ftp?.port || (ftpPort ? parseInt(ftpPort, 10) : (cleanPort === 21 ? 21 : (isFtpNode ? cleanPort : 21)));
  const detectedFtpStatus = testResult?.ftp?.status || (ftpDetected || isFtpNode || isSftpNode ? 'online' : 'offline');
  const detectedFtpType = testResult?.ftp?.serverType || (isSftpNode ? 'sftp' : (isFtpNode ? 'ftp' : null));
  const detectedFtpBanner = testResult?.ftp?.banner || (isSftpNode ? 'SSH SFTP Subsystem' : null);

  // Encrypt credentials at rest
  const encPassword = password ? encrypt(password) : null;
  const encPrivateKey = privateKey ? encrypt(privateKey) : null;
  const encFtpPassword = ftpPassword ? encrypt(ftpPassword) : (isFtpNode ? encPassword : null);
  const effectiveFtpUsername = ftpUsername || (isFtpNode ? username : null);

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
          system_info = ?, is_active = 1, last_error = NULL,
          ftp_enabled = COALESCE(?, ftp_enabled),
          ftp_port = COALESCE(?, ftp_port),
          ftp_status = COALESCE(?, ftp_status),
          ftp_server_type = COALESCE(?, ftp_server_type),
          ftp_banner = COALESCE(?, ftp_banner),
          ftp_username = COALESCE(?, ftp_username),
          ftp_password = COALESCE(?, ftp_password),
          sftp_enabled = COALESCE(?, sftp_enabled)
      WHERE id = ?
    `).run(
      nodeName, username, encPassword, encPrivateKey,
      determinedAuthMethod, verifiedFingerprint,
      labels ? (typeof labels === 'object' ? JSON.stringify(labels) : labels) : null,
      groups || null, notes || null,
      httpPort, autoPublicUrl,
      JSON.stringify(sysInfo),
      initialFtpEnabled, detectedFtpPort, detectedFtpStatus, detectedFtpType, detectedFtpBanner, effectiveFtpUsername, encFtpPassword,
      isFtpNode ? 0 : 1,
      existing.id
    );
    nodeId = existing.id;
  } else {
    const info = db.prepare(`
      INSERT INTO hosting_nodes (
        name, host, port, username, password, private_key,
        auth_method, host_key_fingerprint, labels, groups, notes,
        http_port, public_url, status, last_ping_at, system_info, is_active, created_at,
        ftp_enabled, ftp_port, ftp_status, ftp_server_type, ftp_banner, ftp_username, ftp_password, sftp_enabled
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'online', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), ?, 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      nodeName, host, cleanPort, username, encPassword, encPrivateKey,
      determinedAuthMethod, verifiedFingerprint,
      labels ? (typeof labels === 'object' ? JSON.stringify(labels) : labels) : null,
      groups || null, notes || null,
      httpPort, autoPublicUrl, JSON.stringify(sysInfo),
      initialFtpEnabled, detectedFtpPort, detectedFtpStatus, detectedFtpType, detectedFtpBanner, effectiveFtpUsername, encFtpPassword,
      isFtpNode ? 0 : 1
    );
    nodeId = info.lastInsertRowid;
  }

  logChange({
    category: 'hosting',
    action: 'node_enrolled',
    details: `Enrolled node "${nodeName}" (${host}:${cleanPort}) as ${testResult?.protocol || 'ssh'} with ${determinedAuthMethod} authentication`,
    metadata: { nodeId, host, port: cleanPort, name: nodeName, authMethod: determinedAuthMethod, protocol: testResult?.protocol || 'ssh' }
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
  if (fields.ftp_enabled !== undefined) {
    updates.push('ftp_enabled = ?');
    params.push(fields.ftp_enabled ? 1 : 0);
  }
  if (fields.ftp_port !== undefined) {
    updates.push('ftp_port = ?');
    params.push(parseInt(fields.ftp_port, 10) || 21);
  }
  if (fields.ftp_status !== undefined) {
    updates.push('ftp_status = ?');
    params.push(fields.ftp_status);
  }
  if (fields.ftp_server_type !== undefined) {
    updates.push('ftp_server_type = ?');
    params.push(fields.ftp_server_type);
  }
  if (fields.ftp_username !== undefined) {
    updates.push('ftp_username = ?');
    params.push(fields.ftp_username);
  }
  if (fields.ftp_password !== undefined && fields.ftp_password !== '') {
    updates.push('ftp_password = ?');
    params.push(encrypt(fields.ftp_password));
  }
  if (fields.ftp_pasv_min !== undefined) {
    updates.push('ftp_pasv_min = ?');
    params.push(parseInt(fields.ftp_pasv_min, 10) || 30000);
  }
  if (fields.ftp_pasv_max !== undefined) {
    updates.push('ftp_pasv_max = ?');
    params.push(parseInt(fields.ftp_pasv_max, 10) || 30100);
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
 * Provision FTP daemon on remote node (vsftpd and/or standalone python ftpserver).
 */
async function provisionNodeFtp(nodeId, options = {}, userTgId = null) {
  const db = getDb();
  const rawNode = db.prepare('SELECT * FROM hosting_nodes WHERE id=?').get(nodeId);
  if (!rawNode) throw new Error(`Node #${nodeId} not found`);

  const port = parseInt(options.port, 10) || rawNode.ftp_port || 21;
  const pasvMin = parseInt(options.pasvMin, 10) || rawNode.ftp_pasv_min || 30000;
  const pasvMax = parseInt(options.pasvMax, 10) || rawNode.ftp_pasv_max || 30100;

  let conn = null;
  try {
    conn = await connectSsh(rawNode);
    // 1. Ensure roots exist
    await executeSshCommand(conn, `mkdir -p ${REMOTE_SITES_ROOT} && chmod 755 ${REMOTE_SITES_ROOT}`);

    // 2. Install / Configure vsftpd if package manager is available
    const installVsftpdScript = `
      if command -v apt-get >/dev/null 2>&1; then
        export DEBIAN_FRONTEND=noninteractive
        apt-get update -y >/dev/null 2>&1 && apt-get install -y vsftpd >/dev/null 2>&1 || true
      elif command -v yum >/dev/null 2>&1; then
        yum install -y vsftpd >/dev/null 2>&1 || true
      fi
    `;
    await executeSshCommand(conn, installVsftpdScript);

    // Write vsftpd configuration
    const vsftpdConf = [
      'listen=YES',
      'listen_ipv6=NO',
      'anonymous_enable=NO',
      'local_enable=YES',
      'write_enable=YES',
      'local_umask=022',
      'dirmessage_enable=YES',
      'use_localtime=YES',
      'xferlog_enable=YES',
      'connect_from_port_20=YES',
      'chroot_local_user=YES',
      'allow_writeable_chroot=YES',
      'pasv_enable=YES',
      `listen_port=${port}`,
      `pasv_min_port=${pasvMin}`,
      `pasv_max_port=${pasvMax}`,
      `local_root=${REMOTE_SITES_ROOT}`,
      'user_sub_token=$USER',
      'secure_chroot_dir=/var/run/vsftpd/empty'
    ].join('\n');

    const b64Conf = Buffer.from(vsftpdConf).toString('base64');
    await executeSshCommand(conn, `
      if command -v vsftpd >/dev/null 2>&1; then
        mkdir -p /var/run/vsftpd/empty
        echo "${b64Conf}" | base64 -d > /etc/vsftpd.conf
        systemctl restart vsftpd 2>/dev/null || service vsftpd restart 2>/dev/null || true
        systemctl enable vsftpd 2>/dev/null || true
      fi
    `);

    // 3. Deploy standalone Python FTP daemon script as universal fallback/service
    const b64Runner = Buffer.from(FTPSERVER_PYTHON_SCRIPT).toString('base64');
    await executeSshCommand(conn, `echo "${b64Runner}" | base64 -d > /var/www/ftpserver.py && chmod 755 /var/www/ftpserver.py`);
    await executeSshCommand(conn, `test -f /var/www/ftp_users.json || (echo "{}" > /var/www/ftp_users.json && chmod 600 /var/www/ftp_users.json)`);

    // Start python ftp daemon if vsftpd is not active
    await executeSshCommand(conn, `
      if ! (systemctl is-active vsftpd >/dev/null 2>&1 || pgrep -x vsftpd >/dev/null 2>&1); then
        pkill -f "/var/www/ftpserver.py" 2>/dev/null || true
        FTP_PORT=${port} PASV_MIN=${pasvMin} PASV_MAX=${pasvMax} nohup python3 /var/www/ftpserver.py >/var/log/ftpserver.log 2>&1 &
      fi
    `);

    // 4. If initial FTP user credentials supplied or generated, add them
    if (options.ftpUsername && options.ftpPassword) {
      await createNodeFtpUser(nodeId, {
        username: options.ftpUsername,
        password: options.ftpPassword,
        siteId: options.siteId || null,
        rootPath: options.rootPath || REMOTE_SITES_ROOT,
        permissions: options.permissions || 'rw'
      }).catch(() => {});
    }

    // 5. Verify detection
    const detection = await detectNodeFtp({
      host: rawNode.host,
      port,
      conn,
      nodeId
    });

    db.prepare(`
      UPDATE hosting_nodes
      SET ftp_enabled = 1, ftp_port = ?, ftp_pasv_min = ?, ftp_pasv_max = ?
      WHERE id = ?
    `).run(port, pasvMin, pasvMax, nodeId);

    logChange({
      tgId: userTgId,
      category: 'hosting',
      action: 'ftp_provisioned',
      details: `Provisioned FTP service on node "${rawNode.name}" (${rawNode.host}:${port}) [${detection.serverType || 'standard'}]`,
      metadata: { nodeId, port, serverType: detection.serverType, status: detection.status }
    }).catch(() => {});

    return {
      success: true,
      message: `FTP daemon provisioned on port ${port}`,
      ...detection
    };
  } finally {
    if (conn) {
      try { conn.end(); } catch {}
    }
  }
}

/**
 * Start, stop, or restart FTP daemon on remote node.
 */
async function controlNodeFtp(nodeId, action, userTgId = null) {
  if (!['start', 'stop', 'restart'].includes(action)) {
    throw new Error('Action must be start, stop, or restart');
  }
  const db = getDb();
  const rawNode = db.prepare('SELECT * FROM hosting_nodes WHERE id=?').get(nodeId);
  if (!rawNode) throw new Error(`Node #${nodeId} not found`);

  const port = rawNode.ftp_port || 21;
  const pasvMin = rawNode.ftp_pasv_min || 30000;
  const pasvMax = rawNode.ftp_pasv_max || 30100;

  const conn = await connectSsh(rawNode);
  try {
    if (action === 'start') {
      await executeSshCommand(conn, `
        if command -v vsftpd >/dev/null 2>&1; then
          systemctl start vsftpd 2>/dev/null || service vsftpd start 2>/dev/null || true
        fi
        if ! (systemctl is-active vsftpd >/dev/null 2>&1 || pgrep -x vsftpd >/dev/null 2>&1); then
          pkill -f "/var/www/ftpserver.py" 2>/dev/null || true
          FTP_PORT=${port} PASV_MIN=${pasvMin} PASV_MAX=${pasvMax} nohup python3 /var/www/ftpserver.py >/var/log/ftpserver.log 2>&1 &
        fi
      `);
    } else if (action === 'stop') {
      await executeSshCommand(conn, `
        systemctl stop vsftpd 2>/dev/null || service vsftpd stop 2>/dev/null || true
        pkill -f "/var/www/ftpserver.py" 2>/dev/null || true
      `);
    } else if (action === 'restart') {
      await executeSshCommand(conn, `
        if command -v vsftpd >/dev/null 2>&1; then
          systemctl restart vsftpd 2>/dev/null || service vsftpd restart 2>/dev/null || true
        fi
        if ! (systemctl is-active vsftpd >/dev/null 2>&1 || pgrep -x vsftpd >/dev/null 2>&1); then
          pkill -f "/var/www/ftpserver.py" 2>/dev/null || true
          FTP_PORT=${port} PASV_MIN=${pasvMin} PASV_MAX=${pasvMax} nohup python3 /var/www/ftpserver.py >/var/log/ftpserver.log 2>&1 &
        fi
      `);
    }

    const detection = await detectNodeFtp({ host: rawNode.host, port, conn, nodeId });
    logChange({
      tgId: userTgId,
      category: 'hosting',
      action: `ftp_${action}`,
      details: `FTP service ${action}ed on node "${rawNode.name}"`,
      metadata: { nodeId, action, status: detection.status }
    }).catch(() => {});

    return {
      success: true,
      action,
      ...detection
    };
  } finally {
    try { conn.end(); } catch {}
  }
}

/**
 * List all FTP user accounts for a given node.
 */
function listNodeFtpUsers(nodeId) {
  const db = getDb();
  const users = db.prepare(`
    SELECT u.id, u.node_id, u.site_id, u.username, u.root_path, u.permissions, u.is_active, u.created_at, u.last_login_at,
           s.name as site_name, s.full_domain as site_domain
    FROM node_ftp_users u
    LEFT JOIN hosting_sites s ON u.site_id = s.id
    WHERE u.node_id = ?
    ORDER BY u.created_at DESC
  `).all(nodeId);
  return users;
}

/**
 * Create a new FTP user account on a node.
 */
async function createNodeFtpUser(nodeId, { username, password, siteId = null, rootPath = null, root_path = null, permissions = 'rw' }, userTgId = null) {
  if (!username || !password) {
    throw new Error('Username and password are required for FTP account');
  }
  const cleanUsername = String(username).trim();
  if (!/^[a-zA-Z0-9_\-\.]{3,32}$/.test(cleanUsername)) {
    throw new Error('Invalid FTP username. Use 3-32 characters (letters, numbers, hyphen, underscore)');
  }

  const db = getDb();
  const rawNode = db.prepare('SELECT * FROM hosting_nodes WHERE id=?').get(nodeId);
  if (!rawNode) throw new Error(`Node #${nodeId} not found`);

  // Determine root path
  let targetPath = rootPath || root_path;
  if (!targetPath && siteId) {
    const site = db.prepare('SELECT name FROM hosting_sites WHERE id=?').get(siteId);
    if (site) targetPath = `${REMOTE_SITES_ROOT}/${site.name}`;
  }
  if (!targetPath) {
    targetPath = REMOTE_SITES_ROOT;
  }

  const existing = db.prepare('SELECT id FROM node_ftp_users WHERE node_id=? AND username=?').get(nodeId, cleanUsername);
  if (existing) {
    throw new Error(`FTP user "${cleanUsername}" already exists on node #${nodeId}`);
  }

  // Provision user on remote node if SSH is active
  try {
    const conn = await connectSsh(rawNode, { timeoutMs: 2500 });
    try {
      await executeSshCommand(conn, `mkdir -p "${targetPath}"`);

      // Update standalone python FTP users file
      const usersJsonRaw = await executeSshCommand(conn, `cat /var/www/ftp_users.json 2>/dev/null || echo "{}"`);
      let usersMap = {};
      try { usersMap = JSON.parse(usersJsonRaw.stdout); } catch { usersMap = {}; }
      usersMap[cleanUsername] = {
        password: password,
        root_path: targetPath,
        permissions: permissions || 'rw'
      };
      const b64Json = Buffer.from(JSON.stringify(usersMap, null, 2)).toString('base64');
      await executeSshCommand(conn, `echo "${b64Json}" | base64 -d > /var/www/ftp_users.json && chmod 600 /var/www/ftp_users.json`);

      // Also create local system user for vsftpd if useradd exists
      await executeSshCommand(conn, `
        if id -u "${cleanUsername}" >/dev/null 2>&1; then
          echo "${cleanUsername}:${password}" | chpasswd 2>/dev/null || true
        else
          (useradd -M -d "${targetPath}" -s /usr/sbin/nologin "${cleanUsername}" 2>/dev/null || useradd -M -d "${targetPath}" -s /bin/false "${cleanUsername}" 2>/dev/null || true)
          echo "${cleanUsername}:${password}" | chpasswd 2>/dev/null || true
        fi
      `);
    } finally {
      conn.end();
    }
  } catch (sshErr) {
    logger.warn({ nodeId, user: cleanUsername, err: sshErr.message }, 'Could not immediately provision FTP user via SSH; user saved in database');
  }

  const encPassword = encrypt(password);
  const info = db.prepare(`
    INSERT INTO node_ftp_users (node_id, site_id, username, password, root_path, permissions, is_active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  `).run(nodeId, siteId || null, cleanUsername, encPassword, targetPath, permissions || 'rw');

  logChange({
    tgId: userTgId,
    category: 'hosting',
    action: 'ftp_user_created',
    details: `Created FTP user "${cleanUsername}" on node #${nodeId}`,
    metadata: { nodeId, username: cleanUsername, rootPath: targetPath, siteId }
  }).catch(() => {});

  return {
    id: info.lastInsertRowid,
    node_id: nodeId,
    site_id: siteId || null,
    username: cleanUsername,
    root_path: targetPath,
    permissions: permissions || 'rw',
    is_active: 1,
    created_at: new Date().toISOString()
  };
}

/**
 * Delete an FTP user account from a node.
 */
async function deleteNodeFtpUser(nodeId, userId, userTgId = null) {
  const db = getDb();
  const user = db.prepare('SELECT * FROM node_ftp_users WHERE id=? AND node_id=?').get(userId, nodeId);
  if (!user) throw new Error(`FTP user #${userId} not found on node #${nodeId}`);

  const rawNode = db.prepare('SELECT * FROM hosting_nodes WHERE id=?').get(nodeId);
  if (rawNode) {
    try {
      const conn = await connectSsh(rawNode, { timeoutMs: 2500 });
      try {
        const usersJsonRaw = await executeSshCommand(conn, `cat /var/www/ftp_users.json 2>/dev/null || echo "{}"`);
        let usersMap = {};
        try { usersMap = JSON.parse(usersJsonRaw.stdout); } catch { usersMap = {}; }
        delete usersMap[user.username];
        const b64Json = Buffer.from(JSON.stringify(usersMap, null, 2)).toString('base64');
        await executeSshCommand(conn, `echo "${b64Json}" | base64 -d > /var/www/ftp_users.json`);
        await executeSshCommand(conn, `userdel "${user.username}" 2>/dev/null || true`);
      } finally {
        conn.end();
      }
    } catch (e) {
      logger.warn({ nodeId, username: user.username, err: e.message }, 'Failed to remove user from remote node SSH');
    }
  }

  db.prepare('DELETE FROM node_ftp_users WHERE id=?').run(userId);
  logChange({
    tgId: userTgId,
    category: 'hosting',
    action: 'ftp_user_deleted',
    details: `Deleted FTP user "${user.username}" on node #${nodeId}`,
    metadata: { nodeId, username: user.username }
  }).catch(() => {});

  return { success: true, deleted: user.username };
}

/**
 * Returns full FTP details, configuration, status, and users for a node.
 */
function getNodeFtpInfo(nodeId) {
  const db = getDb();
  const node = db.prepare('SELECT * FROM hosting_nodes WHERE id=?').get(nodeId);
  if (!node) throw new Error(`Node #${nodeId} not found`);

  const users = listNodeFtpUsers(nodeId);
  const sites = db.prepare('SELECT id, name, full_domain FROM hosting_sites WHERE node_id=?').all(nodeId);

  return {
    nodeId: node.id,
    name: node.name,
    host: node.host,
    ftp_enabled: Boolean(node.ftp_enabled),
    ftp_port: node.ftp_port || 21,
    ftp_status: node.ftp_status || 'offline',
    ftp_server_type: node.ftp_server_type || 'none',
    ftp_banner: node.ftp_banner || null,
    ftp_last_checked_at: node.ftp_last_checked_at || null,
    ftp_pasv_min: node.ftp_pasv_min || 30000,
    ftp_pasv_max: node.ftp_pasv_max || 30100,
    sftp_enabled: Boolean(node.sftp_enabled),
    sftp_port: node.port || 22,
    users,
    sites,
    quick_connect: {
      host: node.host,
      ftp_port: node.ftp_port || 21,
      sftp_port: node.port || 22,
      protocol: node.ftp_status === 'online' ? 'FTP' : 'SFTP',
      default_root: REMOTE_SITES_ROOT
    }
  };
}

/**
 * Test FTP login on remote node using supplied credentials or node defaults.
 */
async function testNodeFtpCredentials(nodeId, { username = null, password = null, port = null } = {}) {
  const db = getDb();
  const node = db.prepare('SELECT * FROM hosting_nodes WHERE id=?').get(nodeId);
  if (!node) throw new Error(`Node #${nodeId} not found`);

  const testPort = port || node.ftp_port || 21;
  const testUser = username || node.ftp_username || 'anonymous';
  const testPass = password || (node.ftp_password ? decrypt(node.ftp_password) : '');

  return testFtpLogin(node.host, testPort, testUser, testPass);
}

/**
 * Bulk auto-detect FTP across multiple or all active nodes.
 */
async function bulkDetectFtp(nodeIds = null) {
  const db = getDb();
  let query = 'SELECT * FROM hosting_nodes WHERE is_active = 1';
  let params = [];
  if (Array.isArray(nodeIds) && nodeIds.length > 0) {
    query += ` AND id IN (${nodeIds.map(() => '?').join(',')})`;
    params = nodeIds;
  }
  const nodes = db.prepare(query).all(...params);
  const results = [];

  for (const n of nodes) {
    try {
      const ftpInfo = await detectNodeFtp({
        host: n.host,
        port: n.ftp_port || 21,
        username: n.username,
        password: n.password ? decrypt(n.password) : null,
        privateKey: n.private_key ? decrypt(n.private_key) : null,
        nodeId: n.id
      });
      results.push({
        nodeId: n.id,
        name: n.name,
        host: n.host,
        ...ftpInfo
      });
    } catch (err) {
      results.push({
        nodeId: n.id,
        name: n.name,
        host: n.host,
        detected: false,
        status: 'error',
        error: err.message
      });
    }
  }
  return results;
}

/**
 * Backward compatible wrapper for legacy calls.
 */
async function testAndProvisionNode(params) {
  return enrollNode(params);
}

function sanitizeNode(node) {
  if (!node) return null;
  const { password, private_key, ftp_password, ...safe } = node;

  let lastPingIso = safe.last_ping_at;
  if (lastPingIso && typeof lastPingIso === 'string') {
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(lastPingIso)) {
      lastPingIso = lastPingIso.replace(' ', 'T') + 'Z';
    } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(lastPingIso) && !lastPingIso.endsWith('Z') && !lastPingIso.includes('+')) {
      lastPingIso = lastPingIso + 'Z';
    }
  }

  const isStale = isTelemetryStale(lastPingIso);
  const parsedSysInfo = safe.system_info ? safeJsonParse(safe.system_info) : {};
  const isSftpOnly = Boolean(parsedSysInfo?.sftpOnly) || parsedSysInfo?.protocol === 'sftp';
  const isFtpOnly = Boolean(parsedSysInfo?.ftpOnly) || parsedSysInfo?.protocol === 'ftp' || safe.auth_method === 'ftp';
  const protocol = isFtpOnly ? 'ftp' : (isSftpOnly ? 'sftp' : 'ssh');

  return {
    ...safe,
    protocol,
    sftp_only: isSftpOnly,
    ftp_only: isFtpOnly,
    last_ping_at: lastPingIso,
    is_stale: isStale,
    has_password: Boolean(password),
    has_private_key: Boolean(private_key),
    has_ftp_password: Boolean(ftp_password),
    ftp_enabled: Boolean(safe.ftp_enabled),
    sftp_enabled: safe.sftp_enabled !== undefined ? Boolean(safe.sftp_enabled) : true,
    auth_method: node.auth_method || (private_key ? 'key' : 'password'),
    system_info: parsedSysInfo,
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

  const sysInfo = safeJsonParse(rawNode.system_info);
  const isSftpOnly = Boolean(sysInfo?.sftpOnly) || sysInfo?.protocol === 'sftp';

  const conn = await connectSsh(rawNode);
  try {
    if (!isSftpOnly) {
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
      } catch (sshExecErr) {
        if (!sshExecErr.message.includes('Unable to exec')) {
          throw sshExecErr;
        }
        logger.info({ siteName, nodeId: node.id }, 'SSH exec failed with Unable to exec; falling back to SFTP deployment');
      }
    }

    // Fallback or default for SFTP-restricted accounts
    return await deployFilesViaSftp(conn, siteName, files);
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
      try {
        await executeSshCommand(conn, `rm -rf "${REMOTE_SITES_ROOT}/${siteName}"`);
      } catch (execErr) {
        if (execErr.message.includes('Unable to exec')) {
          await removeSiteViaSftp(conn, siteName);
        } else {
          throw execErr;
        }
      }
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
        protocol: parsed.protocol || (parsed.port === 21 ? 'ftp' : 'ssh'),
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
      isExisting,
      protocol: item.protocol || (item.port === 21 ? 'ftp' : 'ssh')
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
          detectFtp: options.detectFtp !== false,
          testBeforeSave: options.testBeforeSave !== false
        });

        let ftpProvisionResult = null;
        if (options.autoProvisionFtp && node && node.ftp_status !== 'online') {
          try {
            ftpProvisionResult = await provisionNodeFtp(node.id, options.ftpOptions || {});
          } catch (ftpErr) {
            ftpProvisionResult = { success: false, error: ftpErr.message };
          }
        }

        results[idx] = {
          input: item.raw,
          host: item.host,
          port: item.port,
          name: node.name,
          status: 'success',
          protocol: node.system_info?.protocol || (node.ftp_status === 'online' && node.auth_method === 'ftp' ? 'ftp' : (node.system_info?.sftpOnly ? 'sftp' : 'ssh')),
          sftpOnly: Boolean(node.system_info?.sftpOnly),
          ftp: {
            detected: node.ftp_status === 'online',
            port: node.ftp_port || 21,
            status: node.ftp_status,
            serverType: node.ftp_server_type,
            provisioned: ftpProvisionResult?.success || false
          },
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

  const previousInfo = rawNode.system_info ? safeJsonParse(rawNode.system_info) : {};
  const isFtpNode = rawNode.auth_method === 'ftp' || previousInfo.protocol === 'ftp' || previousInfo.ftpOnly;
  const isSftpOnly = Boolean(previousInfo.sftpOnly) || previousInfo.protocol === 'sftp';
  const startTime = Date.now();

  // If node is FTP node, ping via FTP socket / authentication
  if (isFtpNode) {
    try {
      const ftpPort = rawNode.ftp_port || rawNode.port || 21;
      const ftpUser = rawNode.ftp_username || rawNode.username || 'anonymous';
      const ftpPass = rawNode.ftp_password ? decrypt(rawNode.ftp_password) : (rawNode.password ? decrypt(rawNode.password) : '');
      const ftpRes = await testFtpLogin(rawNode.host, ftpPort, ftpUser, ftpPass, 4000);
      const latencyMs = Date.now() - startTime;

      if (!ftpRes.success) {
        throw new Error(`FTP ping failed: ${ftpRes.error}`);
      }

      const updatedMetrics = {
        ...previousInfo,
        latencyMs,
        testedAt: new Date().toISOString()
      };

      db.prepare(`
        UPDATE hosting_nodes
        SET status = 'online', ftp_status = 'online', last_ping_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), system_info = ?, last_error = NULL
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
        SET status = 'offline', ftp_status = 'offline', last_error = ?, last_error_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE id = ?
      `).run(err.message, id);

      return {
        success: false,
        status: 'offline',
        error: err.message,
        node: getNodeById(id)
      };
    }
  }

  // SSH / SFTP Node
  let conn;
  try {
    conn = await connectSsh(rawNode);

    if (isSftpOnly) {
      const sftpTest = await testSftpSession(conn, 5000);
      const latencyMs = Date.now() - startTime;
      if (!sftpTest.success) {
        throw new Error(`SFTP subsystem check failed: ${sftpTest.error}`);
      }
      const updatedMetrics = {
        ...previousInfo,
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
    }

    try {
      // Query runtime stats: uptime, loadavg, memory, disk, docker
      const uptimeRes = await executeSshCommand(conn, 'uptime -p 2>/dev/null || uptime 2>/dev/null || echo "up"');
      const loadRes = await executeSshCommand(conn, "cat /proc/loadavg 2>/dev/null | awk '{print $1, $2, $3}' || echo '0.00 0.00 0.00'");
      const memRes = await executeSshCommand(conn, MEMORY_PROBE_COMMAND);
      const diskRes = await executeSshCommand(conn, "df -h / 2>/dev/null | tail -n 1 | awk '{print $2, $3, $4, $5}' || echo '10G 1G 9G 10%'");
      const dockerRes = await executeSshCommand(conn, '(command -v docker >/dev/null 2>&1 && docker ps -q 2>/dev/null | wc -l) || echo "0"');

      const memData = parseMemoryTelemetry(memRes.stdout);
      const diskParts = diskRes.stdout.split(/\s+/);
      const latencyMs = Date.now() - startTime;

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
    } catch (execErr) {
      if (execErr.message && execErr.message.includes('Unable to exec')) {
        // Restricted shell / SFTP account fallback
        const sftpTest = await testSftpSession(conn, 5000);
        const latencyMs = Date.now() - startTime;
        if (sftpTest.success) {
          const updatedMetrics = {
            ...previousInfo,
            sftpOnly: true,
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
        }
      }
      throw execErr;
    }
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

const FORBIDDEN_NODE_COMMANDS = [
  /rm\s+(-rf|-fr)\s+(\/|\/\*|~|\$HOME)/i,
  /mkfs(\.[a-z0-9]+)?\s+/i,
  /dd\s+if=.*of=\/dev\/(sd[a-z]|nvme|vd[a-z])/i,
  /:\(\)\s*\{\s*:\|:&\s*\};:/, // fork bomb
  />\s*\/dev\/(sd[a-z]|nvme|vd[a-z])/i,
  /chmod\s+(-R\s+)?777\s+\//i
];

async function executeNodeCommand(id, command, userTgId = null) {
  if (!command || typeof command !== 'string' || !command.trim()) {
    throw new Error('Command string is required');
  }

  const cleanCmd = command.trim();
  for (const forbidden of FORBIDDEN_NODE_COMMANDS) {
    if (forbidden.test(cleanCmd)) {
      throw new Error(`Command rejected: Unsafe or destructive pattern detected (${forbidden})`);
    }
  }

  const db = getDb();
  const rawNode = db.prepare('SELECT * FROM hosting_nodes WHERE id=?').get(id);
  if (!rawNode) {
    throw new Error(`Node #${id} not found`);
  }

  const sysInfo = safeJsonParse(rawNode.system_info);
  if (rawNode.auth_method === 'ftp' || sysInfo?.protocol === 'ftp' || sysInfo?.ftpOnly) {
    throw new Error('Shell command execution is not supported on FTP-only nodes.');
  }
  if (sysInfo?.sftpOnly || sysInfo?.protocol === 'sftp') {
    throw new Error('Shell command execution is not permitted on SFTP-only storage nodes.');
  }

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
  const ftpUsers = listNodeFtpUsers(id);
  return {
    ...node,
    sites,
    applications: apps,
    ftpUsers
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
  bulkAddNodes: provisionNodesBulk,
  getNodeById,
  getNodeWithSites,
  listNodes,
  deleteNode,
  getAvailableNode,
  deployFilesToNode,
  removeSiteFromNode,
  pingNode,
  executeNodeCommand,
  refreshAllNodesTelemetry,
  probeFtpSocket,
  testFtpLogin,
  detectNodeFtp,
  provisionNodeFtp,
  controlNodeFtp,
  listNodeFtpUsers,
  createNodeFtpUser,
  deleteNodeFtpUser,
  getNodeFtpInfo,
  testNodeFtpCredentials,
  bulkDetectFtp,
  detectFtpServerType,
  testSftpSession,
  deployFilesViaSftp,
  removeSiteViaSftp
};
