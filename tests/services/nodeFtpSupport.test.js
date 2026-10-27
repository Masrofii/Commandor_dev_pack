'use strict';
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = ':memory:';
process.env.SESSION_SECRET = 'test-secret';
process.env.JWT_SECRET = 'test-jwt';
process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const net = require('net');
const { initDatabase, runMigrations, closeDatabase, getDb } = require('../../database/database');
const { decrypt } = require('../../src/utils/encryption');
const {
  parseNodeConnectionString,
  parseBulkConnectionStrings,
  validateBulkNodes,
  enrollNode,
  getNodeById,
  getNodeWithSites,
  getNodeFtpInfo,
  createNodeFtpUser,
  deleteNodeFtpUser,
  listNodeFtpUsers,
  probeFtpSocket,
  testFtpLogin,
  detectNodeFtp,
  bulkDetectFtp,
  controlNodeFtp,
  testNodeConnection,
  pingNode,
  executeNodeCommand,
  testSftpSession,
  deployFilesViaSftp,
  provisionNodesBulk
} = require('../../src/services/nodeManagerService');

let mockFtpServer = null;
let mockFtpPort = 0;

beforeAll(async () => {
  initDatabase();
  runMigrations();
  getDb().prepare("INSERT INTO users(tg_id, username, role) VALUES(1001, 'tester', 'user')").run();
  getDb().prepare("INSERT INTO users(tg_id, username, role) VALUES(9999, 'admin1', 'admin')").run();

  // Create local in-memory mock FTP server for socket tests
  await new Promise((resolve) => {
    mockFtpServer = net.createServer((sock) => {
      sock.write('220 Welcome to Commandor Test FTP\r\n');
      let authedUser = null;
      sock.on('data', (buf) => {
        const text = buf.toString('utf8').trim();
        if (text.startsWith('USER')) {
          const parts = text.split(' ');
          authedUser = parts[1] || '';
          sock.write('331 Password required\r\n');
        } else if (text.startsWith('PASS')) {
          const parts = text.split(' ');
          const pass = parts[1] || '';
          if (authedUser === 'testuser' && pass === 'secret123') {
            sock.write('230 User logged in\r\n');
          } else if (authedUser === 'anonymous') {
            sock.write('230 Anonymous login ok\r\n');
          } else {
            sock.write('530 Login incorrect\r\n');
          }
        } else if (text.startsWith('QUIT')) {
          sock.write('221 Goodbye\r\n');
          sock.end();
        } else {
          sock.write('200 OK\r\n');
        }
      });
    });

    mockFtpServer.listen(0, '127.0.0.1', () => {
      mockFtpPort = mockFtpServer.address().port;
      resolve();
    });
  });
});

afterAll(async () => {
  if (mockFtpServer) {
    await new Promise((resolve) => mockFtpServer.close(resolve));
  }
  closeDatabase();
});

describe('FTP Connection String Parsing & Scheme Detection', () => {
  test('parses ftp:// scheme with host and port', () => {
    const res = parseNodeConnectionString('ftp://admin:ftpPass@192.168.1.50:21#FtpNodeAlpha');
    expect(res.protocol).toBe('ftp');
    expect(res.host).toBe('192.168.1.50');
    expect(res.port).toBe(21);
    expect(res.username).toBe('admin');
    expect(res.password).toBe('ftpPass');
    expect(res.name).toBe('FtpNodeAlpha');
  });

  test('parses ftp:// scheme without explicit port and defaults to 21', () => {
    const res = parseNodeConnectionString('ftp://webuser:pass123@vps.cloud.net#WebFTP');
    expect(res.protocol).toBe('ftp');
    expect(res.host).toBe('vps.cloud.net');
    expect(res.port).toBe(21);
    expect(res.username).toBe('webuser');
    expect(res.password).toBe('pass123');
  });

  test('parses sftp:// scheme and defaults to port 22', () => {
    const res = parseNodeConnectionString('sftp://root:sftpSecret@10.10.0.5#SftpProduction');
    expect(res.protocol).toBe('sftp');
    expect(res.host).toBe('10.10.0.5');
    expect(res.port).toBe(22);
    expect(res.username).toBe('root');
    expect(res.password).toBe('sftpSecret');
  });

  test('parses colon format with port 21 as ftp protocol', () => {
    const res = parseNodeConnectionString('192.168.1.200:21:ftpadmin:SuperPass');
    expect(res.protocol).toBe('ftp');
    expect(res.port).toBe(21);
    expect(res.username).toBe('ftpadmin');
    expect(res.password).toBe('SuperPass');
  });

  test('bulk connection strings parser preserves protocol and labels', () => {
    const input = `
      # FTP Server
      ftp://ftp_user:pass1@10.0.0.1#NodeFTP
      // Standard SSH
      root:ssh_pass@10.0.0.2:22#NodeSSH
    `;
    const parsed = parseBulkConnectionStrings(input);
    expect(parsed.length).toBe(2);
    expect(parsed[0].protocol).toBe('ftp');
    expect(parsed[0].port).toBe(21);
    expect(parsed[1].protocol).toBe('ssh');
    expect(parsed[1].port).toBe(22);
  });
});

describe('FTP Network Probing & Authentication', () => {
  test('probeFtpSocket detects mock FTP server and returns 220 banner', async () => {
    const probe = await probeFtpSocket('127.0.0.1', mockFtpPort, 2000);
    expect(probe.connected).toBe(true);
    expect(probe.isFtp).toBe(true);
    expect(probe.banner).toContain('220 Welcome to Commandor Test FTP');
  });

  test('probeFtpSocket gracefully handles closed port without crashing', async () => {
    const probe = await probeFtpSocket('127.0.0.1', 59999, 500);
    expect(probe.connected).toBe(false);
    expect(probe.isFtp).toBe(false);
  });

  test('testFtpLogin succeeds with valid credentials against mock FTP server', async () => {
    const res = await testFtpLogin('127.0.0.1', mockFtpPort, 'testuser', 'secret123');
    expect(res.success).toBe(true);
    expect(res.message).toContain('FTP login successful');
  });

  test('testFtpLogin rejects invalid password gracefully', async () => {
    const res = await testFtpLogin('127.0.0.1', mockFtpPort, 'testuser', 'wrongpassword');
    expect(res.success).toBe(false);
    expect(res.error).toContain('FTP authentication failed');
  });
});

describe('Node FTP Auto-Detection & Database Persistence', () => {
  let createdNodeId;

  beforeAll(async () => {
    const node = await enrollNode({
      name: 'FTP-Test-Node',
      host: '127.0.0.1',
      port: 22,
      username: 'root',
      password: 'rootpassword',
      ftpPort: mockFtpPort,
      testBeforeSave: false
    });
    createdNodeId = node.id;
  });

  test('detectNodeFtp detects mock FTP server and updates node record in database', async () => {
    const res = await detectNodeFtp({
      host: '127.0.0.1',
      port: mockFtpPort,
      nodeId: createdNodeId
    });

    expect(res.detected).toBe(true);
    expect(res.status).toBe('online');
    expect(res.port).toBe(mockFtpPort);
    expect(res.banner).toContain('220 Welcome to Commandor Test FTP');

    // Verify DB updated
    const dbNode = getDb().prepare('SELECT ftp_status, ftp_port, ftp_enabled FROM hosting_nodes WHERE id=?').get(createdNodeId);
    expect(dbNode.ftp_status).toBe('online');
    expect(dbNode.ftp_port).toBe(mockFtpPort);
    expect(dbNode.ftp_enabled).toBe(1);
  });

  test('bulkDetectFtp scans nodes and returns status reports', async () => {
    const results = await bulkDetectFtp([createdNodeId]);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(1);
    expect(results[0].nodeId).toBe(createdNodeId);
    expect(results[0].detected).toBe(true);
    expect(results[0].status).toBe('online');
  });
});

describe('FTP User Account Management & Encryption', () => {
  let nodeId;

  beforeAll(async () => {
    const node = await enrollNode({
      name: 'User-Test-Node',
      host: '10.200.0.1',
      port: 22,
      username: 'root',
      password: 'rootpassword',
      testBeforeSave: false
    });
    nodeId = node.id;
  });

  test('creates FTP user with encrypted password in database', async () => {
    const plainPass = 'MyUltraSecretFtpPass123!';
    const user = await createNodeFtpUser(nodeId, {
      username: 'ftp_developer',
      password: plainPass,
      rootPath: '/var/www/nodesites/app1',
      permissions: 'rw'
    });

    expect(user).toBeDefined();
    expect(user.username).toBe('ftp_developer');
    expect(user.root_path).toBe('/var/www/nodesites/app1');
    expect(user.permissions).toBe('rw');

    // Verify stored password in database is encrypted
    const row = getDb().prepare('SELECT password FROM node_ftp_users WHERE id=?').get(user.id);
    expect(row.password).not.toBe(plainPass);
    expect(decrypt(row.password)).toBe(plainPass);
  });

  test('prevents creating duplicate FTP username on same node', async () => {
    await expect(createNodeFtpUser(nodeId, {
      username: 'ftp_developer',
      password: 'anotherpassword'
    })).rejects.toThrow('already exists on node');
  });

  test('validates username formatting', async () => {
    await expect(createNodeFtpUser(nodeId, {
      username: 'ab', // too short
      password: 'validpassword'
    })).rejects.toThrow('Invalid FTP username');

    await expect(createNodeFtpUser(nodeId, {
      username: 'bad username with spaces',
      password: 'validpassword'
    })).rejects.toThrow('Invalid FTP username');
  });

  test('listNodeFtpUsers retrieves accounts for node', () => {
    const users = listNodeFtpUsers(nodeId);
    expect(Array.isArray(users)).toBe(true);
    expect(users.length).toBe(1);
    expect(users[0].username).toBe('ftp_developer');
    expect(users[0].password).toBeUndefined(); // password not selected
  });

  test('getNodeFtpInfo returns comprehensive FTP connection details and accounts', () => {
    const info = getNodeFtpInfo(nodeId);
    expect(info.nodeId).toBe(nodeId);
    expect(info.quick_connect).toBeDefined();
    expect(info.quick_connect.host).toBe('10.200.0.1');
    expect(info.quick_connect.ftp_port).toBeDefined();
    expect(info.quick_connect.sftp_port).toBe(22);
    expect(info.users.length).toBe(1);
  });

  test('getNodeWithSites includes ftpUsers array', () => {
    const withSites = getNodeWithSites(nodeId);
    expect(withSites).toBeDefined();
    expect(Array.isArray(withSites.ftpUsers)).toBe(true);
    expect(withSites.ftpUsers.length).toBe(1);
  });

  test('deleteNodeFtpUser successfully deletes FTP account', async () => {
    const users = listNodeFtpUsers(nodeId);
    expect(users.length).toBe(1);
    const userId = users[0].id;

    const res = await deleteNodeFtpUser(nodeId, userId);
    expect(res.success).toBe(true);

    const remaining = listNodeFtpUsers(nodeId);
    expect(remaining.length).toBe(0);
  });
});

describe('Auto-Detection of FTP & SFTP without explicit scheme (host:port:user:pass)', () => {
  test('testNodeConnection auto-detects FTP server on custom port without ftp:// scheme', async () => {
    // User passes host:port:user:pass without any scheme
    const res = await testNodeConnection({
      host: '127.0.0.1',
      port: mockFtpPort,
      username: 'testuser',
      password: 'secret123',
      timeoutMs: 3000
    });

    expect(res.success).toBe(true);
    expect(res.protocol).toBe('ftp');
    expect(res.systemInfo.protocol).toBe('ftp');
    expect(res.systemInfo.ftpOnly).toBe(true);
    expect(res.ftp.detected).toBe(true);
    expect(res.ftp.status).toBe('online');
    expect(res.ftp.port).toBe(mockFtpPort);
  });

  test('enrollNode automatically enrolls FTP node with testBeforeSave=true', async () => {
    const node = await enrollNode({
      name: 'Auto-Detected-FTP-Node',
      host: '127.0.0.1',
      port: mockFtpPort,
      username: 'testuser',
      password: 'secret123',
      testBeforeSave: true
    });

    expect(node).toBeDefined();
    expect(node.status).toBe('online');
    expect(node.ftp_enabled).toBe(true);
    expect(node.ftp_status).toBe('online');
    expect(node.ftp_port).toBe(mockFtpPort);
    expect(node.auth_method).toBe('ftp');
    expect(node.system_info.protocol).toBe('ftp');

    // Pinging this FTP node works
    const pingRes = await pingNode(node.id);
    expect(pingRes.success).toBe(true);
    expect(pingRes.status).toBe('online');

    // Executing arbitrary bash command on FTP node fails gracefully
    await expect(executeNodeCommand(node.id, 'ls -la')).rejects.toThrow('Shell command execution is not supported on FTP-only nodes');
  });

  test('provisionNodesBulk auto-detects and provisions plain host:port:user:pass as FTP node', async () => {
    const bulkInput = `127.0.0.1:${mockFtpPort}:testuser:secret123 # Cluster-FTP-Node`;
    const summary = await provisionNodesBulk(bulkInput);

    expect(summary.total).toBe(1);
    expect(summary.successful).toBe(1);
    expect(summary.failed).toBe(0);
    expect(summary.results[0].status).toBe('success');
    expect(summary.results[0].protocol).toBe('ftp');
    expect(summary.results[0].ftp.detected).toBe(true);
  });

  test('testSftpSession inspects SFTP subsystem properly on simulated SFTP connection', async () => {
    const mockConn = {
      sftp: (cb) => {
        const mockSftp = {
          readdir: (path, readCb) => {
            readCb(null, [{ filename: 'test.txt' }, { filename: 'upload' }]);
          }
        };
        cb(null, mockSftp);
      }
    };

    const res = await testSftpSession(mockConn, 2000);
    expect(res.success).toBe(true);
    expect(res.filesCount).toBe(2);
  });

  test('deployFilesViaSftp deploys buffers to remote directory via SFTP without shell execution', async () => {
    const uploadedFiles = {};
    const createdDirs = new Set();

    const mockConn = {
      sftp: (cb) => {
        const mockSftp = {
          mkdir: (dir, mkCb) => {
            createdDirs.add(dir);
            mkCb(null);
          },
          writeFile: (path, buf, wrCb) => {
            uploadedFiles[path] = buf.toString('utf8');
            wrCb(null);
          }
        };
        cb(null, mockSftp);
      }
    };

    const files = [
      { name: 'index.html', content: '<h1>SFTP Deployment</h1>' },
      { name: 'css/style.css', content: 'body { color: red; }' }
    ];

    const deployRes = await deployFilesViaSftp(mockConn, 'mysite', files);
    expect(deployRes.success).toBe(true);
    expect(deployRes.filesCount).toBe(2);
    expect(uploadedFiles['/var/www/nodesites/mysite/index.html']).toBe('<h1>SFTP Deployment</h1>');
    expect(uploadedFiles['/var/www/nodesites/mysite/css/style.css']).toBe('body { color: red; }');
  });
});
